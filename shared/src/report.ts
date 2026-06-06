import { type BotWeights, DEFAULT_WEIGHTS } from "./bots.js";
import { type ResolvedTrick } from "./game.js";
import type { TaskState } from "./tasks.js";
import { missionName } from "./missions.js";
import { simulateBotGame } from "./training.js";

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
