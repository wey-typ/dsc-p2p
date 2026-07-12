import { useState, useEffect, useRef } from "react";
import { useGame } from "../state";
import { CardView } from "../components/CardView";
import { HowToPlay } from "./HowToPlay";
import { ShareRoom } from "./ShareRoom";
import { playSfx } from "../sound";
import {
  sonarPosition,
  suggestPlay,
  describeObjective,
  describeModifier,
  type Card,
  type TaskState,
  type Communication,
  type Suggestion,
} from "@dsc/shared";

function sameCard(a: Card, b: Card) {
  return a.suit === b.suit && a.value === b.value;
}

const POSITION_LABEL = { highest: "▲ highest", only: "● only", lowest: "▼ lowest" } as const;

const OBJECTIVE_EMOJI = {
  winTrick: "🥇",
  winExactly: "🎯",
  avoidColor: "🚫",
} as const;

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
  const { view, room, play, communicate, distress, distressPick, startGame, endGame, pause, resume, leave, youId } = useGame();
  // All hooks must run unconditionally (before any early return).
  const [sonarMode, setSonarMode] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [hint, setHint] = useState<Suggestion | null>(null);
  const [distressAsk, setDistressAsk] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [baseUrl, setBaseUrl] = useState(() => window.location.origin);

  // Base URL for the invite QR/link (LAN address locally, public URL in the cloud).
  useEffect(() => {
    fetch("/api/lan")
      .then((r) => r.json())
      .then((d: { baseUrl?: string }) => {
        if (d.baseUrl) setBaseUrl(d.baseUrl);
      })
      .catch(() => {});
  }, []);

  // "■ End" needs a second tap to confirm; the armed state disarms after a moment.
  useEffect(() => {
    if (!confirmEnd) return;
    const t = setTimeout(() => setConfirmEnd(false), 3500);
    return () => clearTimeout(t);
  }, [confirmEnd]);

  const sfxPrev = useRef({ plays: 0, trickNo: 0, completed: 0, comms: 0, phase: "", yourTurn: false, init: false });

  // Clear a shown hint whenever the table state advances (turn or trick changes).
  useEffect(() => {
    setHint(null);
  }, [view?.turn, view?.trick.plays.length, view?.phase]);

  // Sound effects on meaningful state changes (first run only snapshots, no sound).
  useEffect(() => {
    if (!view) return;
    const p = sfxPrev.current;
    const yt = view.turn === view.youSeat && view.phase === "playing";
    const snap = () => {
      sfxPrev.current = {
        plays: view.trick.plays.length,
        trickNo: view.trickNumber,
        completed: view.doneCount,
        comms: view.communications.length,
        phase: view.phase,
        yourTurn: yt,
        init: true,
      };
    };
    if (!p.init) return snap();
    if (view.trick.plays.length > p.plays) playSfx("play");
    if (view.trickNumber > p.trickNo) playSfx("trick");
    if (view.doneCount > p.completed) playSfx("task");
    if (view.communications.length > p.comms) playSfx("sonar");
    if (view.phase === "won" && p.phase !== "won") playSfx("win");
    if (view.phase === "lost" && p.phase !== "lost") playSfx("lose");
    if (yt && !p.yourTurn) playSfx("turn");
    snap();
  }, [view]);

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

  // Distress: you're in pick mode while a signal is pending and you haven't passed yet.
  const distressPicking = view.distress !== null && !view.distress.youPicked && view.phase === "playing" && !paused;

  function onCardTap(card: Card) {
    if (distressPicking) {
      if (card.suit !== "sub") distressPick(card);
      return;
    }
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
      {/* Top control bar (sticky so Hint/Help/Pause/End stay reachable while scrolled) */}
      <div className="game-bar">
        <span className="game-mission">
          {room.campaignName} · Mission {room.level + 1}
        </span>
        <span className="game-controls">
          <button
            className="btn chip"
            onClick={() => setShowShare(true)}
            aria-label="Show room code and QR"
          >
            ▣ {room.code}
          </button>
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
              {confirmEnd ? (
                <button
                  className="btn chip danger confirm-end"
                  onClick={() => {
                    setConfirmEnd(false);
                    endGame();
                  }}
                >
                  ⚠ Confirm end?
                </button>
              ) : (
                <button className="btn chip danger" onClick={() => setConfirmEnd(true)}>
                  ■ End
                </button>
              )}
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
              {view.handCounts[p.seat]} cards · 🏆{view.tricksWon[p.seat] ?? 0}
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
          Tasks · {view.doneCount}/{view.taskTotal}
          {view.comms !== "open" && (
            <span className="comms-note">
              {view.comms === "silent" ? " · 📡 sonar DEAD" : " · 📡 sonar after trick 2"}
            </span>
          )}
        </div>
        {view.modifiers.length > 0 && (
          <div className="modifier-list">
            {view.modifiers.map((m, i) => (
              <div key={i} className="modifier-chip">
                {describeModifier(m)}
              </div>
            ))}
          </div>
        )}
        <div className="task-row">
          {view.tasks.map((t) => (
            <div key={t.id} className={`task task-${t.status}`}>
              {t.card ? (
                <CardView card={t.card} small />
              ) : (
                <span className="task-objective" title={describeObjective(t.objective)}>
                  <span className="task-obj-emoji">
                    {OBJECTIVE_EMOJI[t.objective.kind as keyof typeof OBJECTIVE_EMOJI] ?? "⭐"}
                  </span>
                  <span className="task-obj-text">{describeObjective(t.objective)}</span>
                </span>
              )}
              <div className="task-info">
                <span className="task-owner">{nameOf(t.owner)}</span>
                {constraintLabel(t) && <span className="task-constraint">{constraintLabel(t)}</span>}
              </div>
              {t.status === "done" && <span className="task-check">✓</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Distress signal — fire (host) or pass a card (everyone) */}
      {view.canDistress && isHost && !paused && (
        <div className="distress-area">
          {!distressAsk ? (
            <button className="btn chip danger" onClick={() => setDistressAsk(true)}>
              🆘 Distress signal
            </button>
          ) : (
            <span className="distress-ask">
              Every diver passes one card…
              <button className="btn chip" onClick={() => { distress("left"); setDistressAsk(false); }}>
                ⬅ Pass left
              </button>
              <button className="btn chip" onClick={() => { distress("right"); setDistressAsk(false); }}>
                Pass right ➡
              </button>
              <button className="btn chip" onClick={() => setDistressAsk(false)}>Cancel</button>
            </span>
          )}
        </div>
      )}
      {view.distress && (
        <div className="hint-banner distress-banner">
          🆘 Distress signal — every diver passes one card to the{" "}
          {view.distress.direction === "left" ? "left ⬅" : "right ➡"}.{" "}
          {view.distress.youPicked
            ? `Waiting for ${view.distress.waitingSeats.map(nameOf).join(", ")}…`
            : "Tap the card you want to pass (submarines can't be passed)."}
        </div>
      )}

      {/* Current trick */}
      <div className="trick-area">
        <div className="section-label">
          Trick {view.trickNumber + (view.phase === "playing" ? 1 : 0)}
          {view.undertowTrick && view.phase === "playing" && (
            <span className="modifier-note undertow"> · 🌀 UNDERTOW — lowest card wins, subs sink!</span>
          )}
          {view.commanderBanActive && view.phase === "playing" && (
            <span className="modifier-note"> · ⚓ {nameOf(view.commander)} must NOT win this trick</span>
          )}
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
      <div className={`turn-banner ${yourTurn || distressPicking ? "your-turn" : ""}`}>
        {view.phase !== "playing"
          ? view.phase === "won"
            ? "Mission complete!"
            : "Mission failed"
          : view.distress
            ? distressPicking
              ? "🆘 Pick a card to pass"
              : "🆘 Waiting for the crew to pass cards…"
            : yourTurn
              ? "Your turn — play a card"
              : `Waiting for ${nameOf(view.turn)}…`}
      </div>

      {/* Your hand */}
      <div className="hand-area">
        <div className="hand-head">
          <span className="section-label">
            {distressPicking
              ? "Distress — tap the card to pass"
              : sonarMode
                ? "Sonar — tap your highest / only / lowest card"
                : "Your hand"}
          </span>
          {canSonar && !distressPicking && (
            <button
              className={`btn chip ${sonarMode ? "danger" : ""}`}
              onClick={() => setSonarMode((m) => !m)}
            >
              {sonarMode ? "Cancel" : "📡 Sonar"}
            </button>
          )}
          {!canSonar && view.comms === "silent" && <span className="sonar-spent">📡 dead</span>}
          {!canSonar && view.comms === "delayed" && view.trickNumber < 2 && (
            <span className="sonar-spent">📡 after trick 2</span>
          )}
          {!canSonar && view.comms !== "silent" && view.sonarUsed[view.youSeat] && (
            <span className="sonar-spent">📡 used</span>
          )}
        </div>
        <div className="hand">
          {view.hand.map((card) => {
            const distressOk = distressPicking && card.suit !== "sub";
            const sonarOk = !distressPicking && sonarMode && sonarPosition(view.hand, card) !== null;
            const playOk = !distressPicking && !sonarMode && yourTurn && legal(card);
            const hinted = !distressPicking && !sonarMode && hint?.card != null && sameCard(hint.card, card);
            return (
              <CardView
                key={`${card.suit}-${card.value}`}
                card={card}
                onClick={distressOk || sonarOk || playOk ? () => onCardTap(card) : undefined}
                disabled={
                  distressPicking
                    ? !distressOk
                    : sonarMode
                      ? !sonarOk
                      : view.phase !== "playing" || !yourTurn || !legal(card)
                }
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
      {showShare && (
        <ShareRoom
          code={room.code}
          joinUrl={`${baseUrl}/?join=${room.code}`}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}
