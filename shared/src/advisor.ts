import type { Card } from "./types.js";
import { isTrump, cardsEqual } from "./cards.js";
import { trickWinner } from "./trick.js";
import type { TaskState } from "./tasks.js";
import type { PlayerView } from "./view.js";

export interface Suggestion {
  card: Card | null;
  reason: string;
}

const SUIT_NAME: Record<Card["suit"], string> = {
  blue: "Current",
  green: "Kelp",
  pink: "Coral",
  yellow: "Sand",
  sub: "Submarine",
};

export function cardName(c: Card): string {
  return `${SUIT_NAME[c.suit]} ${c.value}`;
}

/** Readiness (ordering) computed from the public view. */
function readyFromView(view: PlayerView, task: TaskState): boolean {
  const c = task.constraint;
  switch (c.kind) {
    case "none":
      return true;
    case "absolute":
      return view.completedCount + 1 === c.order;
    case "relative":
      return !view.tasks.some(
        (t) =>
          t.id !== task.id &&
          t.constraint.kind === "relative" &&
          t.constraint.order < c.order &&
          t.status !== "done"
      );
    case "last":
      return view.tasks.every((t) => t.id === task.id || t.status === "done");
    default:
      return true;
  }
}

function cheapest(cards: readonly Card[], view: PlayerView): Card {
  const isTask = (c: Card) =>
    view.tasks.some((t) => t.status === "pending" && cardsEqual(t.card, c));
  const cost = (c: Card) => (isTask(c) ? 10 : 0) + (isTrump(c) ? 6 : 0) + c.value * 0.4;
  return cards.slice().sort((a, b) => cost(a) - cost(b))[0]!;
}

/**
 * Recommend the best card to play for the viewing player, with a plain-English reason.
 * Uses only what the player can legitimately see (their hand + public table state) — it
 * mirrors the bot's strategy, so it's "best given your knowledge", not an X-ray cheat.
 */
export function suggestPlay(view: PlayerView): Suggestion {
  const moves = view.legalMoves;
  if (view.phase !== "playing") return { card: null, reason: "The game isn't in play." };
  if (view.turn !== view.youSeat || moves.length === 0)
    return { card: null, reason: "Wait for your turn." };
  if (moves.length === 1)
    return { card: moves[0]!, reason: `Only one legal card: play ${cardName(moves[0]!)}.` };

  const seat = view.youSeat;
  const nameOf = (s: number) => view.players[s]?.name ?? `Seat ${s + 1}`;
  const winsWith = (card: Card) =>
    trickWinner({ ...view.trick, plays: [...view.trick.plays, { seat, card }] }) === seat;

  const inTrick = view.tasks.filter(
    (t) => t.status === "pending" && view.trick.plays.some((p) => cardsEqual(p.card, t.card))
  );

  if (inTrick.length > 0) {
    const anyTeammate = inTrick.some((t) => t.owner !== seat);
    const allMineReady = inTrick.every((t) => t.owner === seat && readyFromView(view, t));
    if (!anyTeammate && allMineReady) {
      const winning = moves.filter(winsWith);
      const target = inTrick.find((t) => t.owner === seat)!;
      if (winning.length > 0) {
        const card = cheapest(winning, view);
        return {
          card,
          reason: `Win this trick to capture YOUR task ${cardName(target.card)} — it's on the table and ready. Play ${cardName(card)} (the cheapest card that still wins).`,
        };
      }
      const card = cheapest(moves, view);
      return {
        card,
        reason: `Your task ${cardName(target.card)} is here but you can't win this trick — play low (${cardName(card)}) and aim to capture it another time.`,
      };
    }
    const losing = moves.filter((c) => !winsWith(c));
    const card = cheapest(losing.length > 0 ? losing : moves, view);
    const teammate = inTrick.find((t) => t.owner !== seat);
    if (teammate) {
      return {
        card,
        reason: `DON'T win this trick — it contains ${nameOf(teammate.owner)}'s task ${cardName(teammate.card)}. If you take it, their task fails. Duck with ${cardName(card)}.`,
      };
    }
    return {
      card,
      reason: `Your task here isn't due yet (it must be completed in order). Avoid winning now — duck with ${cardName(card)}.`,
    };
  }

  const leading = view.trick.plays.length === 0;
  if (leading) {
    const deliverable = moves.filter((c) => {
      const t = view.tasks.find(
        (x) => x.status === "pending" && cardsEqual(x.card, c) && x.owner !== seat
      );
      return t !== undefined && readyFromView(view, t);
    });
    if (deliverable.length > 0) {
      const card = cheapest(deliverable, view);
      const owner = view.tasks.find((t) => cardsEqual(t.card, card))!.owner;
      return {
        card,
        reason: `Lead ${cardName(card)} — it's ${nameOf(owner)}'s task and they can grab it now while everyone else ducks. Good way to clear a task.`,
      };
    }
    const card = cheapest(moves, view);
    return {
      card,
      reason: `Nothing urgent. Lead low with ${cardName(card)} to keep your high cards, trumps, and task cards for when they matter.`,
    };
  }

  const card = cheapest(moves, view);
  return {
    card,
    reason: `No task is being decided this trick — play your cheapest card (${cardName(card)}) and hold onto trumps and task cards.`,
  };
}
