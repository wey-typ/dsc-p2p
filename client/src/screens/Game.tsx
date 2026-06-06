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
  const { view, room, play, restart, leave, youId } = useGame();
  if (!view || !room) return null;

  const yourTurn = view.turn === view.youSeat && view.phase === "playing";
  const isHost = room.hostId === youId;
  const legal = (card: Card) => view.legalMoves.some((c) => sameCard(c, card));
  const nameOf = (seat: number) => view.players[seat]?.name ?? `Seat ${seat}`;

  return (
    <div className="screen game">
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

      {/* End overlay */}
      {view.phase !== "playing" && (
        <div className={`overlay ${view.phase}`}>
          <div className="overlay-card">
            <div className="overlay-emoji">{view.phase === "won" ? "🏆" : "🌊"}</div>
            <h2>{view.phase === "won" ? "Mission Complete" : "Mission Failed"}</h2>
            {view.failReason && <p className="fail-reason">{view.failReason}</p>}
            <div className="stack">
              {isHost ? (
                <button className="btn primary" onClick={restart}>
                  Back to lobby
                </button>
              ) : (
                <p className="hint center">Waiting for the host…</p>
              )}
              <button className="btn ghost" onClick={leave}>
                Leave crew
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
