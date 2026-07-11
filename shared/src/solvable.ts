import { type Card, type ColorSuit, type Player, COLOR_SUITS } from "./types.js";
import { deal } from "./cards.js";
import { legalMoves, trickWinner } from "./trick.js";
import { type Mission, type GameState, makeGameState } from "./game.js";
import { type MissionTask, type TaskObjective } from "./tasks.js";
import { missionTaskCount, missionName, objectiveCountForLevel, commsForLevel } from "./missions.js";

/** Seats still holding cards. */
function countWithCards(hands: readonly Card[][]): number {
  return hands.reduce((n, h) => n + (h.length > 0 ? 1 : 0), 0);
}
function nextWithCards(hands: readonly Card[][], from: number): number {
  const n = hands.length;
  for (let step = 1; step <= n; step++) {
    const seat = (from + step) % n;
    if ((hands[seat]?.length ?? 0) > 0) return seat;
  }
  return from;
}

interface PlannedPlay {
  card: Card;
  winner: number;
  trickIndex: number;
}

/** Play out a full random-but-legal game (no tasks) to learn who wins each card, in order. */
function simulateRawTricks(hands: Card[][], commander: number, rng: () => number): PlannedPlay[] {
  const work = hands.map((h) => h.slice());
  const plan: PlannedPlay[] = [];
  let leader = commander;
  let trickIndex = 0;
  while (countWithCards(work) > 0) {
    const expected = countWithCards(work);
    let turn = leader;
    const plays: { seat: number; card: Card }[] = [];
    for (let k = 0; k < expected; k++) {
      const legal = legalMoves(work[turn]!, { leader, plays });
      const card = legal[Math.floor(rng() * legal.length)]!;
      const idx = work[turn]!.findIndex((c) => c.suit === card.suit && c.value === card.value);
      work[turn]!.splice(idx, 1);
      plays.push({ seat: turn, card });
      turn = nextWithCards(work, turn);
    }
    const winner = trickWinner({ leader, plays });
    for (const p of plays) plan.push({ card: p.card, winner, trickIndex });
    leader = (work[winner]?.length ?? 0) > 0 ? winner : nextWithCards(work, winner);
    trickIndex++;
  }
  return plan;
}

/** A solvable game plus a known winning line of cards (the playthrough it was derived from). */
export interface SolvableGame {
  state: GameState;
  /** Cards in play order that complete every task in constraint order (a guaranteed win). */
  line: Card[];
}

/**
 * Derive extension objectives that the recorded playthrough already satisfies:
 * whoever won trick 1 gets "win the first trick"; a seat that never captured a colour
 * gets "win no <colour> cards"; the seat with the fewest trick wins gets "win exactly N".
 * Because every objective is read off the same line, the whole set stays jointly solvable.
 */
function deriveObjectives(
  n: number,
  plan: PlannedPlay[],
  count: number,
  rng: () => number
): { objective: TaskObjective; owner: number }[] {
  if (count <= 0 || plan.length === 0) return [];

  const winCounts = new Array<number>(n).fill(0);
  const capturedSuits: Set<ColorSuit>[] = Array.from({ length: n }, () => new Set());
  const trickWinners: number[] = [];
  for (const p of plan) {
    if (trickWinners[p.trickIndex] === undefined) {
      trickWinners[p.trickIndex] = p.winner;
      winCounts[p.winner]!++;
    }
    if (p.card.suit !== "sub") capturedSuits[p.winner]!.add(p.card.suit as ColorSuit);
  }

  const out: { objective: TaskObjective; owner: number }[] = [];
  const usedOwners = new Set<number>();

  // 1. Win the first trick — always derivable.
  out.push({ objective: { kind: "winTrick", trick: 1 }, owner: trickWinners[0]! });
  usedOwners.add(trickWinners[0]!);
  if (out.length >= count) return out.slice(0, count);

  // 2. Win no <colour> cards — pick a (seat, colour) the playthrough already respects,
  //    preferring a seat that doesn't own an objective yet.
  const avoidCandidates: { seat: number; suit: ColorSuit }[] = [];
  for (let seat = 0; seat < n; seat++) {
    for (const suit of COLOR_SUITS) {
      if (!capturedSuits[seat]!.has(suit)) avoidCandidates.push({ seat, suit });
    }
  }
  const preferred = avoidCandidates.filter((c) => !usedOwners.has(c.seat));
  const pool = preferred.length > 0 ? preferred : avoidCandidates;
  if (pool.length > 0) {
    const pick = pool[Math.floor(rng() * pool.length)]!;
    out.push({ objective: { kind: "avoidColor", suit: pick.suit }, owner: pick.seat });
    usedOwners.add(pick.seat);
  }
  if (out.length >= count) return out.slice(0, count);

  // 3. Win exactly N tricks — give the quota to the seat with the fewest wins
  //    (prefer an unused owner) so the ask stays legible ("win exactly 2", not 9).
  const seats = Array.from({ length: n }, (_, s) => s).sort(
    (a, b) => winCounts[a]! - winCounts[b]!
  );
  const quotaSeat = seats.find((s) => !usedOwners.has(s)) ?? seats[0]!;
  out.push({ objective: { kind: "winExactly", count: winCounts[quotaSeat]! }, owner: quotaSeat });

  return out.slice(0, count);
}

/**
 * Build a game whose mission is GUARANTEED solvable for the dealt hands: we first play a
 * random legal game, then derive the tasks from it (each capture task's owner = the seat
 * that actually won that card, extension objectives = feats that playthrough actually
 * performed, ordering constraints follow the real completion order). This is how
 * cooperative puzzles are made winnable — random constrained missions usually aren't.
 */
export function buildSolvableGame(players: Player[], level: number, rng: () => number): GameState {
  return buildSolvableGameWithLine(players, level, rng).state;
}

/** As `buildSolvableGame`, but also returns the constructive winning line (for tests/proof). */
export function buildSolvableGameWithLine(
  players: Player[],
  level: number,
  rng: () => number
): SolvableGame {
  const n = players.length;
  const { hands, commander } = deal(n, rng);
  const plan = simulateRawTricks(hands, commander, rng);

  // Candidate tricks: those containing at least one colour card (valid task targets).
  const byTrick = new Map<number, { winner: number; colourCards: Card[] }>();
  for (const p of plan) {
    if (p.card.suit === "sub") continue;
    const entry = byTrick.get(p.trickIndex) ?? { winner: p.winner, colourCards: [] };
    entry.colourCards.push(p.card);
    byTrick.set(p.trickIndex, entry);
  }
  const candidateTricks = [...byTrick.entries()]
    .map(([trickIndex, e]) => ({ trickIndex, ...e }))
    .sort((a, b) => a.trickIndex - b.trickIndex);

  const total = Math.min(missionTaskCount(level), candidateTricks.length);
  const objectives = deriveObjectives(
    n,
    plan,
    Math.min(objectiveCountForLevel(level), Math.max(0, total - 1)),
    rng
  );
  const K = Math.max(1, total - objectives.length);

  // Spread the K chosen capture tricks across the timeline for a varied completion order.
  const chosen: { trickIndex: number; winner: number; card: Card }[] = [];
  for (let i = 0; i < K; i++) {
    const t = candidateTricks[Math.floor((i * candidateTricks.length) / K)]!;
    const card = t.colourCards[Math.floor(rng() * t.colourCards.length)]!;
    chosen.push({ trickIndex: t.trickIndex, winner: t.winner, card });
  }
  chosen.sort((a, b) => a.trickIndex - b.trickIndex); // completion order

  const lastIdx = chosen.length - 1;
  const hasLast = level >= 2 && chosen.length >= 2;
  const orderedMax = hasLast ? lastIdx : chosen.length;

  const tasks: MissionTask[] = chosen.map((c) => ({
    objective: { kind: "capture", card: c.card },
    owner: c.winner,
    constraint: { kind: "none" },
  }));
  if (level >= 4) {
    for (let i = 0; i < orderedMax; i++) {
      tasks[i] = { ...tasks[i]!, constraint: { kind: "relative", order: i + 1 } };
    }
  }
  if (level >= 6 && orderedMax >= 1) {
    tasks[0] = { ...tasks[0]!, constraint: { kind: "absolute", order: 1 } };
  }
  if (hasLast) {
    tasks[lastIdx] = { ...tasks[lastIdx]!, constraint: { kind: "last" } };
  }
  for (const o of objectives) {
    tasks.push({ objective: o.objective, owner: o.owner, constraint: { kind: "none" } });
  }

  const mission: Mission = {
    id: `mission-${level + 1}`,
    name: `Mission ${level + 1} · ${missionName(level)}`,
    tasks,
    comms: commsForLevel(level),
  };
  return {
    state: makeGameState(players, hands, commander, mission),
    line: plan.map((p) => p.card),
  };
}
