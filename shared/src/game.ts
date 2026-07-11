import { type Card, type Player, type Trick, type Play, TRUMP_SUIT } from "./types.js";
import { cardsEqual, deal, cardId, sonarPosition, type SonarPosition } from "./cards.js";
import { legalMoves, isLegalPlay, trickWinner } from "./trick.js";

/** A sonar reveal: a face-up card marked as the seat's highest/only/lowest of its colour. */
export interface Communication {
  readonly seat: number;
  readonly card: Card;
  readonly position: SonarPosition;
}

/** A completed trick with its outcome, kept for post-game review/replay. */
export interface ResolvedTrick {
  readonly leader: number;
  readonly plays: Play[];
  readonly winner: number;
}
import {
  type MissionTask,
  type TaskState,
  type TaskObjective,
  completionSortKey,
  describeObjective,
} from "./tasks.js";

export type GamePhase = "playing" | "won" | "lost";

/**
 * Sonar restriction for the mission (comms complications):
 * - open:    sonar as normal.
 * - delayed: sonar only after the first two tricks have resolved.
 * - silent:  sonar disabled for the whole mission.
 */
export type CommsMode = "open" | "delayed" | "silent";

/**
 * Distress-signal sub-state: before the first card of the mission is played, the crew
 * may fire the distress signal — every diver passes ONE card (never a submarine) to the
 * neighbour in `direction`. Play is blocked until every seat has picked.
 */
export interface DistressState {
  readonly direction: "left" | "right";
  /** Chosen card per seat (null until that seat picks). */
  readonly picks: (Card | null)[];
}

/** A mission: the objective set the crew must clear in one game. */
export interface Mission {
  readonly id: string;
  readonly name: string;
  readonly tasks: readonly MissionTask[];
  /** Sonar restriction for this mission (default "open"). */
  readonly comms?: CommsMode;
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
  /** Count of CAPTURE tasks completed so far (assigns completionIndex / feeds ordering). */
  completedCount: number;
  /** Tricks won per seat this mission (feeds winTrick / winExactly objectives). */
  tricksWon: number[];
  phase: GamePhase;
  failReason?: string;
  /** Sonar reveals made this mission (public to all). */
  communications: Communication[];
  /** Whether each seat has spent its single sonar token. */
  sonarUsed: boolean[];
  /** Sonar restriction in force this mission. */
  comms: CommsMode;
  /** Pending distress signal (play is blocked until every seat has passed a card). */
  distress?: DistressState;
  /** Whether the crew has already fired its once-per-mission distress signal. */
  distressUsed: boolean;
  /**
   * How many cards the current trick will hold = seats that had cards when the trick
   * began. Lets the final tricks of an uneven (3-player) deal resolve with fewer cards.
   */
  expectedTrickSize: number;
  /** The most recently completed trick (kept for display after the table clears). */
  lastTrick?: Trick;
  /** Seat that won `lastTrick`. */
  lastTrickWinner?: number;
  /** Every resolved trick this game, in order (for post-game review/replay). */
  resolvedTricks?: ResolvedTrick[];
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
  return makeGameState(players, hands, commander, mission);
}

function taskId(o: TaskObjective, i: number): string {
  switch (o.kind) {
    case "capture":
      return `task-${i}-${cardId(o.card)}`;
    case "winTrick":
      return `task-${i}-trick${o.trick}`;
    case "winExactly":
      return `task-${i}-exactly${o.count}`;
    case "avoidColor":
      return `task-${i}-no-${o.suit}`;
  }
}

/** Build a game state from explicit hands (used by the solvable-mission generator). */
export function makeGameState(
  players: Player[],
  hands: Card[][],
  commander: number,
  mission: Mission
): GameState {
  const tasks: TaskState[] = mission.tasks.map((t, i) => ({
    id: taskId(t.objective, i),
    objective: t.objective,
    card: t.objective.kind === "capture" ? t.objective.card : undefined,
    owner: t.owner,
    constraint: t.constraint,
    status: "pending",
  }));
  return {
    players,
    hands: hands.map((h) => h.slice()),
    tasks,
    commander,
    trick: { leader: commander, plays: [] },
    turn: commander,
    trickNumber: 0,
    completedCount: 0,
    tricksWon: new Array(players.length).fill(0),
    phase: "playing",
    communications: [],
    sonarUsed: new Array(players.length).fill(false),
    comms: mission.comms ?? "open",
    distressUsed: false,
    expectedTrickSize: countSeatsWithCards(hands),
  };
}

/** Number of seats that currently hold at least one card. */
function countSeatsWithCards(hands: readonly Card[][]): number {
  return hands.reduce((n, h) => n + (h.length > 0 ? 1 : 0), 0);
}

/** Next seat (cyclic, starting after `from`) that still holds cards, or `from` if none. */
function nextSeatWithCards(hands: readonly Card[][], from: number): number {
  const n = hands.length;
  for (let step = 1; step <= n; step++) {
    const seat = (from + step) % n;
    if ((hands[seat]?.length ?? 0) > 0) return seat;
  }
  return from;
}

/** Whether `seat` may make a sonar signal right now (token unspent, between tricks). */
export function canCommunicate(state: GameState, seat: number): boolean {
  if (state.phase !== "playing" || state.distress) return false;
  if (state.comms === "silent") return false;
  if (state.comms === "delayed" && state.trickNumber < 2) return false;
  return !state.sonarUsed[seat] && state.trick.plays.length === 0;
}

/** Human-readable reason sonar is blocked for `seat` right now (null = allowed). */
export function communicateBlockedReason(state: GameState, seat: number): string | null {
  if (state.phase !== "playing" || state.distress) return "Not now.";
  if (state.comms === "silent") return "Sonar is DEAD this mission — no signals.";
  if (state.comms === "delayed" && state.trickNumber < 2) {
    return "Sonar interference — signals only after the first two tricks.";
  }
  if (state.sonarUsed[seat]) return "You already used your sonar this mission.";
  if (state.trick.plays.length > 0) return "Sonar only between tricks.";
  return null;
}

/**
 * Make a sonar signal: reveal `card` as this seat's highest/only/lowest of its colour.
 * Position is derived truthfully from the hand. Throws if it isn't allowed.
 */
export function communicate(state: GameState, seat: number, card: Card): GameState {
  if (!canCommunicate(state, seat)) {
    throw new Error(communicateBlockedReason(state, seat) ?? "Cannot communicate right now");
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

// ---- distress signal ----

/** Whether the distress signal may still be fired (before any card has been played). */
export function canStartDistress(state: GameState): boolean {
  return (
    state.phase === "playing" &&
    !state.distress &&
    !state.distressUsed &&
    state.trickNumber === 0 &&
    state.trick.plays.length === 0
  );
}

/** Fire the distress signal: every seat must now pass one card in `direction`. */
export function startDistress(state: GameState, direction: "left" | "right"): GameState {
  if (!canStartDistress(state)) {
    throw new Error("The distress signal can only be fired before the first card is played.");
  }
  const next: GameState = structuredClone(state);
  next.distress = { direction, picks: new Array(state.players.length).fill(null) };
  next.distressUsed = true;
  return next;
}

/**
 * Choose the card `seat` passes for the pending distress signal. Submarines cannot be
 * passed. When every seat has picked, the cards transfer simultaneously and play resumes.
 */
export function pickDistressCard(state: GameState, seat: number, card: Card): GameState {
  const d = state.distress;
  if (!d) throw new Error("No distress signal in progress.");
  if (d.picks[seat]) throw new Error("You already chose a card to pass.");
  if (!state.hands[seat]?.some((c) => cardsEqual(c, card))) {
    throw new Error("You don't hold that card.");
  }
  if (card.suit === TRUMP_SUIT) throw new Error("Submarines cannot be passed.");

  const next: GameState = structuredClone(state);
  next.distress = {
    direction: d.direction,
    picks: d.picks.map((p, i) => (i === seat ? card : p)),
  };
  if (next.distress.picks.every((p) => p !== null)) {
    // All chosen: pass simultaneously. "left" = to the next seat clockwise (+1).
    const n = next.players.length;
    const step = next.distress.direction === "left" ? 1 : n - 1;
    const picks = next.distress.picks as Card[];
    for (let s = 0; s < n; s++) {
      next.hands[s] = next.hands[s]!.filter((c) => !cardsEqual(c, picks[s]!));
    }
    for (let s = 0; s < n; s++) {
      next.hands[(s + step) % n]!.push(picks[s]!);
    }
    next.distress = undefined;
  }
  return next;
}

/** Legal cards the given seat may currently play (empty if it's not their turn). */
export function legalMovesFor(state: GameState, seat: number): Card[] {
  if (state.phase !== "playing" || state.turn !== seat || state.distress) return [];
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
  if (state.distress) throw new Error("Waiting for the distress signal — pass a card first.");
  if (state.turn !== seat) throw new Error(`Not seat ${seat}'s turn`);
  if (!isLegalPlay(card, state.hands[seat]!, state.trick)) {
    throw new Error(`Illegal play: ${cardId(card)} by seat ${seat}`);
  }

  const next: GameState = structuredClone(state);
  next.hands[seat] = removeCard(next.hands[seat]!, card);
  next.trick = { ...next.trick, plays: [...next.trick.plays, { seat, card }] };

  // Trick still in progress: advance to the next seat that still holds cards.
  if (next.trick.plays.length < next.expectedTrickSize) {
    next.turn = nextSeatWithCards(next.hands, seat);
    return next;
  }

  // Trick complete: resolve it.
  return resolveCompletedTrick(next);
}

function resolveCompletedTrick(state: GameState): GameState {
  const winner = trickWinner(state.trick);
  const trickNo = state.trickNumber + 1;
  const cardsInTrick = state.trick.plays.map((p) => p.card);

  // Remember the completed trick so the UI can show it after the table is cleared,
  // and append it to the full game history for post-game review.
  state = {
    ...state,
    lastTrick: state.trick,
    lastTrickWinner: winner,
    tricksWon: state.tricksWon.map((w, i) => (i === winner ? w + 1 : w)),
    resolvedTricks: [
      ...(state.resolvedTricks ?? []),
      { leader: state.trick.leader, plays: state.trick.plays, winner },
    ],
  };

  // Capture tasks whose target card was captured in this trick.
  const resolving = state.tasks.filter(
    (t) =>
      t.status === "pending" &&
      t.objective.kind === "capture" &&
      cardsInTrick.some((c) => t.card && cardsEqual(c, t.card))
  );

  // Wrong player won a required card -> instant fail.
  const wrong = resolving.find((t) => t.owner !== winner);
  if (wrong) {
    return fail(
      state,
      `Task failed: ${cardId(wrong.card!)} was won by seat ${winner}, not its owner seat ${wrong.owner}.`
    );
  }

  // Complete the owner's capture tasks, in a constraint-friendly order, validating as we go.
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

  // winTrick objectives due exactly now: the named trick has just resolved.
  for (const t of s.tasks) {
    if (t.status !== "pending" || t.objective.kind !== "winTrick") continue;
    if (t.objective.trick !== trickNo) continue;
    if (t.owner !== winner) {
      return fail(
        s,
        `Task failed: ${s.players[t.owner]?.name ?? `seat ${t.owner}`} had to win trick #${trickNo}, but seat ${winner} won it.`
      );
    }
    s = markDone(s, t.id, trickNo);
  }

  // avoidColor: the owner just captured a forbidden colour -> instant fail.
  for (const t of s.tasks) {
    if (t.status !== "pending" || t.objective.kind !== "avoidColor") continue;
    const suit = t.objective.suit;
    if (t.owner === winner && cardsInTrick.some((c) => c.suit === suit)) {
      return fail(s, `Task failed: ${describeObjective(t.objective)} — a ${suit} card was captured.`);
    }
  }

  // winExactly: over quota is an immediate, unrecoverable fail.
  for (const t of s.tasks) {
    if (t.status !== "pending" || t.objective.kind !== "winExactly") continue;
    if (s.tricksWon[t.owner]! > t.objective.count) {
      return fail(s, `Task failed: ${describeObjective(t.objective)} — too many tricks won.`);
    }
  }

  // After completions, any pending absolute task whose slot has passed is impossible.
  const stranded = s.tasks.find(
    (t) =>
      t.status === "pending" &&
      t.constraint.kind === "absolute" &&
      s.completedCount >= t.constraint.order
  );
  if (stranded) {
    return fail(s, `Task impossible: absolute-order task ${cardId(stranded.card!)} missed its slot.`);
  }

  // winExactly: not enough tricks remain to reach the quota -> impossible.
  const tricksRemaining = Math.max(0, ...s.hands.map((h) => h.length));
  for (const t of s.tasks) {
    if (t.status !== "pending" || t.objective.kind !== "winExactly") continue;
    if (s.tricksWon[t.owner]! + tricksRemaining < t.objective.count) {
      return fail(s, `Task impossible: ${describeObjective(t.objective)} can no longer be reached.`);
    }
  }

  s = { ...s, trickNumber: trickNo };

  // Deck exhausted: settle the whole-mission objectives, then judge the game.
  if (countSeatsWithCards(s.hands) === 0) {
    for (const t of s.tasks) {
      if (t.status !== "pending") continue;
      if (t.objective.kind === "avoidColor") {
        s = markDone(s, t.id, trickNo); // never captured the colour — held out all game
      } else if (t.objective.kind === "winExactly") {
        if (s.tricksWon[t.owner]! === t.objective.count) {
          s = markDone(s, t.id, trickNo);
        } else {
          return fail(s, `Task failed: ${describeObjective(t.objective)} — finished with ${s.tricksWon[t.owner]}.`);
        }
      }
    }
    return s.tasks.every((t) => t.status === "done")
      ? { ...s, phase: "won" }
      : fail(s, "Out of cards: not all tasks were completed.");
  }

  // Win when every task is done (whole-mission objectives can only settle at the end,
  // so reaching here early means every task was trick-scoped).
  if (s.tasks.every((t) => t.status === "done")) {
    return { ...s, phase: "won" };
  }

  // Set up the next trick. The winner leads if they still hold cards, otherwise the
  // next seat that does. expectedTrickSize shrinks as seats run out (uneven deals).
  const leader = (s.hands[winner]?.length ?? 0) > 0 ? winner : nextSeatWithCards(s.hands, winner);
  return {
    ...s,
    trick: { leader, plays: [] },
    turn: leader,
    expectedTrickSize: countSeatsWithCards(s.hands),
  };
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
        : `Order violated: ${cardId(task.card!)} must be task #${c.order} but completed at #${idx}.`;
    case "relative": {
      const earlierUnfinished = state.tasks.some(
        (t) =>
          t.id !== task.id &&
          t.constraint.kind === "relative" &&
          t.constraint.order < c.order &&
          t.status !== "done"
      );
      return earlierUnfinished
        ? `Order violated: ${cardId(task.card!)} (rel #${c.order}) completed before an earlier relative task.`
        : null;
    }
    case "last": {
      // "Last" is judged among capture tasks (whole-mission objectives settle at game end).
      const othersPending = state.tasks.some(
        (t) => t.id !== task.id && t.objective.kind === "capture" && t.status !== "done"
      );
      return othersPending
        ? `Order violated: ${cardId(task.card!)} must be the last task completed.`
        : null;
    }
  }
}

/** Complete a CAPTURE task (assigns its 1-based completion index among captures). */
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

/** Complete a non-capture objective task (outside the capture ordering count). */
function markDone(state: GameState, taskId: string, trickNo: number): GameState {
  return {
    ...state,
    tasks: state.tasks.map((t) =>
      t.id === taskId ? { ...t, status: "done", completedAtTrick: trickNo } : t
    ),
  };
}
