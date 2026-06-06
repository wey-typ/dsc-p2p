import { useGame } from "../state";
import { CardView } from "../components/CardView";
import type { Card, TaskState } from "@dsc/shared";

function sameCard(a: Card, b: Card) {
  return a.suit === b.suit && a.value === b.value;
}

function constraintLabel(t: TaskState): string | null {
  switch (t.constraint.kind) {
    case "relative":
      return `▸ order ${t.constraint.order}`;
    case "absolute":
      return `① #${t.constraint.order}`;
    case "last":
      return "Ω last";
    default:
      return null;
  }
}

export function Game() {
  const { view, room, play, startGame, endGame, pause, resume, leave, youId } = useGame();
  if (!view || !room) return null;

  const paused = room.paused && view.phase === "playing";
  const yourTurn = view.turn === view.youSeat && view.phase === "playing" && !paused;
  const isHost = room.hostId === youId;
  const legal = (card: Card) => view.legalMoves.some((c) => sameCard(c, card));
  const nameOf = (seat: number) => view.players[seat]?.name ?? `Seat ${seat}`;

  return (
    <div className="screen game">
      {/* Top control bar */}
      <div className="game-bar">
        <span className="game-mission">
          {room.campaignName} · Mission {room.level + 1}
        </span>
        {isHost && view.phase === "playing" && (
          <span className="game-controls">
            {room.paused ? (
              <button className="btn chip" onClick={resume}>▶ Resume</button>
            ) : (
              <button className="btn chip" onClick={pause}>⏸ Pause</button>
            )}
            <button className="btn chip danger" onClick={endGame}>■ End</button>
          </span>
        )}
      </div>

      {/* Player strip */}
      <div className="players-strip">
        {view.players.map((p) => (
          <div
            key={p.seat}
            className={[
              "player-chip",
              view.turn === p.seat ? "active" : "",
              p.seat === view.youSeat ? "self" : "",
            ].join(" ")}
          >
            <span className="pc-name">{p.name}</span>
            <span className="pc-meta">
              {p.seat === view.commander ? "⚓ " : ""}
              {view.handCounts[p.seat]} cards
            </span>
          </div>
        ))}
      </div>

      {/* Tasks */}
      <div className="tasks">
        <div className="section-label">
          Tasks · {view.completedCount}/{view.taskTotal}
        </div>
        <div className="task-row">
          {view.tasks.map((t) => (
            <div key={t.id} className={`task task-${t.status}`}>
              <CardView card={t.card} small />
              <div className="task-info">
                <span className="task-owner">{nameOf(t.owner)}</span>
                {constraintLabel(t) && <span className="task-constraint">{constraintLabel(t)}</span>}
              </div>
              {t.status === "done" && <span className="task-check">✓</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Current trick */}
      <div className="trick-area">
        <div className="section-label">
          Trick {view.trickNumber + (view.phase === "playing" ? 1 : 0)}
        </div>
        <div className="trick">
          {view.trick.plays.length === 0 && <div className="trick-empty">No cards played yet</div>}
          {view.trick.plays.map((pl) => (
            <div key={`${pl.seat}-${pl.card.suit}-${pl.card.value}`} className="trick-play">
              <CardView card={pl.card} small />
              <span className="trick-player">{nameOf(pl.seat)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Turn banner */}
      <div className={`turn-banner ${yourTurn ? "your-turn" : ""}`}>
        {view.phase !== "playing"
          ? view.phase === "won"
            ? "Mission complete!"
            : "Mission failed"
          : yourTurn
            ? "Your turn — play a card"
            : `Waiting for ${nameOf(view.turn)}…`}
      </div>

      {/* Your hand */}
      <div className="hand-area">
        <div className="section-label">Your hand</div>
        <div className="hand">
          {view.hand.map((card) => (
            <CardView
              key={`${card.suit}-${card.value}`}
              card={card}
              onClick={yourTurn && legal(card) ? () => play(card) : undefined}
              disabled={view.phase !== "playing" || !yourTurn || !legal(card)}
            />
          ))}
        </div>
      </div>

      {/* Paused overlay */}
      {paused && (
        <div className="overlay paused">
          <div className="overlay-card">
            <div className="overlay-emoji">⏸</div>
            <h2>Paused</h2>
            <p className="hint center">
              {isHost ? "Resume when the crew is ready." : "Waiting for the host to resume…"}
            </p>
            {isHost && (
              <button className="btn primary" onClick={resume}>
                Resume dive
              </button>
            )}
          </div>
        </div>
      )}

      {/* End overlay */}
      {view.phase !== "playing" && (
        <div className={`overlay ${view.phase}`}>
          <div className="overlay-card">
            <div className="overlay-emoji">{view.phase === "won" ? "🏆" : "🌊"}</div>
            <h2>{view.phase === "won" ? "Mission Complete" : "Mission Failed"}</h2>
            {view.phase === "won" && <p className="fail-reason">Next dive: Mission {room.level + 1}</p>}
            {view.phase === "lost" && view.failReason && <p className="fail-reason">{view.failReason}</p>}
            <div className="stack">
              {isHost ? (
                <>
                  <button className="btn primary" onClick={() => startGame()}>
                    {view.phase === "won" ? `Begin Mission ${room.level + 1}` : "Retry mission"}
                  </button>
                  <button className="btn ghost" onClick={endGame}>
                    Back to lobby
                  </button>
                </>
              ) : (
                <p className="hint center">Waiting for the host…</p>
              )}
              <button className="btn link" onClick={leave}>
                Leave crew
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
