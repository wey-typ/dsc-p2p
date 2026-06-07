import { useRef, useState } from "react";
import type { Card, PlayerView } from "@dsc/shared";
import { HostController, GuestController } from "./session";
import { createHostPeer, createGuestPeer } from "./rtc";
import { encodeSignal, decodeSignal } from "./signaling";
import type { P2PRoom } from "./protocol";
import { Board } from "./Board";

type Role = "host" | "guest" | null;

export function App() {
  const [role, setRole] = useState<Role>(null);
  const [name, setName] = useState("");
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [room, setRoom] = useState<P2PRoom | null>(null);
  const [view, setView] = useState<PlayerView | null>(null);

  // connection codes
  const [offerCode, setOfferCode] = useState(""); // host shows / guest pastes
  const [answerCode, setAnswerCode] = useState(""); // guest shows / host pastes
  const [pasteOffer, setPasteOffer] = useState("");
  const [pasteAnswer, setPasteAnswer] = useState("");

  const hostRef = useRef<HostController | null>(null);
  const guestRef = useRef<GuestController | null>(null);
  const hostPeerRef = useRef<Awaited<ReturnType<typeof createHostPeer>> | null>(null);

  const flash = (m: string) => {
    setError(m);
    setTimeout(() => setError(null), 3500);
  };

  async function startHosting() {
    if (!name.trim()) return;
    setRole("host");
    const host = new HostController(name.trim(), {
      onHostView: setView,
      onRoom: setRoom,
      onError: flash,
    });
    hostRef.current = host;
    try {
      const peer = await createHostPeer();
      hostPeerRef.current = peer;
      setOfferCode(encodeSignal(peer.offer));
      peer.ready.then((t) => {
        host.attachGuest(t);
        setConnected(true);
      });
    } catch {
      flash("Couldn't start WebRTC on this device/browser.");
    }
  }

  async function hostAcceptAnswer() {
    try {
      await hostPeerRef.current?.accept(decodeSignal(pasteAnswer));
    } catch {
      flash("That answer code didn't look right.");
    }
  }

  async function startJoining() {
    if (!name.trim()) return;
    setRole("guest");
  }

  async function guestUseOffer() {
    try {
      const gp = await createGuestPeer(decodeSignal(pasteOffer));
      setAnswerCode(encodeSignal(gp.answer));
      gp.ready.then((t) => {
        guestRef.current = new GuestController(t, name.trim(), {
          onView: setView,
          onRoom: setRoom,
          onError: flash,
        });
        setConnected(true);
      });
    } catch {
      flash("That offer code didn't look right.");
    }
  }

  const play = (c: Card) => (role === "host" ? hostRef.current?.play(c) : guestRef.current?.play(c));
  const communicate = (c: Card) =>
    role === "host" ? hostRef.current?.communicateHost(c) : guestRef.current?.communicate(c);

  // ---------- render ----------
  let screen;
  if (!role) {
    screen = <Home name={name} setName={setName} onHost={startHosting} onJoin={startJoining} />;
  } else if (!connected) {
    screen =
      role === "host" ? (
        <HostConnect offerCode={offerCode} pasteAnswer={pasteAnswer} setPasteAnswer={setPasteAnswer} onConnect={hostAcceptAnswer} />
      ) : (
        <GuestConnect
          pasteOffer={pasteOffer}
          setPasteOffer={setPasteOffer}
          onUseOffer={guestUseOffer}
          answerCode={answerCode}
        />
      );
  } else if (!room || room.phase === "lobby") {
    screen = (
      <Lobby room={room} isHost={role === "host"} onStart={(lv) => hostRef.current?.start(lv)} onSetLevel={(lv) => hostRef.current?.setLevel(lv)} />
    );
  } else {
    screen = (
      <Board
        view={view}
        room={room}
        isHost={role === "host"}
        onPlay={play}
        onCommunicate={communicate}
        onRestart={() => hostRef.current?.restart()}
        onStart={(lv) => hostRef.current?.start(lv)}
      />
    );
  }

  return (
    <div className="app">
      <div className="ocean-bg" aria-hidden />
      {screen}
      {error && <div className="toast" onClick={() => setError(null)}>{error}</div>}
    </div>
  );
}

function Home({ name, setName, onHost, onJoin }: { name: string; setName: (v: string) => void; onHost: () => void; onJoin: () => void }) {
  return (
    <div className="screen home">
      <header className="brand">
        <div className="brand-mark">🤿</div>
        <h1>Deep Sea Crew</h1>
        <p className="tagline">Peer-to-peer · 2 players · no server</p>
      </header>
      <div className="panel">
        <label className="field">
          <span>Your diver name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Captain Reef" maxLength={16} />
        </label>
        <button className="btn primary" disabled={!name.trim()} onClick={onHost}>Host a game</button>
        <button className="btn ghost" disabled={!name.trim()} onClick={onJoin}>Join a game</button>
      </div>
      <p className="hint">Host & guest connect directly. No Wi-Fi router or server needed — you exchange a short connection code.</p>
    </div>
  );
}

function CodeBox({ label, code }: { label: string; code: string }) {
  const copy = () => {
    if (navigator.share) navigator.share({ text: code }).catch(() => navigator.clipboard?.writeText(code));
    else navigator.clipboard?.writeText(code).catch(() => {});
  };
  return (
    <div className="field">
      <span>{label}</span>
      <textarea className="code-area" readOnly value={code} onFocus={(e) => e.currentTarget.select()} />
      <button className="btn ghost small" onClick={copy} disabled={!code}>Copy / Share</button>
    </div>
  );
}

function HostConnect({ offerCode, pasteAnswer, setPasteAnswer, onConnect }: { offerCode: string; pasteAnswer: string; setPasteAnswer: (v: string) => void; onConnect: () => void }) {
  return (
    <div className="screen">
      <div className="panel">
        <h2>1 · Send this to your friend</h2>
        {offerCode ? <CodeBox label="Your invite code" code={offerCode} /> : <p className="hint">Preparing connection…</p>}
        <h2>2 · Paste their answer code</h2>
        <textarea className="code-area" value={pasteAnswer} onChange={(e) => setPasteAnswer(e.target.value)} placeholder="Paste the answer code here" />
        <button className="btn primary" disabled={!pasteAnswer.trim()} onClick={onConnect}>Connect</button>
        <p className="hint">Waiting for your friend to connect…</p>
      </div>
    </div>
  );
}

function GuestConnect({ pasteOffer, setPasteOffer, onUseOffer, answerCode }: { pasteOffer: string; setPasteOffer: (v: string) => void; onUseOffer: () => void; answerCode: string }) {
  return (
    <div className="screen">
      <div className="panel">
        <h2>1 · Paste the host's invite code</h2>
        <textarea className="code-area" value={pasteOffer} onChange={(e) => setPasteOffer(e.target.value)} placeholder="Paste the invite code here" />
        <button className="btn primary" disabled={!pasteOffer.trim() || !!answerCode} onClick={onUseOffer}>Generate answer</button>
        {answerCode && (
          <>
            <h2>2 · Send this answer back to the host</h2>
            <CodeBox label="Your answer code" code={answerCode} />
            <p className="hint">Once the host pastes it, the game connects.</p>
          </>
        )}
      </div>
    </div>
  );
}

function Lobby({ room, isHost, onStart, onSetLevel }: { room: P2PRoom | null; isHost: boolean; onStart: (lv: number) => void; onSetLevel: (lv: number) => void }) {
  const level = room?.level ?? 0;
  const ready = (room?.players.length ?? 0) >= 2;
  return (
    <div className="screen">
      <div className="panel">
        <h2>Crew</h2>
        <ul className="crew">{room?.players.map((p) => <li key={p.seat}>🤿 {p.name}</li>)}</ul>
        <div className="level-row">
          {isHost && <button className="btn chip" disabled={level <= 0} onClick={() => onSetLevel(level - 1)}>−</button>}
          <span className="level-label">Level {level + 1}</span>
          {isHost && <button className="btn chip" disabled={level >= 8} onClick={() => onSetLevel(level + 1)}>+</button>}
        </div>
        {isHost ? (
          <button className="btn primary" disabled={!ready} onClick={() => onStart(level)}>
            {ready ? "Begin the dive" : "Waiting for your friend…"}
          </button>
        ) : (
          <p className="hint">Waiting for the host to begin…</p>
        )}
      </div>
    </div>
  );
}
