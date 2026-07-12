import { useEffect, useRef, useState } from "react";
import { MAX_LEVEL, type Card, type PlayerView } from "@dsc/shared";
import { HostController, GuestController, type SavedHostState } from "./session";
import { createHostPeer, createGuestPeer } from "./rtc";
import { encodeSignal, decodeSignal } from "./signaling";
import type { P2PRoom } from "./protocol";
import { Board } from "./Board";
import { checkForAppUpdate } from "./update";
import { QrCode } from "./QrCode";
import { QrScanner } from "./QrScanner";

const HOST_KEY = "dsc.p2p.host";
function getGuestId(): string {
  try {
    let id = localStorage.getItem("dsc.p2p.guestId");
    if (!id) { id = "g-" + Math.random().toString(36).slice(2, 10); localStorage.setItem("dsc.p2p.guestId", id); }
    return id;
  } catch { return "g-" + Math.random().toString(36).slice(2, 10); }
}
function saveHost(s: SavedHostState): void { try { localStorage.setItem(HOST_KEY, JSON.stringify(s)); } catch { /* */ } }
function loadHost(): SavedHostState | null { try { const r = localStorage.getItem(HOST_KEY); return r ? (JSON.parse(r) as SavedHostState) : null; } catch { return null; } }

export function App() {
  const [role, setRole] = useState<"host" | "guest" | null>(null);
  const [name, setName] = useState("");
  const [room, setRoom] = useState<P2PRoom | null>(null);
  const [view, setView] = useState<PlayerView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [inviting, setInviting] = useState(false);
  const [offerCode, setOfferCode] = useState("");
  const [pasteAnswer, setPasteAnswer] = useState("");
  const [pasteOffer, setPasteOffer] = useState("");
  const [answerCode, setAnswerCode] = useState("");
  const [lost, setLost] = useState(false);
  const [scan, setScan] = useState<null | "offer" | "answer">(null);
  const [shareApp, setShareApp] = useState(false);

  const guestId = useRef(getGuestId());
  const hostRef = useRef<HostController | null>(null);
  const guestRef = useRef<GuestController | null>(null);
  const hostPeerRef = useRef<Awaited<ReturnType<typeof createHostPeer>> | null>(null);
  const hasSaved = useRef(loadHost());

  const flash = (m: string) => { setError(m); setTimeout(() => setError(null), 3500); };

  // ---- host ----
  function makeHost(restore?: SavedHostState) {
    const h = new HostController(restore?.players[0]?.name ?? name.trim() ?? "Host", {
      onHostView: setView,
      onRoom: setRoom,
      onError: flash,
      onChange: () => saveHost(h.serialize()),
    });
    if (restore) h.restore(restore);
    hostRef.current = h;
    setRole("host");
    void openInvite();
  }
  async function openInvite() {
    setInviting(true); setOfferCode(""); setPasteAnswer("");
    try {
      const peer = await createHostPeer();
      hostPeerRef.current = peer;
      setOfferCode(await encodeSignal(peer.offer));
      peer.ready.then((t) => { hostRef.current?.attachGuest(t); setInviting(false); });
    } catch { flash("WebRTC unavailable on this browser."); setInviting(false); }
  }
  async function hostAccept(code?: string) {
    try { await hostPeerRef.current?.accept(await decodeSignal(code ?? pasteAnswer)); }
    catch { flash("That answer code didn't look right."); }
  }

  // ---- guest ----
  async function guestUseOffer(code?: string) {
    try {
      const gp = await createGuestPeer(await decodeSignal(code ?? pasteOffer));
      setAnswerCode(await encodeSignal(gp.answer));
      gp.ready.then((t) => {
        t.onClose(() => setLost(true));
        guestRef.current = new GuestController(t, name.trim(), guestId.current, { onView: setView, onRoom: setRoom, onError: flash });
        setLost(false); setAnswerCode("");
      });
    } catch { flash("That invite code didn't look right."); }
  }

  const play = (c: Card) => (role === "host" ? hostRef.current?.play(c) : guestRef.current?.play(c));
  const communicate = (c: Card) => (role === "host" ? hostRef.current?.communicateHost(c) : guestRef.current?.communicate(c));

  // ---- render ----
  let screen: React.ReactNode = null;
  if (!role) {
    screen = <Home name={name} setName={setName} onHost={() => name.trim() && makeHost()} onJoin={() => name.trim() && setRole("guest")} canResume={!!hasSaved.current?.game} onResume={() => makeHost(hasSaved.current!)} onShare={() => setShareApp(true)} />;
  } else if (role === "host") {
    const playing = !!room && room.phase !== "lobby" && !!view;
    screen = (
      <>
        <HostBar room={room} onInvite={openInvite} playing={playing} onEnd={() => hostRef.current?.restart()} />
        {playing ? (
          <Board view={view} room={room!} isHost onPlay={play} onCommunicate={communicate} onRestart={() => hostRef.current?.restart()} onStart={(lv) => hostRef.current?.start(lv)} />
        ) : (
          <HostLobby room={room} onSetLevel={(lv) => hostRef.current?.setLevel(lv)} onStart={(lv) => hostRef.current?.start(lv)} onAddBot={() => hostRef.current?.addBot()} onRemoveBot={() => hostRef.current?.removeBot()} />
        )}
      </>
    );
  } else {
    // guest
    if (lost) {
      screen = <GuestConnect title="Reconnect" subtitle="Ask the host to tap Invite again, then scan it." pasteOffer={pasteOffer} setPasteOffer={setPasteOffer} onUse={() => guestUseOffer()} answerCode={answerCode} onScan={() => setScan("offer")} />;
    } else if (!room) {
      screen = <GuestConnect title="Join a game" pasteOffer={pasteOffer} setPasteOffer={setPasteOffer} onUse={() => guestUseOffer()} answerCode={answerCode} onScan={() => setScan("offer")} />;
    } else if (room.phase === "lobby") {
      screen = <div className="screen"><div className="panel"><h2>Connected!</h2><ul className="crew">{room.players.map((p) => <li key={p.seat}>🤿 {p.name}</li>)}</ul><p className="hint">Waiting for the host to begin…</p></div></div>;
    } else if (view) {
      screen = <Board view={view} room={room} isHost={false} onPlay={play} onCommunicate={communicate} onRestart={() => {}} onStart={() => {}} />;
    }
  }

  return (
    <div className="app">
      <div className="ocean-bg" aria-hidden />
      {screen}
      {inviting && (
        <InviteOverlay offerCode={offerCode} pasteAnswer={pasteAnswer} setPasteAnswer={setPasteAnswer} onAccept={() => hostAccept()} onScan={() => setScan("answer")} onClose={() => setInviting(false)} />
      )}
      {scan && (
        <QrScanner onClose={() => setScan(null)} onResult={(text) => {
          setScan(null);
          if (scan === "answer") { setPasteAnswer(text); void hostAccept(text); }
          else { setPasteOffer(text); void guestUseOffer(text); }
        }} />
      )}
      {shareApp && <ShareApp onClose={() => setShareApp(false)} />}
      {error && <div className="toast" onClick={() => setError(null)}>{error}</div>}
    </div>
  );
}

function Home({ name, setName, onHost, onJoin, canResume, onResume, onShare }: { name: string; setName: (v: string) => void; onHost: () => void; onJoin: () => void; canResume: boolean; onResume: () => void; onShare: () => void }) {
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  return (
    <div className="screen home">
      <header className="brand"><div className="brand-mark">🤿</div><h1>Deep Sea Crew</h1><p className="tagline">Peer-to-peer · 2–5 players · no server</p></header>
      <div className="panel">
        <label className="field"><span>Your diver name</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Captain Reef" maxLength={16} /></label>
        <button className="btn primary" disabled={!name.trim()} onClick={onHost}>Host a game</button>
        <button className="btn ghost" disabled={!name.trim()} onClick={onJoin}>Join a game</button>
        {canResume && <button className="btn ghost" onClick={onResume}>↩︎ Resume your hosted game</button>}
      </div>
      <button className="btn link" onClick={onShare}>📤 Share this game (QR)</button>
      <p className="hint">Connect directly — no Wi-Fi router or server. Add players (and reconnect dropped ones) by sharing a code or QR.</p>
      <p className="version">
        {__BUILD_INFO__}
        <button className="btn link update-btn" onClick={() => void checkForAppUpdate(setUpdateStatus)}>
          🔄 Check for update
        </button>
      </p>
      {updateStatus && <p className="update-status">{updateStatus}</p>}
    </div>
  );
}

/** Shows a QR of the app's own URL so others can scan → open → install the game. */
function ShareApp({ onClose }: { onClose: () => void }) {
  const url = window.location.origin + window.location.pathname;
  const canShare = typeof navigator.share === "function";
  const share = () => {
    if (canShare) navigator.share({ title: "Deep Sea Crew", text: "Play Deep Sea Crew with me!", url }).catch(() => {});
    else navigator.clipboard?.writeText(url).catch(() => {});
  };
  return (
    <div className="overlay">
      <div className="ocard invite">
        <h2>Share the game</h2>
        <QrCode data={url} />
        <p className="hint center">Scan with a phone camera to open the game, then add it to the home screen.</p>
        <p className="hint" style={{ wordBreak: "break-all", textAlign: "center" }}>{url}</p>
        <button className="btn primary" onClick={share}>{canShare ? "Share link" : "Copy link"}</button>
        <button className="btn link" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

function HostBar({
  room,
  onInvite,
  playing = false,
  onEnd,
}: {
  room: P2PRoom | null;
  onInvite: () => void;
  playing?: boolean;
  onEnd?: () => void;
}) {
  // "■ End" needs a second tap to confirm; the armed state disarms after a moment.
  const [confirmEnd, setConfirmEnd] = useState(false);
  useEffect(() => {
    if (!confirmEnd) return;
    const t = setTimeout(() => setConfirmEnd(false), 3500);
    return () => clearTimeout(t);
  }, [confirmEnd]);

  return (
    <div className="hostbar">
      <span className="hb-crew">Crew: {room?.players.map((p) => p.name).join(", ") || "—"}</span>
      <span className="hb-actions">
        <button className="btn chip" onClick={onInvite}>➕ Invite / Reconnect</button>
        {playing && onEnd && (
          confirmEnd ? (
            <button
              className="btn chip danger confirm-end"
              onClick={() => {
                setConfirmEnd(false);
                onEnd();
              }}
            >
              ⚠ Confirm end?
            </button>
          ) : (
            <button className="btn chip danger" onClick={() => setConfirmEnd(true)}>■ End</button>
          )
        )}
      </span>
    </div>
  );
}

function HostLobby({ room, onSetLevel, onStart, onAddBot, onRemoveBot }: { room: P2PRoom | null; onSetLevel: (lv: number) => void; onStart: (lv: number) => void; onAddBot: () => void; onRemoveBot: () => void }) {
  const level = room?.level ?? 0;
  const count = room?.players.length ?? 1;
  const ready = count >= 2;
  const hasBot = !!room?.players.some((p) => p.name.endsWith("(bot)"));
  return (
    <div className="screen">
      <div className="panel">
        <h2>Crew ({count}/5)</h2>
        <ul className="crew">{room?.players.map((p) => <li key={p.seat}>{p.name.endsWith("(bot)") ? "🤖" : "🤿"} {p.name}{p.seat === 0 ? " · host" : ""}</li>)}</ul>
        <div className="level-row">
          <button className="btn chip" disabled={count >= 5} onClick={onAddBot}>+ Bot</button>
          <button className="btn chip" disabled={!hasBot} onClick={onRemoveBot}>− Bot</button>
        </div>
        <div className="level-row">
          <button className="btn chip" disabled={level <= 0} onClick={() => onSetLevel(level - 1)}>−</button>
          <span className="level-label">Level {level + 1}</span>
          <button className="btn chip" disabled={level >= MAX_LEVEL} onClick={() => onSetLevel(level + 1)}>+</button>
        </div>
        <button className="btn primary" disabled={!ready} onClick={() => onStart(level)}>{ready ? "Begin the dive" : "Add a bot or invite a diver"}</button>
      </div>
    </div>
  );
}

function CodeBox({ label, code }: { label: string; code: string }) {
  const copy = () => { if (navigator.share) navigator.share({ text: code }).catch(() => {}); else navigator.clipboard?.writeText(code).catch(() => {}); };
  return (
    <div className="field"><span>{label}</span><textarea className="code-area" readOnly value={code} onFocus={(e) => e.currentTarget.select()} /><button className="btn ghost small" onClick={copy} disabled={!code}>Copy / Share</button></div>
  );
}

function InviteOverlay({ offerCode, pasteAnswer, setPasteAnswer, onAccept, onScan, onClose }: { offerCode: string; pasteAnswer: string; setPasteAnswer: (v: string) => void; onAccept: () => void; onScan: () => void; onClose: () => void }) {
  return (
    <div className="overlay"><div className="ocard invite">
      <h2>Invite a diver</h2>
      {offerCode ? (<><QrCode data={offerCode} /><p className="hint center">They scan this (or use the code), then send their answer.</p><CodeBox label="Invite code" code={offerCode} /></>) : <p className="hint">Preparing…</p>}
      <h3>Get their answer</h3>
      <button className="btn primary" onClick={onScan}>📷 Scan their answer</button>
      <details><summary className="hint">…or paste the answer code</summary>
        <textarea className="code-area" value={pasteAnswer} onChange={(e) => setPasteAnswer(e.target.value)} placeholder="Paste answer code" />
        <button className="btn ghost" disabled={!pasteAnswer.trim()} onClick={onAccept}>Connect</button>
      </details>
      <button className="btn link" onClick={onClose}>Close</button>
    </div></div>
  );
}

function GuestConnect({ title, subtitle, pasteOffer, setPasteOffer, onUse, answerCode, onScan }: { title: string; subtitle?: string; pasteOffer: string; setPasteOffer: (v: string) => void; onUse: () => void; answerCode: string; onScan: () => void }) {
  return (
    <div className="screen"><div className="panel">
      <h2>{title}</h2>
      {subtitle && <p className="hint">{subtitle}</p>}
      {!answerCode ? (<>
        <button className="btn primary" onClick={onScan}>📷 Scan host's invite</button>
        <details><summary className="hint">…or paste the invite code</summary>
          <textarea className="code-area" value={pasteOffer} onChange={(e) => setPasteOffer(e.target.value)} placeholder="Paste invite code" />
          <button className="btn ghost" disabled={!pasteOffer.trim()} onClick={onUse}>Generate answer</button>
        </details>
      </>) : (<>
        <h3>Show this answer to the host</h3>
        <QrCode data={answerCode} />
        <p className="hint center">Host scans this (or use the code). Then you're in.</p>
        <CodeBox label="Answer code" code={answerCode} />
      </>)}
    </div></div>
  );
}
