import type { Card } from "./types.js";
import { isTrump, cardsEqual } from "./cards.js";
import { trickWinner } from "./trick.js";
import { type GameState, legalMovesFor } from "./game.js";

/**
 * Choose a card for a bot seat. Heuristics (cooperative, not optimal):
 *  - If a task card is being decided in this trick:
 *      • the bot owns it  -> try to WIN (lowest card that takes the trick);
 *      • a teammate owns it -> AVOID winning (lowest losing card).
 *  - Otherwise play safe: prefer a non-task, non-trump, low card so the bot neither
 *    dumps a needed card nor accidentally grabs one meant for someone else.
 * Always returns a legal move.
 */
export function chooseBotPlay(state: GameState, seat: number): Card {
  const moves = legalMovesFor(state, seat);
  if (moves.length <= 1) return moves[0]!;

  const trick = state.trick;
  const pendingTaskCard = (c: Card) =>
    state.tasks.some((t) => t.status === "pending" && cardsEqual(t.card, c));

  const winsWith = (card: Card): boolean => {
    const hypothetical = { ...trick, plays: [...trick.plays, { seat, card }] };
    return trickWinner(hypothetical) === seat;
  };

  // Tasks whose target card is already on the table this trick.
  const inTrick = state.tasks.filter(
    (t) => t.status === "pending" && trick.plays.some((p) => cardsEqual(p.card, t.card))
  );

  if (inTrick.length > 0) {
    const mineDecided = inTrick.some((t) => t.owner === seat);
    const teammateDecided = inTrick.some((t) => t.owner !== seat);
    if (mineDecided && !teammateDecided) {
      const winning = moves.filter(winsWith);
      if (winning.length > 0) return best(winning, pendingTaskCard); // lowest that wins
    } else {
      const losing = moves.filter((c) => !winsWith(c));
      if (losing.length > 0) return best(losing, pendingTaskCard); // stay out of it
    }
  }

  return best(moves, pendingTaskCard);
}

/** Pick the "cheapest" card: prefer non-task, then non-trump, then lowest value. */
function best(cards: readonly Card[], isPendingTask: (c: Card) => boolean): Card {
  return cards.slice().sort((a, b) => {
    const ta = isPendingTask(a) ? 1 : 0;
    const tb = isPendingTask(b) ? 1 : 0;
    if (ta !== tb) return ta - tb;
    const pa = isTrump(a) ? 1 : 0;
    const pb = isTrump(b) ? 1 : 0;
    if (pa !== pb) return pa - pb;
    return a.value - b.value;
  })[0]!;
}
