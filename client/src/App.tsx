import { useGame } from "./state";
import { Home } from "./screens/Home";
import { Lobby } from "./screens/Lobby";
import { Game } from "./screens/Game";
import { Toast } from "./components/Toast";

export function App() {
  const { room, connected } = useGame();

  let screen;
  if (!room) screen = <Home />;
  else if (room.phase === "lobby") screen = <Lobby />;
  else screen = <Game />;

  return (
    <div className="app">
      <div className="ocean-bg" aria-hidden />
      {!connected && <div className="conn-banner">Connecting to crew server…</div>}
      {screen}
      <Toast />
    </div>
  );
}
