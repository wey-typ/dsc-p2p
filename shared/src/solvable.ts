import { type Card, type Player } from "./types.js";
import { deal } from "./cards.js";
import { legalMoves, trickWinner } from "./trick.js";
import { type Mission, type GameState, makeGameState } from "./game.js";
import { type MissionTask } from "./tasks.js";
import { missionTaskCount, missionName } from "./missions.js";

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
 * Build a game whose mission is GUARANTEED solvable for the dealt hands: we first play a
 * random legal game, then derive the tasks from it (each task's owner = the seat that
 * actually won that card, ordering constraints follow the real completion order). This is
 * how cooperative puzzles are made winnable — random constrained missions usually aren't.
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

  const K = Math.min(missionTaskCount(level), candidateTricks.length);
  // Spread the K chosen tricks across the timeline for a varied completion order.
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
    card: c.card,
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

  const mission: Mission = {
    id: `mission-${level + 1}`,
    name: `Mission ${level + 1} · ${missionName(level)}`,
    tasks,
  };
  return {
    state: makeGameState(players, hands, commander, mission),
    line: plan.map((p) => p.card),
  };
}
