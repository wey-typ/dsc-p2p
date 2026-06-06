import { useState } from "react";
import { useGame } from "../state";

export function Home() {
  const { createRoom, joinRoom, connected } = useGame();
  const [name, setName] = useState("");
  const [crew, setCrew] = useState("");
  const [code, setCode] = useState("");
  const [mode, setMode] = useState<"menu" | "join">("menu");
  const [busy, setBusy] = useState(false);

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
      <p className="hint">Everyone must be on the same Wi-Fi. 2–5 divers.</p>
    </div>
  );
}
