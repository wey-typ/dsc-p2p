import type { Card } from "./types.js";
import { cardsEqual } from "./cards.js";
import { type GameState, playCard, legalMovesFor } from "./game.js";
import { chooseBotPlayFast } from "./bots.js";

export interface SolveBudget {
  /** Remaining search nodes; decremented as the DFS explores. */
  nodes: number;
}

/**
 * Cooperative full-information solver. Because every seat is on the same team, a single
 * searcher with all hands visible can look for a line of legal plays that completes all
 * tasks (in order) without failing. Returns the winning sequence of cards, or null if no
 * win was found within the node budget (deal likely unsolvable).
 *
 * Move ordering tries the heuristic's pick first, so solvable deals that the bot is "close"
 * on are found almost immediately.
 */
export function solveGame(state: GameState, budget: SolveBudget = { nodes: 60000 }): Card[] | null {
  if (state.phase === "won") return [];
  if (state.phase !== "playing") return null;
  if (budget.nodes <= 0) return null;
  budget.nodes--;

  const seat = state.turn;
  for (const move of orderedMoves(state, seat)) {
    let next: GameState;
    try {
      next = playCard(state, seat, move);
    } catch {
      continue; // illegal (shouldn't happen for legal moves) — skip
    }
    if (next.phase === "lost") continue; // dead branch, prune
    const rest = solveGame(next, budget);
    if (rest) return [move, ...rest];
  }
  return null;
}

/** Legal moves with the heuristic's choice tried first (then the rest as-is). */
function orderedMoves(state: GameState, seat: number): Card[] {
  const moves = legalMovesFor(state, seat);
  if (moves.length <= 1) return moves;
  // Cheap heuristic pick only — the rollout bot is far too expensive per search node.
  const pick = chooseBotPlayFast(state, seat);
  return moves.slice().sort((a, b) => keyFor(a, pick) - keyFor(b, pick));
}

function keyFor(card: Card, pick: Card): number {
  return cardsEqual(card, pick) ? 0 : 1;
}
