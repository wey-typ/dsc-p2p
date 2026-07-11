import type { Card } from "./types.js";
import type { TaskState } from "./tasks.js";
import { isTrump, cardsEqual } from "./cards.js";
import { trickWinner } from "./trick.js";
import { type GameState, legalMovesFor, playCard } from "./game.js";

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
 * Fast, reactive card choice — the original rule-based bot. Hard rules first (safety),
 * then weighted tie-breaking:
 *  - WIN the trick only if it's safe: every task card on the table is one of ours AND ready
 *    to complete in order; then play the cheapest winning card.
 *  - Otherwise AVOID winning (don't steal teammates' cards / don't complete out of order):
 *    play the cheapest non-winning card.
 *  - With no task cards in play, dump the cheapest card.
 * Always returns a legal move. Used as the *model* of teammates inside the rollout bot and
 * as cheap move ordering inside the solver (it must stay non-recursive and O(hand)).
 */
export function chooseBotPlayFast(
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

  // Pending capture tasks whose card is already on the table this trick.
  const inTrick = state.tasks.filter(
    (t) => t.status === "pending" && t.card !== undefined && trick.plays.some((p) => cardsEqual(p.card, t.card!))
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
        (t) => t.status === "pending" && t.card !== undefined && cardsEqual(t.card, c) && t.owner !== seat
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
    state.tasks.some((t) => t.status === "pending" && t.card !== undefined && cardsEqual(t.card, c));
  const cost = (c: Card) =>
    (isPendingTask(c) ? w.taskAversion : 0) +
    (isTrump(c) ? w.trumpAversion : 0) +
    c.value * w.highCardAversion -
    (preferWinner ? w.cheapWinBias * (10 - c.value) : 0);
  return cards.slice().sort((a, b) => cost(a) - cost(b))[0]!;
}

/**
 * Which card a bot passes when the crew fires the distress signal: the highest-value
 * colour card that isn't a pending task card (high cards force unwanted trick wins;
 * task cards must stay with hands the plan can reason about).
 */
export function chooseDistressPass(state: GameState, seat: number): Card {
  const hand = state.hands[seat] ?? [];
  const options = hand.filter((c) => !isTrump(c)); // submarines can't be passed
  const pool = options.length > 0 ? options : hand;
  const isPendingTask = (c: Card) =>
    state.tasks.some((t) => t.status === "pending" && t.card !== undefined && cardsEqual(t.card, c));
  return pool
    .slice()
    .sort((a, b) => Number(isPendingTask(a)) - Number(isPendingTask(b)) || b.value - a.value)[0]!;
}

/**
 * Roll the current trick forward to its resolution: `seat` plays `move`, then every
 * remaining seat plays what the fast bot model would. Returns the state right after the
 * engine resolves the trick (task completions and instant-fails applied), or earlier if
 * the game ends mid-trick.
 */
function rolloutTrick(
  state: GameState,
  seat: number,
  move: Card,
  weights: BotWeights
): GameState {
  let s = playCard(state, seat, move);
  const trickNo = state.trickNumber;
  let guard = 0;
  while (s.phase === "playing" && s.trickNumber === trickNo && guard++ < 8) {
    s = playCard(s, s.turn, chooseBotPlayFast(s, s.turn, weights));
  }
  return s;
}

/**
 * Score the trick outcome reached by playing `move` from `before`. Higher is better.
 * The engine itself judges correctness (completions, wrong captures, ordering, stranded
 * absolutes), so the score only has to rank: win >> completions >> resources kept.
 */
function scoreOutcome(
  before: GameState,
  after: GameState,
  seat: number,
  move: Card,
  w: BotWeights
): number {
  // Prefer *any* survivable line over a predicted loss; among losses prefer cheap cards
  // so we don't burn resources on a trick the model already thinks is doomed.
  const spent = (isTrump(move) ? w.trumpAversion : 0) + move.value * w.highCardAversion;
  if (after.phase === "lost") return -1_000_000 - spent;

  let score = -spent;
  if (after.phase === "won") score += 1_000_000;

  // Tasks completed this trick (the engine already validated owner + ordering) —
  // captures AND extension objectives (first-trick, quotas, colour bans).
  const doneCount = (s: GameState) => s.tasks.filter((t) => t.status === "done").length;
  score += (doneCount(after) - doneCount(before)) * 300;

  // Quota shaping: "win exactly N tricks" only settles at game end, so reward each
  // trick the owner banks toward a pending quota (never past it — over is instant fail).
  const quotaProgress = (s: GameState) =>
    s.tasks.reduce(
      (sum, t) =>
        t.status === "pending" && t.objective.kind === "winExactly"
          ? sum + Math.min(s.tricksWon[t.owner] ?? 0, t.objective.count)
          : sum,
      0
    );
  score += (quotaProgress(after) - quotaProgress(before)) * 80;

  // Don't leave a pending task card floating in a trick the model can't read — if `move`
  // is a pending task card and it did NOT complete, that's a real risk (any wrong capture
  // is an instant fail). The rollout usually catches the fail outright; this covers the
  // model being wrong about teammates.
  const movedPendingTask = after.tasks.some(
    (t) => t.status === "pending" && t.card !== undefined && cardsEqual(t.card, move)
  );
  if (movedPendingTask) score -= w.taskAversion * 3;

  // Slight preference for keeping the lead while the crew still has tasks to set up:
  // the leader can deliver teammates' task cards and steer suits.
  const winner = after.lastTrickWinner;
  const pendingLeft = after.tasks.some((t) => t.status === "pending");
  if (winner === seat && pendingLeft) score += w.cheapWinBias * 2;

  return score;
}

/**
 * Choose a card for a bot seat by 1-trick lookahead: try every legal card, roll the trick
 * to completion with teammates modeled by the fast bot, and let the real engine score the
 * result. This finds lines the reactive bot can't see — e.g. winning a trick by playing
 * your OWN task card, delivering a teammate's task only when they can actually take it,
 * and never dumping a card that hands a teammate's task to the wrong seat.
 * Always returns a legal move.
 */
export function chooseBotPlay(
  state: GameState,
  seat: number,
  weights: BotWeights = DEFAULT_WEIGHTS
): Card {
  const moves = legalMovesFor(state, seat);
  if (moves.length <= 1) return moves[0]!;

  let best: Card = moves[0]!;
  let bestScore = -Infinity;
  for (const move of moves) {
    const after = rolloutTrick(state, seat, move, weights);
    const score = scoreOutcome(state, after, seat, move, weights);
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }
  return best;
}
