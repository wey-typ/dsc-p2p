import { useState, useEffect } from "react";
import { useGame } from "../state";
import { CardView } from "../components/CardView";
import { HowToPlay } from "./HowToPlay";
import {
  sonarPosition,
  suggestPlay,
  type Card,
  type TaskState,
  type Communication,
  type Suggestion,
} from "@dsc/shared";

function sameCard(a: Card, b: Card) {
  return a.suit === b.suit && a.value === b.value;
}

const POSITION_LABEL = { highest: "▲ highest", only: "● only", lowest: "▼ lowest" } as const;

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
  const { view, room, play, communicate, startGame, endGame, pause, resume, leave, youId } = useGame();
  // All hooks must run unconditionally (before any early return).
  const [sonarMode, setSonarMode] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [hint, setHint] = useState<Suggestion | null>(null);

  // Clear a shown hint whenever the table state advances (turn or trick changes).
  useEffect(() => {
    setHint(null);
  }, [view?.turn, view?.trick.plays.length, view?.phase]);

  if (!view || !room) return null;

  const paused = room.paused && view.phase === "playing";
  const yourTurn = view.turn === view.youSeat && view.phase === "playing" && !paused;
  const isHost = room.hostId === youId;
  const legal = (card: Card) => view.legalMoves.some((c) => sameCard(c, card));
  const nameOf = (seat: number) => view.players[seat]?.name ?? `Seat ${seat}`;
  const signalFor = (seat: number): Communication | undefined =>
    view.communications.find((c) => c.seat === seat);
  const isOffline = (seat: number): boolean =>
    room.players.find((p) => p.seat === seat)?.connected === false;

  const canSonar = view.youCanCommunicate && !paused;
  if (sonarMode && !canSonar) setSonarMode(false);

  function onCardTap(card: Card) {
    if (sonarMode) {
      if (sonarPosition(view!.hand, card)) {
        communicate(card);
        setSonarMode(false);
      }
      return;
    }
    if (yourTurn && legal(card)) play(card);
  }

  return (
    <div className="screen game">
      {/* Top control bar */}
      <div className="game-bar">
        <span className="game-mission">
          {room.campaignName} · Mission {room.level + 1}
        </span>
        <span className="game-controls">
          {yourTurn && (
            <button className="btn chip gold" onClick={() => setHint(suggestPlay(view))}>
              💡 Hint
            </button>
          )}
          <button className="btn chip" onClick={() => setShowHelp(true)} aria-label="How to play">
            ? Help
          </button>
          {isHost && view.phase === "playing" && (
            <>
              {room.paused ? (
                <button className="btn chip" onClick={resume}>▶ Resume</button>
              ) : (
                <button className="btn chip" onClick={pause}>⏸ Pause</button>
              )}
              <button className="btn chip danger" onClick={endGame}>■ End</button>
            </>
          )}
        </span>
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
              isOffline(p.seat) ? "offline" : "",
            ].join(" ")}
          >
            <span className="pc-name">{isOffline(p.seat) ? "⚠ " : ""}{p.name}</span>
            <span className="pc-meta">
              {p.seat === view.commander ? "⚓ " : ""}
              {view.handCounts[p.seat]} cards
            </span>
            {signalFor(p.seat) && (
              <span className="pc-signal">
                <CardView card={signalFor(p.seat)!.card} small />
                <span className="pc-signal-pos">{POSITION_LABEL[signalFor(p.seat)!.position]}</span>
              </span>
            )}
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

      {/* Last completed trick (stays visible so you can see what everyone played) */}
      {view.lastTrick && view.lastTrick.plays.length > 0 && (
        <div className="lasttrick-area">
          <div className="section-label">
            Last trick — won by{" "}
            <strong className="lt-winner">{nameOf(view.lastTrickWinner ?? -1)}</strong>
          </div>
          <div className="trick">
            {view.lastTrick.plays.map((pl) => (
              <div
                key={`lt-${pl.seat}-${pl.card.suit}-${pl.card.value}`}
                className={`trick-play ${pl.seat === view.lastTrickWinner ? "lt-won" : ""}`}
              >
                <CardView card={pl.card} small />
                <span className="trick-player">
                  {pl.seat === view.lastTrickWinner ? "🏆 " : ""}
                  {nameOf(pl.seat)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hint banner (cheat advisor) */}
      {hint && hint.reason && (
        <div className="hint-banner" onClick={() => setHint(null)}>
          💡 {hint.reason}
        </div>
      )}

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
        <div className="hand-head">
          <span className="section-label">
            {sonarMode ? "Sonar — tap your highest / only / lowest card" : "Your hand"}
          </span>
          {canSonar && (
            <button
              className={`btn chip ${sonarMode ? "danger" : ""}`}
              onClick={() => setSonarMode((m) => !m)}
            >
              {sonarMode ? "Cancel" : "📡 Sonar"}
            </button>
          )}
          {!canSonar && view.sonarUsed[view.youSeat] && (
            <span className="sonar-spent">📡 used</span>
          )}
        </div>
        <div className="hand">
          {view.hand.map((card) => {
            const sonarOk = sonarMode && sonarPosition(view.hand, card) !== null;
            const playOk = !sonarMode && yourTurn && legal(card);
            const hinted = !sonarMode && hint?.card != null && sameCard(hint.card, card);
            return (
              <CardView
                key={`${card.suit}-${card.value}`}
                card={card}
                onClick={sonarOk || playOk ? () => onCardTap(card) : undefined}
                disabled={sonarMode ? !sonarOk : view.phase !== "playing" || !yourTurn || !legal(card)}
                selected={sonarOk || hinted}
              />
            );
          })}
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

      {showHelp && <HowToPlay onClose={() => setShowHelp(false)} />}
    </div>
  );
}
