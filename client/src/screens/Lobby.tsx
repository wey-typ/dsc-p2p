import { useGame } from "../state";

export function Lobby() {
  const { room, youId, startGame, addBot, removeBot, leave } = useGame();
  if (!room) return null;
  const isHost = room.hostId === youId;
  const canStart = room.players.length >= room.minPlayers;
  const botCount = room.players.filter((p) => p.isBot).length;
  const roomFull = room.players.length >= room.maxPlayers;

  return (
    <div className="screen lobby">
      <header className="lobby-head">
        <button className="btn link" onClick={leave}>
          ← Leave
        </button>
        <div className="code-badge">
          <span>Room code</span>
          <strong>{room.code}</strong>
        </div>
      </header>

      <div className="campaign-banner">
        <span className="cb-name">🚩 {room.campaignName}</span>
        <span className="cb-stats">
          Mission {room.level + 1} · {room.cleared} cleared · {room.attempts} attempts
        </span>
      </div>

      <h2>Crew ({room.players.length}/{room.maxPlayers})</h2>
      <ul className="crew-list">
        {room.players.map((p) => (
          <li key={p.id} className={p.connected ? "" : "offline"}>
            <span className="diver-dot" />
            <span className="diver-name">{p.name}</span>
            {p.isBot && <span className="tag bot">bot</span>}
            {p.id === room.hostId && <span className="tag">host</span>}
            {p.id === youId && <span className="tag you">you</span>}
          </li>
        ))}
        {Array.from({ length: room.maxPlayers - room.players.length }).map((_, i) => (
          <li key={`empty-${i}`} className="empty-seat">
            <span className="diver-dot ghost" />
            <span className="diver-name muted">waiting…</span>
          </li>
        ))}
      </ul>

      {isHost && (
        <div className="bot-controls">
          <button className="btn chip" disabled={roomFull} onClick={addBot}>
            + Add bot
          </button>
          <button className="btn chip" disabled={botCount === 0} onClick={removeBot}>
            − Remove bot
          </button>
        </div>
      )}

      {isHost ? (
        <button className="btn primary big" disabled={!canStart} onClick={() => startGame()}>
          {canStart ? `Begin Mission ${room.level + 1}` : `Need ${room.minPlayers - room.players.length} more`}
        </button>
      ) : (
        <p className="hint center">Waiting for the host to begin the dive…</p>
      )}
    </div>
  );
}
