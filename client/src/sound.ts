/**
 * Audio engine using the Web Audio API. No audio files are loaded — every sound (effects
 * and the ambient background music) is synthesized live, so it adds ~zero load and no
 * network requests (keeps mobile performance high). SFX and music have independent toggles.
 */

let ctx: AudioContext | null = null;
let sfxEnabled = true;
let musicEnabled = true;

/** Lazily create / resume the shared AudioContext (needs a user gesture to start on mobile). */
function getCtx(): AudioContext | null {
  if (!ctx) {
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

// ---------- Sound effects ----------

export function setSoundEnabled(on: boolean): void {
  sfxEnabled = on;
}

function tone(c: AudioContext, freq: number, start: number, dur: number, type: OscillatorType = "sine", peak = 0.07): void {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

export type Sfx = "play" | "trick" | "task" | "win" | "lose" | "turn" | "sonar";

export function playSfx(name: Sfx): void {
  if (!sfxEnabled) return;
  const c = getCtx();
  if (!c) return;
  const t = c.currentTime;
  switch (name) {
    case "play":
      tone(c, 230, t, 0.09, "triangle", 0.05);
      break;
    case "trick":
      tone(c, 330, t, 0.1, "triangle", 0.05);
      tone(c, 440, t + 0.08, 0.12, "triangle", 0.05);
      break;
    case "task":
      tone(c, 660, t, 0.12, "sine", 0.06);
      tone(c, 990, t + 0.1, 0.16, "sine", 0.06);
      break;
    case "turn":
      tone(c, 520, t, 0.1, "sine", 0.05);
      tone(c, 690, t + 0.09, 0.12, "sine", 0.05);
      break;
    case "sonar":
      tone(c, 880, t, 0.5, "sine", 0.05);
      tone(c, 1320, t + 0.02, 0.3, "sine", 0.025);
      break;
    case "win":
      [523, 659, 784, 1047].forEach((f, i) => tone(c, f, t + i * 0.12, 0.18, "triangle", 0.06));
      break;
    case "lose":
      [392, 311, 247].forEach((f, i) => tone(c, f, t + i * 0.16, 0.28, "sawtooth", 0.045));
      break;
  }
}

// ---------- Ambient ocean background music ----------
// A soft, slowly-evolving chord pad behind a gentle low-pass filter, with a slow swell —
// calm and "underwater". Very low gain so it never competes with the game.

interface Bgm {
  master: GainNode;
  filter: BiquadFilterNode;
  oscs: OscillatorNode[];
  swell: OscillatorNode;
  chordTimer: number;
  chordIdx: number;
}
let bgm: Bgm | null = null;

// A few calm, watery chords (Hz). Cycled slowly for gentle evolution.
const CHORDS: number[][] = [
  [110.0, 164.81, 220.0, 277.18], // A minor-ish pad
  [98.0, 146.83, 196.0, 246.94], // G pad
  [123.47, 164.81, 246.94, 293.66], // B-ish pad
];

export function setMusicEnabled(on: boolean): void {
  musicEnabled = on;
  if (on) startBgm();
  else stopBgm();
}

export function startBgm(): void {
  if (!musicEnabled || bgm) return;
  const c = getCtx();
  if (!c) return;

  const master = c.createGain();
  master.gain.setValueAtTime(0.0001, c.currentTime);
  master.gain.linearRampToValueAtTime(0.05, c.currentTime + 4); // gentle fade-in

  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 650;
  filter.Q.value = 0.6;
  filter.connect(master).connect(c.destination);

  // Slow amplitude swell (like distant waves).
  const swell = c.createOscillator();
  const swellGain = c.createGain();
  swell.frequency.value = 0.05; // ~20s cycle
  swellGain.gain.value = 0.02;
  swell.connect(swellGain).connect(master.gain);
  swell.start();

  const oscs = CHORDS[0]!.map((f) => {
    const o = c.createOscillator();
    o.type = "sine";
    o.frequency.value = f;
    const g = c.createGain();
    g.gain.value = 0.25;
    o.connect(g).connect(filter);
    o.start();
    return o;
  });

  bgm = { master, filter, oscs, swell, chordTimer: 0, chordIdx: 0 };

  // Drift between chords every ~18s with smooth glides.
  bgm.chordTimer = window.setInterval(() => {
    const c2 = ctx;
    if (!bgm || !c2) return;
    bgm.chordIdx = (bgm.chordIdx + 1) % CHORDS.length;
    const chord = CHORDS[bgm.chordIdx]!;
    bgm.oscs.forEach((o, i) => {
      const f = chord[i] ?? chord[chord.length - 1]!;
      o.frequency.linearRampToValueAtTime(f, c2.currentTime + 6);
    });
  }, 18000);
}

export function stopBgm(): void {
  if (!bgm || !ctx) return;
  const { master, oscs, swell, chordTimer } = bgm;
  clearInterval(chordTimer);
  const now = ctx.currentTime;
  master.gain.cancelScheduledValues(now);
  master.gain.setValueAtTime(master.gain.value, now);
  master.gain.linearRampToValueAtTime(0.0001, now + 1.5);
  const stopAt = now + 1.7;
  oscs.forEach((o) => o.stop(stopAt));
  swell.stop(stopAt);
  bgm = null;
}

/** Resume audio + (re)start BGM — call from a user gesture to satisfy autoplay rules. */
export function unlockAudio(): void {
  getCtx();
  if (musicEnabled) startBgm();
}
