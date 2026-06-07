/**
 * Tiny sound-effects engine using the Web Audio API. No audio files are loaded — every
 * effect is synthesized from short oscillator tones, so it adds ~zero load and no network
 * requests (keeps mobile performance high). Honors a per-device on/off toggle.
 */

let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean): void {
  enabled = on;
}

function audio(): AudioContext | null {
  if (!enabled) return null;
  if (!ctx) {
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** One short tone with a quick attack/decay envelope. */
function tone(
  c: AudioContext,
  freq: number,
  start: number,
  dur: number,
  type: OscillatorType = "sine",
  peak = 0.07
): void {
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

/** Play a named effect (no-op if sound is off or audio is unavailable). */
export function playSfx(name: Sfx): void {
  const c = audio();
  if (!c) return;
  const t = c.currentTime;
  switch (name) {
    case "play": // a soft card "tap"
      tone(c, 230, t, 0.09, "triangle", 0.05);
      break;
    case "trick": // trick resolved — quick two-note
      tone(c, 330, t, 0.1, "triangle", 0.05);
      tone(c, 440, t + 0.08, 0.12, "triangle", 0.05);
      break;
    case "task": // task completed — pleasant ding up
      tone(c, 660, t, 0.12, "sine", 0.06);
      tone(c, 990, t + 0.1, 0.16, "sine", 0.06);
      break;
    case "turn": // your turn — gentle prompt
      tone(c, 520, t, 0.1, "sine", 0.05);
      tone(c, 690, t + 0.09, 0.12, "sine", 0.05);
      break;
    case "sonar": // sonar ping
      tone(c, 880, t, 0.5, "sine", 0.05);
      tone(c, 1320, t + 0.02, 0.3, "sine", 0.025);
      break;
    case "win": // ascending arpeggio
      [523, 659, 784, 1047].forEach((f, i) => tone(c, f, t + i * 0.12, 0.18, "triangle", 0.06));
      break;
    case "lose": // descending, lower
      [392, 311, 247].forEach((f, i) => tone(c, f, t + i * 0.16, 0.28, "sawtooth", 0.045));
      break;
  }
}
