import { type BotWeights, DEFAULT_WEIGHTS, chooseBotPlay } from "./bots.js";
import { type ResolvedTrick, type GameState, playCard } from "./game.js";
import type { TaskState } from "./tasks.js";
import { missionName } from "./missions.js";
import { simulateBotGame } from "./training.js";
import { buildSolvableGame } from "./solvable.js";
import { solveGame } from "./solver.js";
import { mulberry32 } from "./rng.js";
import type { Player } from "./types.js";

/** One bot game within the campaign report. */
export interface LevelGameRecord {
  pass: number; // 1-based
  level: number; // 0-based
  missionName: string;
  outcome: "won" | "lost";
  failReason?: string;
  tricks: ResolvedTrick[];
  tasks: TaskState[];
  tasksCleared: number;
  taskTotal: number;
}

/** Per-level aggregate across all passes. */
export interface LevelSummary {
  level: number;
  missionName: string;
  attempts: number;
  wins: number;
  failures: number;
  winRate: number;
}

export interface BotCampaignReport {
  passes: number;
  levels: number[];
  playerCount: number;
  weights: BotWeights;
  playerNames: string[];
  games: LevelGameRecord[];
  summary: LevelSummary[];
  totals: { games: number; wins: number; failures: number };
}

export interface CampaignOptions {
  passes?: number;
  levels?: number[];
  players?: number;
  weights?: BotWeights;
  seedBase?: number;
}

/**
 * Play every level in order, `passes` times (looping back to the first level after the
 * last), recording each trick and per-level failures. Deterministic for a fixed seedBase.
 */
export function simulateBotCampaign(opts: CampaignOptions = {}): BotCampaignReport {
  const passes = opts.passes ?? 5;
  const levels = opts.levels ?? [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const players = opts.players ?? 4;
  const weights = opts.weights ?? DEFAULT_WEIGHTS;
  const seedBase = opts.seedBase ?? 20260607;

  const games: LevelGameRecord[] = [];
  for (let pass = 1; pass <= passes; pass++) {
    for (const level of levels) {
      const seed = seedBase + pass * 100003 + level * 31;
      const state = simulateBotGame(players, level, seed, weights);
      const tasksCleared = state.tasks.filter((t) => t.status === "done").length;
      games.push({
        pass,
        level,
        missionName: missionName(level),
        outcome: state.phase === "won" ? "won" : "lost",
        failReason: state.failReason,
        tricks: state.resolvedTricks ?? [],
        tasks: state.tasks,
        tasksCleared,
        taskTotal: state.tasks.length,
      });
    }
  }

  const summary: LevelSummary[] = levels.map((level) => {
    const forLevel = games.filter((g) => g.level === level);
    const wins = forLevel.filter((g) => g.outcome === "won").length;
    return {
      level,
      missionName: missionName(level),
      attempts: forLevel.length,
      wins,
      failures: forLevel.length - wins,
      winRate: forLevel.length === 0 ? 0 : wins / forLevel.length,
    };
  });

  const wins = games.filter((g) => g.outcome === "won").length;
  return {
    passes,
    levels,
    playerCount: players,
    weights,
    playerNames: Array.from({ length: players }, (_, i) => `Bot ${i + 1}`),
    games,
    summary,
    totals: { games: games.length, wins, failures: games.length - wins },
  };
}

// ============================================================
// Win-every-level campaign: bots must WIN each level before advancing. Try the heuristic
// first; after a few failed tries, REVISE the strategy to the full-information solver
// (which wins guaranteed-solvable instances). Runs across player counts.
// ============================================================

export interface WinLevelResult {
  playerCount: number;
  level: number;
  missionName: string;
  triesUsed: number;
  heuristicFailures: number;
  strategy: "heuristic" | "solver" | "none";
  won: boolean;
  tricks: ResolvedTrick[];
  tasks: TaskState[];
  tasksCleared: number;
  taskTotal: number;
}

export interface WinCampaignReport {
  playerCounts: number[];
  levels: number[];
  reviseAfter: number;
  maxTries: number;
  results: WinLevelResult[];
  totals: { cells: number; won: number; viaHeuristic: number; viaSolver: number; unsolved: number };
}

export interface WinCampaignOptions {
  playerCounts?: number[];
  levels?: number[];
  weights?: BotWeights;
  reviseAfter?: number;
  maxTries?: number;
  solverNodes?: number;
  seedBase?: number;
}

function bots(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({ id: `b${i}`, name: `Bot ${i + 1}`, isBot: true }));
}

function playHeuristic(start: GameState, weights: BotWeights): GameState {
  let s = start;
  for (let i = 0; i < 80 && s.phase === "playing"; i++) {
    s = playCard(s, s.turn, chooseBotPlay(s, s.turn, weights));
  }
  return s;
}

function solveAndReplayState(start: GameState, nodes: number): GameState | null {
  const line = solveGame(start, { nodes });
  if (!line) return null;
  let s = start;
  for (const card of line) s = playCard(s, s.turn, card);
  return s;
}

function recordOf(pc: number, level: number, final: GameState, tries: number, fails: number, strategy: WinLevelResult["strategy"]): WinLevelResult {
  return {
    playerCount: pc,
    level,
    missionName: missionName(level),
    triesUsed: tries,
    heuristicFailures: fails,
    strategy,
    won: final.phase === "won",
    tricks: final.resolvedTricks ?? [],
    tasks: final.tasks,
    tasksCleared: final.tasks.filter((t) => t.status === "done").length,
    taskTotal: final.tasks.length,
  };
}

/**
 * For each player count and level, keep trying (on guaranteed-solvable missions) until the
 * bots WIN, then advance. Heuristic first; after `reviseAfter` failures, switch to the
 * solver. Deterministic for a fixed seedBase.
 */
export function simulateWinCampaign(opts: WinCampaignOptions = {}): WinCampaignReport {
  const playerCounts = opts.playerCounts ?? [2, 3];
  const levels = opts.levels ?? [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const weights = opts.weights ?? DEFAULT_WEIGHTS;
  const reviseAfter = opts.reviseAfter ?? 5;
  const maxTries = opts.maxTries ?? 60;
  // Keep the budget modest: hard-to-search (but solvable) instances fail fast so we re-deal
  // to a quickly-solvable one — every level has those, so the crew always wins eventually.
  const solverNodes = opts.solverNodes ?? 45000;
  const seedBase = opts.seedBase ?? 424242;

  const results: WinLevelResult[] = [];
  for (const pc of playerCounts) {
    for (const level of levels) {
      let tries = 0;
      let fails = 0;
      let strategy: WinLevelResult["strategy"] = "heuristic";
      let final: GameState | null = null;
      let lastSeen: GameState | null = null;
      while (tries < maxTries) {
        tries++;
        const seed = seedBase + pc * 1_000_003 + level * 9973 + tries * 31;
        const start = buildSolvableGame(bots(pc), level, mulberry32(seed));
        if (strategy === "heuristic") {
          const end = playHeuristic(start, weights);
          lastSeen = end;
          if (end.phase === "won") {
            final = end;
            break;
          }
          fails++;
          if (fails >= reviseAfter) strategy = "solver";
        } else {
          const end = solveAndReplayState(start, solverNodes);
          if (end) {
            final = end;
            break;
          }
          // solvable instance exceeded the node budget — re-deal a fresh one
        }
      }
      const chosen = final ?? lastSeen!;
      results.push(recordOf(pc, level, chosen, tries, fails, final ? strategy : "none"));
    }
  }

  const won = results.filter((r) => r.won).length;
  return {
    playerCounts,
    levels,
    reviseAfter,
    maxTries,
    results,
    totals: {
      cells: results.length,
      won,
      viaHeuristic: results.filter((r) => r.won && r.strategy === "heuristic").length,
      viaSolver: results.filter((r) => r.won && r.strategy === "solver").length,
      unsolved: results.length - won,
    },
  };
}
