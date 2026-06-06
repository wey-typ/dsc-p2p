import type { Card } from "./types.js";
import type { TaskState } from "./tasks.js";
import { isTrump, cardsEqual } from "./cards.js";
import { trickWinner } from "./trick.js";
import { type GameState, legalMovesFor } from "./game.js";

/**
 * Tunable weights for the bot's *soft* tie-breaking. Hard safety rules (don't complete a
 * task out of order, don't steal a teammate's task card) are NOT weighted — they always
 * apply. Training (self-play) optimizes these.
 */
export interface BotWeights {
  /** Penalty for spending a (scarce) submarine/trump card. */
  trumpAversion: number;
  /** Penalty for putting a pending task card on the table when not deliberately winning it. */
  taskAversion: number;
  /** Penalty per pip of value when dumping a card (encourages keeping high cards/control). */
  highCardAversion: number;
  /** Bonus for choosing the *lowest* card that still wins when we want to win. */
  cheapWinBias: number;
}

export const DEFAULT_WEIGHTS: BotWeights = {
  trumpAversion: 6,
  taskAversion: 10,
  highCardAversion: 0.4,
  cheapWinBias: 1,
};

/**
 * Is `task` allowed to be *completed right now* without breaking its ordering constraint?
 * (Approximates the engine's checkOrdering for a single next completion.)
 */
export function isTaskReady(state: GameState, task: TaskState): boolean {
  const c = task.constraint;
  switch (c.kind) {
    case "none":
      return true;
    case "absolute":
      return state.completedCount + 1 === c.order;
    case "relative":
      return !state.tasks.some(
        (t) =>
          t.id !== task.id &&
          t.constraint.kind === "relative" &&
          t.constraint.order < c.order &&
          t.status !== "done"
      );
    case "last":
      return state.tasks.every((t) => t.id === task.id || t.status === "done");
    default:
      return true;
  }
}

/**
 * Choose a card for a bot seat. Hard rules first (safety), then weighted tie-breaking.
 *  - WIN the trick only if it's safe: every task card on the table is one of ours AND ready
 *    to complete in order; then play the cheapest winning card.
 *  - Otherwise AVOID winning (don't steal teammates' cards / don't complete out of order):
 *    play the cheapest non-winning card.
 *  - With no task cards in play, dump the cheapest card.
 * Always returns a legal move.
 */
export function chooseBotPlay(
  state: GameState,
  seat: number,
  weights: BotWeights = DEFAULT_WEIGHTS
): Card {
  const moves = legalMovesFor(state, seat);
  if (moves.length <= 1) return moves[0]!;

  const trick = state.trick;
  const winsWith = (card: Card): boolean => {
    const hypothetical = { ...trick, plays: [...trick.plays, { seat, card }] };
    return trickWinner(hypothetical) === seat;
  };

  // Pending tasks whose card is already on the table this trick.
  const inTrick = state.tasks.filter(
    (t) => t.status === "pending" && trick.plays.some((p) => cardsEqual(p.card, t.card))
  );

  if (inTrick.length > 0) {
    const anyTeammateCard = inTrick.some((t) => t.owner !== seat);
    const allMineReady = inTrick.every((t) => t.owner === seat && isTaskReady(state, t));
    const safeToWin = !anyTeammateCard && allMineReady;

    if (safeToWin) {
      const winning = moves.filter(winsWith);
      if (winning.length > 0) {
        // If we're the last to play, win cheaply. Otherwise win *decisively* (strongest
        // card) so a later player can't over-trump and steal our task card.
        const isLast = trick.plays.length + 1 >= state.expectedTrickSize;
        return isLast
          ? cheapest(winning, state, weights, /*winning*/ true)
          : strongest(winning);
      }
      return cheapest(moves, state, weights);
    }
    // Unsafe to win (teammate's card present, or an own task not yet in order): duck.
    const losing = moves.filter((c) => !winsWith(c));
    return cheapest(losing.length > 0 ? losing : moves, state, weights);
  }

  // Leading with no task on the table yet: try to *deliver* a teammate's task card.
  // Non-owners duck tricks containing a teammate task card, so leading a teammate's
  // ready task card lets its owner grab it cleanly. Only lead READY task cards (in order).
  const leading = trick.plays.length === 0;
  if (leading) {
    const deliverable = moves.filter((c) => {
      const task = state.tasks.find(
        (t) => t.status === "pending" && cardsEqual(t.card, c) && t.owner !== seat
      );
      return task !== undefined && isTaskReady(state, task);
    });
    if (deliverable.length > 0) return cheapest(deliverable, state, weights);
  }

  // Otherwise play the cheapest card (keep control & hold task cards we can't safely move).
  return cheapest(moves, state, weights);
}

/** Strongest card to maximise the chance of holding the trick: trump beats colour, then value. */
function strongest(cards: readonly Card[]): Card {
  return cards.slice().sort((a, b) => {
    const ta = isTrump(a) ? 1 : 0;
    const tb = isTrump(b) ? 1 : 0;
    if (ta !== tb) return tb - ta;
    return b.value - a.value;
  })[0]!;
}

/** Pick the lowest-cost card per the weights (cost lower = better). */
function cheapest(
  cards: readonly Card[],
  state: GameState,
  w: BotWeights,
  preferWinner = false
): Card {
  const isPendingTask = (c: Card) =>
    state.tasks.some((t) => t.status === "pending" && cardsEqual(t.card, c));
  const cost = (c: Card) =>
    (isPendingTask(c) ? w.taskAversion : 0) +
    (isTrump(c) ? w.trumpAversion : 0) +
    c.value * w.highCardAversion -
    (preferWinner ? w.cheapWinBias * (10 - c.value) : 0);
  return cards.slice().sort((a, b) => cost(a) - cost(b))[0]!;
}
