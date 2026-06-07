import { useState, useEffect } from "react";
import { useGame } from "./state";
import { Home } from "./screens/Home";
import { Lobby } from "./screens/Lobby";
import { Game } from "./screens/Game";
import { Settings } from "./screens/Settings";
import { Toast } from "./components/Toast";

const ANIM_KEY = "dsc.animations";

function readAnimSetting(): boolean {
  try {
    return localStorage.getItem(ANIM_KEY) !== "off";
  } catch {
    return true;
  }
}

export function App() {
  const { room, connected } = useGame();
  const [animOn, setAnimOn] = useState(readAnimSetting);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(ANIM_KEY, animOn ? "on" : "off");
    } catch {
      /* ignore (private mode) */
    }
  }, [animOn]);

  let screen;
  if (!room) screen = <Home />;
  else if (room.phase === "lobby") screen = <Lobby />;
  else screen = <Game />;

  return (
    <div className={`app ${animOn ? "" : "no-anim"}`}>
      <div className="ocean-bg" aria-hidden />
      {!connected && <div className="conn-banner">Connecting to crew server…</div>}
      <button className="settings-gear" onClick={() => setShowSettings(true)} aria-label="Settings">
        ⚙
      </button>
      {screen}
      <Toast />
      {showSettings && (
        <Settings animOn={animOn} setAnimOn={setAnimOn} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}
