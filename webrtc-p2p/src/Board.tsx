import { useState } from "react";
import { sonarPosition, type Card, type PlayerView, type TaskState } from "@dsc/shared";
import type { P2PRoom } from "./protocol";

const SUIT: Record<Card["suit"], { cls: string; glyph: string }> = {
  blue: { cls: "s-blue", glyph: "≈" },
  green: { cls: "s-green", glyph: "❀" },
  pink: { cls: "s-pink", glyph: "✦" },
  yellow: { cls: "s-yellow", glyph: "◐" },
  sub: { cls: "s-sub", glyph: "⬡" },
};

function CardChip({ card, small, onClick, disabled, selected }: { card: Card; small?: boolean; onClick?: () => void; disabled?: boolean; selected?: boolean }) {
  const m = SUIT[card.suit];
  return (
    <button
      type="button"
      className={`card ${m.cls} ${small ? "sm" : ""} ${disabled ? "dis" : ""} ${selected ? "sel" : ""}`}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      <span className="c-v">{card.value}</span>
      <span className="c-g">{m.glyph}</span>
    </button>
  );
}

function constraintLabel(t: TaskState): string | null {
  switch (t.constraint.kind) {
    case "relative": return `▸ ${t.constraint.order}`;
    case "absolute": return `① ${t.constraint.order}`;
    case "last": return "Ω last";
    default: return null;
  }
}
const sameCard = (a: Card, b: Card) => a.suit === b.suit && a.value === b.value;

export function Board({
  view, room, isHost, onPlay, onCommunicate, onRestart, onStart,
}: {
  view: PlayerView | null;
  room: P2PRoom;
  isHost: boolean;
  onPlay: (c: Card) => void;
  onCommunicate: (c: Card) => void;
  onRestart: () => void;
  onStart: (lv: number) => void;
}) {
  const [sonar, setSonar] = useState(false);
  if (!view) return <div className="screen"><p className="hint">Loading…</p></div>;

  const yourTurn = view.turn === view.youSeat && view.phase === "playing";
  const nameOf = (s: number) => view.players[s]?.name ?? `Seat ${s + 1}`;
  const legal = (c: Card) => view.legalMoves.some((x) => sameCard(x, c));
  const signalFor = (s: number) => view.communications.find((c) => c.seat === s);
  const canSonar = view.youCanCommunicate;

  return (
    <div className="screen game">
      <div className="players">
        {view.players.map((p) => (
          <div key={p.seat} className={`pchip ${view.turn === p.seat ? "active" : ""} ${p.seat === view.youSeat ? "me" : ""}`}>
            <span className="pn">{p.name}</span>
            <span className="pm">{p.seat === view.commander ? "⚓ " : ""}{view.handCounts[p.seat]} cards</span>
            {signalFor(p.seat) && <span className="psig">{SUIT[signalFor(p.seat)!.card.suit].glyph}{signalFor(p.seat)!.card.value} · {signalFor(p.seat)!.position}</span>}
          </div>
        ))}
      </div>

      <div className="label">Tasks · {view.completedCount}/{view.taskTotal}</div>
      <div className="tasks">
        {view.tasks.map((t) => (
          <div key={t.id} className={`task ${t.status}`}>
            <CardChip card={t.card} small />
            <span className="town">{nameOf(t.owner)}</span>
            {constraintLabel(t) && <span className="tc">{constraintLabel(t)}</span>}
            {t.status === "done" && <span className="tck">✓</span>}
          </div>
        ))}
      </div>

      <div className="label">Trick</div>
      <div className="trick">
        {view.trick.plays.length === 0 && <span className="hint">No cards yet</span>}
        {view.trick.plays.map((pl) => (
          <div key={`${pl.seat}-${pl.card.suit}-${pl.card.value}`} className="tp">
            <CardChip card={pl.card} small />
            <span className="tpn">{nameOf(pl.seat)}</span>
          </div>
        ))}
      </div>

      {view.lastTrick && view.lastTrick.plays.length > 0 && (
        <>
          <div className="label">Last trick — 🏆 {nameOf(view.lastTrickWinner ?? -1)}</div>
          <div className="trick lasttrick">
            {view.lastTrick.plays.map((pl) => (
              <div key={`lt-${pl.seat}-${pl.card.suit}-${pl.card.value}`} className={`tp ${pl.seat === view.lastTrickWinner ? "won" : ""}`}>
                <CardChip card={pl.card} small />
                <span className="tpn">{pl.seat === view.lastTrickWinner ? "🏆 " : ""}{nameOf(pl.seat)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className={`turn ${yourTurn ? "you" : ""}`}>
        {view.phase !== "playing"
          ? view.phase === "won" ? "Mission complete!" : "Mission failed"
          : yourTurn ? (sonar ? "Sonar: tap your highest/only/lowest card" : "Your turn — play a card") : `Waiting for ${nameOf(view.turn)}…`}
      </div>

      <div className="hand-head">
        <span className="label">Your hand</span>
        {canSonar && <button className="btn chip" onClick={() => setSonar((s) => !s)}>{sonar ? "Cancel" : "📡 Sonar"}</button>}
      </div>
      <div className="hand">
        {view.hand.map((card) => {
          const sonarOk = sonar && sonarPosition(view.hand, card) !== null;
          const playOk = !sonar && yourTurn && legal(card);
          return (
            <CardChip
              key={`${card.suit}-${card.value}`}
              card={card}
              selected={sonarOk}
              disabled={sonar ? !sonarOk : !playOk}
              onClick={() => {
                if (sonar) { if (sonarOk) { onCommunicate(card); setSonar(false); } }
                else if (playOk) onPlay(card);
              }}
            />
          );
        })}
      </div>

      {view.phase !== "playing" && (
        <div className="overlay">
          <div className="ocard">
            <div className="oemoji">{view.phase === "won" ? "🏆" : "🌊"}</div>
            <h2>{view.phase === "won" ? "Mission Complete" : "Mission Failed"}</h2>
            {view.phase === "lost" && view.failReason && <p className="hint">{view.failReason}</p>}
            {isHost ? (
              <div className="stack">
                {view.phase === "won" && <button className="btn primary" onClick={() => onStart(room.level)}>Next dive</button>}
                {view.phase === "lost" && <button className="btn primary" onClick={() => onStart(room.level)}>Retry</button>}
                <button className="btn ghost" onClick={onRestart}>Back to lobby</button>
              </div>
            ) : (
              <p className="hint">Waiting for the host…</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
