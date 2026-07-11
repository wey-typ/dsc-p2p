import type { Card } from "./types.js";
import { cardId } from "./cards.js";
import { type GameState, legalMovesFor } from "./game.js";
import { type BotWeights, DEFAULT_WEIGHTS, chooseBotPlay } from "./bots.js";
import { solveGame } from "./solver.js";

export interface PlannerOptions {
  /** Search-node budget per solve attempt. */
  nodes: number;
  /** How many budget-exhausted (inconclusive) solves to tolerate before going heuristic-only. */
  maxAttempts: number;
}

export const DEFAULT_PLANNER: PlannerOptions = { nodes: 60000, maxAttempts: 2 };

/** Every card played so far this game, in play order (resolved tricks + the open trick). */
function playHistory(state: GameState): string[] {
  const ids: string[] = [];
  for (const t of state.resolvedTricks ?? []) for (const p of t.plays) ids.push(cardId(p.card));
  for (const p of state.trick.plays) ids.push(cardId(p.card));
  return ids;
}

/**
 * A stateful bot brain for one game: it looks for a full winning line with the
 * cooperative full-information solver and follows it; if a human deviates from the plan
 * it re-solves, and if no win can be found it falls back to the rollout heuristic.
 *
 * Because the game is fully cooperative, the solver "controlling" every seat is exactly
 * the crew's best case — the planner replans whenever reality diverges. Once a solve
 * completes *exhaustively* with no win, the deal is provably lost from here, so the
 * planner stops burning CPU and just plays sensibly.
 *
 * Create one planner per game (its plan/hopeless state is tied to a single deal).
 */
export class BotPlanner {
  private plan: Card[] = [];
  /** Length of the play history at the moment `plan` was computed. */
  private planBase = 0;
  private hopeless = false;
  private inconclusiveSolves = 0;

  constructor(private opts: PlannerOptions = DEFAULT_PLANNER) {}

  /**
   * Seed the planner with a known winning line for the *current* state (e.g. the
   * constructive line from the solvable-deal generator, or a solver result computed
   * elsewhere). `state` must be the position the line starts from.
   */
  seedPlan(state: GameState, line: readonly Card[]): void {
    this.plan = line.slice();
    this.planBase = playHistory(state).length;
    this.hopeless = false;
    this.inconclusiveSolves = 0;
  }

  /** Choose a card for `seat` (must be `state.turn`). Always returns a legal move. */
  choose(state: GameState, seat: number, weights: BotWeights = DEFAULT_WEIGHTS): Card {
    const moves = legalMovesFor(state, seat);
    if (moves.length === 0) throw new Error(`No legal moves for seat ${seat}`);
    const history = playHistory(state);

    // Follow the current plan if everyone (bots and humans) has stuck to it.
    const planned = this.nextFromPlan(history, moves);
    if (planned) return planned;

    if (moves.length === 1) return moves[0]!;

    if (!this.hopeless && this.inconclusiveSolves < this.opts.maxAttempts) {
      const budget = { nodes: this.opts.nodes };
      const line = solveGame(state, budget);
      if (line && line.length > 0) {
        this.plan = line;
        this.planBase = history.length;
        return line[0]!;
      }
      if (budget.nodes > 0) {
        // The search finished without running out of nodes: no winning line exists.
        this.hopeless = true;
      } else {
        this.inconclusiveSolves++;
      }
    }

    return chooseBotPlay(state, seat, weights);
  }

  /**
   * If the play history since `planBase` matches the plan prefix, return the plan's next
   * card (when legal). Otherwise drop the plan so we re-solve from the real state.
   */
  private nextFromPlan(history: string[], moves: Card[]): Card | null {
    if (this.plan.length === 0) return null;
    const k = history.length - this.planBase;
    if (k >= 0 && k < this.plan.length) {
      let matches = true;
      for (let i = 0; i < k; i++) {
        if (history[this.planBase + i] !== cardId(this.plan[i]!)) {
          matches = false;
          break;
        }
      }
      if (matches) {
        const next = this.plan[k]!;
        if (moves.some((m) => cardId(m) === cardId(next))) return next;
      }
    }
    this.plan = [];
    return null;
  }

  /** True once an exhaustive search proved no winning line exists from the current state. */
  isHopeless(): boolean {
    return this.hopeless;
  }
}
