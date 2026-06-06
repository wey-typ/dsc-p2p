import { type Card, type Player, type Trick } from "./types.js";
import { cardsEqual, deal, cardId, sonarPosition, type SonarPosition } from "./cards.js";
import { legalMoves, isLegalPlay, trickWinner } from "./trick.js";

/** A sonar reveal: a face-up card marked as the seat's highest/only/lowest of its colour. */
export interface Communication {
  readonly seat: number;
  readonly card: Card;
  readonly position: SonarPosition;
}
import {
  type MissionTask,
  type TaskState,
  completionSortKey,
} from "./tasks.js";

export type GamePhase = "playing" | "won" | "lost";

/** A mission: the objective set the crew must clear in one game. */
export interface Mission {
  readonly id: string;
  readonly name: string;
  readonly tasks: readonly MissionTask[];
}

/** Full game state. Hands are private per seat; the server filters before sending. */
export interface GameState {
  readonly players: Player[];
  readonly hands: Card[][];
  readonly tasks: TaskState[];
  /** Seat index holding the highest submarine; leads the first trick. */
  readonly commander: number;
  /** Current (in-progress) trick. */
  trick: Trick;
  /** Seat whose turn it is to play. */
  turn: number;
  /** Count of completed tricks so far. */
  trickNumber: number;
  /** Count of tasks completed so far (assigns completionIndex). */
  completedCount: number;
  phase: GamePhase;
  failReason?: string;
  /** Sonar reveals made this mission (public to all). */
  communications: Communication[];
  /** Whether each seat has spent its single sonar token. */
  sonarUsed: boolean[];
}

/**
 * Build a fresh game: deal the deck, set the Commander as the first leader, and
 * instantiate the mission's tasks as pending runtime state.
 */
export function createGame(
  players: Player[],
  mission: Mission,
  rng: () => number
): GameState {
  const { hands, commander } = deal(players.length, rng);
  const tasks: TaskState[] = mission.tasks.map((t, i) => ({
    id: `task-${i}-${cardId(t.card)}`,
    card: t.card,
    owner: t.owner,
    constraint: t.constraint,
    status: "pending",
  }));
  return {
    players,
    hands,
    tasks,
    commander,
    trick: { leader: commander, plays: [] },
    turn: commander,
    trickNumber: 0,
    completedCount: 0,
    phase: "playing",
    communications: [],
    sonarUsed: new Array(players.length).fill(false),
  };
}

/** Whether `seat` may make a sonar signal right now (token unspent, between tricks). */
export function canCommunicate(state: GameState, seat: number): boolean {
  return (
    state.phase === "playing" &&
    !state.sonarUsed[seat] &&
    state.trick.plays.length === 0
  );
}

/**
 * Make a sonar signal: reveal `card` as this seat's highest/only/lowest of its colour.
 * Position is derived truthfully from the hand. Throws if it isn't allowed.
 */
export function communicate(state: GameState, seat: number, card: Card): GameState {
  if (!canCommunicate(state, seat)) {
    throw new Error("Cannot communicate right now");
  }
  const position = sonarPosition(state.hands[seat] ?? [], card);
  if (position === null) {
    throw new Error("That card cannot be signalled (submarine, not held, or a middle card)");
  }
  const next: GameState = structuredClone(state);
  next.communications.push({ seat, card, position });
  next.sonarUsed[seat] = true;
  return next;
}

/** Legal cards the given seat may currently play (empty if it's not their turn). */
export function legalMovesFor(state: GameState, seat: number): Card[] {
  if (state.phase !== "playing" || state.turn !== seat) return [];
  return legalMoves(state.hands[seat]!, state.trick);
}

function removeCard(hand: Card[], card: Card): Card[] {
  const idx = hand.findIndex((c) => cardsEqual(c, card));
  if (idx === -1) return hand;
  return [...hand.slice(0, idx), ...hand.slice(idx + 1)];
}

function fail(state: GameState, reason: string): GameState {
  return { ...state, phase: "lost", failReason: reason };
}

/**
 * Play a card for `seat`. Returns a new state (the input is not mutated).
 * Throws on out-of-turn or illegal plays so callers can surface a clear error.
 */
export function playCard(state: GameState, seat: number, card: Card): GameState {
  if (state.phase !== "playing") throw new Error("Game is over");
  if (state.turn !== seat) throw new Error(`Not seat ${seat}'s turn`);
  if (!isLegalPlay(card, state.hands[seat]!, state.trick)) {
    throw new Error(`Illegal play: ${cardId(card)} by seat ${seat}`);
  }

  const next: GameState = structuredClone(state);
  next.hands[seat] = removeCard(next.hands[seat]!, card);
  next.trick = { ...next.trick, plays: [...next.trick.plays, { seat, card }] };

  // Trick still in progress: advance to next seat.
  if (next.trick.plays.length < next.players.length) {
    next.turn = (seat + 1) % next.players.length;
    return next;
  }

  // Trick complete: resolve it.
  return resolveCompletedTrick(next);
}

function resolveCompletedTrick(state: GameState): GameState {
  const winner = trickWinner(state.trick);
  const trickNo = state.trickNumber + 1;
  const cardsInTrick = state.trick.plays.map((p) => p.card);

  // Tasks whose target card was captured in this trick.
  const resolving = state.tasks.filter(
    (t) => t.status === "pending" && cardsInTrick.some((c) => cardsEqual(c, t.card))
  );

  // Wrong player won a required card -> instant fail.
  const wrong = resolving.find((t) => t.owner !== winner);
  if (wrong) {
    return fail(
      state,
      `Task failed: ${cardId(wrong.card)} was won by seat ${winner}, not its owner seat ${wrong.owner}.`
    );
  }

  // Complete the owner's tasks, in a constraint-friendly order, validating as we go.
  const completing = resolving
    .slice()
    .sort((a, b) => completionSortKey(a.constraint) - completionSortKey(b.constraint));

  let s: GameState = state;
  for (const task of completing) {
    const idx = s.completedCount + 1;
    const violation = checkOrdering(s, task, idx);
    if (violation) return fail(s, violation);
    s = applyCompletion(s, task.id, idx, trickNo);
  }

  // After completions, any pending absolute task whose slot has passed is impossible.
  const stranded = s.tasks.find(
    (t) =>
      t.status === "pending" &&
      t.constraint.kind === "absolute" &&
      s.completedCount >= t.constraint.order
  );
  if (stranded) {
    return fail(s, `Task impossible: absolute-order task ${cardId(stranded.card)} missed its slot.`);
  }

  // Reset trick; winner leads next.
  s = {
    ...s,
    trick: { leader: winner, plays: [] },
    turn: winner,
    trickNumber: trickNo,
  };

  // Win when every task is done.
  if (s.tasks.every((t) => t.status === "done")) {
    return { ...s, phase: "won" };
  }

  // Ran out of cards with tasks still pending -> fail.
  const cardsLeft = s.hands.some((h) => h.length > 0);
  if (!cardsLeft) {
    return fail(s, "Out of cards: not all tasks were completed.");
  }

  return s;
}

/** Returns a failure reason string if completing `task` as the `idx`-th task is illegal. */
function checkOrdering(state: GameState, task: TaskState, idx: number): string | null {
  const c = task.constraint;
  switch (c.kind) {
    case "none":
      return null;
    case "absolute":
      return idx === c.order
        ? null
        : `Order violated: ${cardId(task.card)} must be task #${c.order} but completed at #${idx}.`;
    case "relative": {
      const earlierUnfinished = state.tasks.some(
        (t) =>
          t.id !== task.id &&
          t.constraint.kind === "relative" &&
          t.constraint.order < c.order &&
          t.status !== "done"
      );
      return earlierUnfinished
        ? `Order violated: ${cardId(task.card)} (rel #${c.order}) completed before an earlier relative task.`
        : null;
    }
    case "last": {
      const othersPending = state.tasks.some((t) => t.id !== task.id && t.status !== "done");
      return othersPending
        ? `Order violated: ${cardId(task.card)} must be the last task completed.`
        : null;
    }
  }
}

function applyCompletion(
  state: GameState,
  taskId: string,
  idx: number,
  trickNo: number
): GameState {
  return {
    ...state,
    completedCount: idx,
    tasks: state.tasks.map((t) =>
      t.id === taskId ? { ...t, status: "done", completionIndex: idx, completedAtTrick: trickNo } : t
    ),
  };
}
