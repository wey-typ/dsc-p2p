import { useState } from "react";
import { useGame } from "../state";
import { Leaderboard } from "./Leaderboard";
import { HowToPlay } from "./HowToPlay";
import { History } from "./History";
import { BotLab } from "./BotLab";

export function Home() {
  const { createRoom, joinRoom, connected } = useGame();
  const [name, setName] = useState("");
  const [crew, setCrew] = useState("");
  const [code, setCode] = useState("");
  const [mode, setMode] = useState<"menu" | "join">("menu");
  const [busy, setBusy] = useState(false);
  const [showBoard, setShowBoard] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showBotLab, setShowBotLab] = useState(false);

  const nameOk = name.trim().length > 0;

  async function onCreate() {
    if (!nameOk) return;
    setBusy(true);
    await createRoom(name.trim(), crew.trim() || undefined);
    setBusy(false);
  }
  async function onJoin() {
    if (!nameOk || code.trim().length < 4) return;
    setBusy(true);
    await joinRoom(code.trim(), name.trim());
    setBusy(false);
  }

  return (
    <div className="screen home">
      <header className="brand">
        <div className="brand-mark">🤿</div>
        <h1>Deep Sea Crew</h1>
        <p className="tagline">A cooperative dive. Win together, or not at all.</p>
      </header>

      <div className="panel">
        <label className="field">
          <span>Your diver name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Captain Reef"
            maxLength={16}
            autoComplete="off"
          />
        </label>

        {mode === "menu" ? (
          <div className="stack">
            <label className="field">
              <span>Crew name (optional — saves your progress)</span>
              <input
                value={crew}
                onChange={(e) => setCrew(e.target.value)}
                placeholder="e.g. The Anglerfish"
                maxLength={24}
                autoComplete="off"
              />
            </label>
            <button className="btn primary" disabled={!nameOk || busy || !connected} onClick={onCreate}>
              Create a crew
            </button>
            <button className="btn ghost" disabled={!nameOk} onClick={() => setMode("join")}>
              Join with a code
            </button>
          </div>
        ) : (
          <div className="stack">
            <label className="field">
              <span>Room code</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABCD"
                maxLength={4}
                className="code-input"
                autoCapitalize="characters"
                autoComplete="off"
              />
            </label>
            <button
              className="btn primary"
              disabled={!nameOk || code.trim().length < 4 || busy || !connected}
              onClick={onJoin}
            >
              Dive in
            </button>
            <button className="btn ghost" onClick={() => setMode("menu")}>
              Back
            </button>
          </div>
        )}
      </div>
      <div className="home-links">
        <button className="btn link" onClick={() => setShowHelp(true)}>
          🤿 How to play
        </button>
        <button className="btn link" onClick={() => setShowBoard(true)}>
          🏅 Leaderboard
        </button>
        <button className="btn link" onClick={() => setShowHistory(true)}>
          📜 History
        </button>
        <button className="btn link" onClick={() => setShowBotLab(true)}>
          🤖 Bot Lab
        </button>
      </div>
      <p className="hint">Everyone must be on the same Wi-Fi. 2–5 divers.</p>
      {showBoard && <Leaderboard onClose={() => setShowBoard(false)} />}
      {showHelp && <HowToPlay onClose={() => setShowHelp(false)} />}
      {showHistory && <History onClose={() => setShowHistory(false)} />}
      {showBotLab && <BotLab onClose={() => setShowBotLab(false)} />}
    </div>
  );
}
