import type { Player } from "./types.js";
import { type BotWeights, DEFAULT_WEIGHTS, chooseBotPlay } from "./bots.js";
import { type GameState, createGame, playCard } from "./game.js";
import { buildMissionForLevel } from "./missions.js";
import { mulberry32 } from "./rng.js";
import { solveGame } from "./solver.js";

/** Play one full bot-only game with the given weights and return the FINAL state. */
export function simulateBotGame(
  n: number,
  level: number,
  seed: number,
  weights: BotWeights
): GameState {
  let state = createGame(botPlayers(n), buildMissionForLevel(n, level, mulberry32(seed)), mulberry32(seed + 7));
  for (let i = 0; i < 80 && state.phase === "playing"; i++) {
    state = playCard(state, state.turn, chooseBotPlay(state, state.turn, weights));
  }
  return state;
}

/** One generation's result during training (for the "improvement over time" log). */
export interface TrainingGeneration {
  gen: number;
  /** Win rate of the candidate evaluated this generation. */
  winRate: number;
  /** Best win rate found so far (monotonic). */
  bestWinRate: number;
  weights: BotWeights;
}

export interface EvalOptions {
  players: number[];
  levels: number[];
  gamesPerCell: number;
  seedBase: number;
}

export const DEFAULT_EVAL: EvalOptions = {
  players: [2, 3, 4], // includes 2- and 3-player games
  levels: [0, 1, 2],
  gamesPerCell: 12,
  seedBase: 1000,
};

function botPlayers(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({ id: `b${i}`, name: `B${i}`, isBot: true }));
}

/** Play one full bot-only game with the given weights; return true on a win. */
export function playBotGame(n: number, level: number, seed: number, weights: BotWeights): boolean {
  return simulateBotGame(n, level, seed, weights).phase === "won";
}

/**
 * Solve a deal with the full-information solver and replay the winning line to produce the
 * final (won) state — with `resolvedTricks` for the report. Returns null if unsolvable.
 */
export function solveAndReplay(
  n: number,
  level: number,
  seed: number,
  nodes = 60000
): GameState | null {
  const start = createGame(botPlayers(n), buildMissionForLevel(n, level, mulberry32(seed)), mulberry32(seed + 7));
  const line = solveGame(start, { nodes });
  if (!line) return null;
  let s = start;
  for (const card of line) s = playCard(s, s.turn, card);
  return s;
}

/** Win rate of `weights` across the evaluation suite (deterministic for fixed seeds). */
export function evaluateWeights(weights: BotWeights, opts: EvalOptions = DEFAULT_EVAL): number {
  let games = 0;
  let wins = 0;
  for (const n of opts.players) {
    for (const level of opts.levels) {
      for (let g = 0; g < opts.gamesPerCell; g++) {
        const seed = opts.seedBase + g * 101 + level * 17 + n * 7;
        if (playBotGame(n, level, seed, weights)) wins++;
        games++;
      }
    }
  }
  return games === 0 ? 0 : wins / games;
}

const KEYS: (keyof BotWeights)[] = ["trumpAversion", "taskAversion", "highCardAversion", "cheapWinBias"];

function clampWeights(w: BotWeights): BotWeights {
  return {
    trumpAversion: Math.max(0, w.trumpAversion),
    taskAversion: Math.max(0, w.taskAversion),
    highCardAversion: Math.max(0, Math.min(3, w.highCardAversion)),
    cheapWinBias: Math.max(0, w.cheapWinBias),
  };
}

function mutate(w: BotWeights, rng: () => number, scale: number): BotWeights {
  const out = { ...w };
  for (const k of KEYS) {
    const jitter = (rng() * 2 - 1) * scale * (k === "highCardAversion" ? 0.3 : 3);
    out[k] = w[k] + jitter;
  }
  return clampWeights(out);
}

export interface TrainResult {
  best: BotWeights;
  bestWinRate: number;
  startWinRate: number;
  log: TrainingGeneration[];
}

/**
 * Hill-climb the weights over `generations` rounds of (mutate → evaluate → keep-if-better).
 * Deterministic for a fixed `seed`. Returns the best weights + a per-generation log.
 */
export function trainWeights(
  start: BotWeights = DEFAULT_WEIGHTS,
  generations = 20,
  opts: EvalOptions = DEFAULT_EVAL,
  seed = 12345
): TrainResult {
  const rng = mulberry32(seed);
  let best = clampWeights(start);
  let bestWinRate = evaluateWeights(best, opts);
  const startWinRate = bestWinRate;
  const log: TrainingGeneration[] = [];
  for (let gen = 1; gen <= generations; gen++) {
    const scale = 1 - (gen / generations) * 0.6; // anneal the step size
    const candidate = mutate(best, rng, scale);
    const winRate = evaluateWeights(candidate, opts);
    if (winRate > bestWinRate) {
      best = candidate;
      bestWinRate = winRate;
    }
    log.push({ gen, winRate, bestWinRate, weights: best });
  }
  return { best, bestWinRate, startWinRate, log };
}
