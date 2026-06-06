import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type BotWeights, DEFAULT_WEIGHTS } from "@dsc/shared";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** A recorded training run — lets you see the bots improving over time. */
export interface TrainingRun {
  at: number;
  source: "cli" | "auto";
  generations: number;
  startWinRate: number;
  bestWinRate: number;
  weights: BotWeights;
}

/**
 * Persists the bots' current (tuned) weights and the history of training runs.
 * Weights are cached in memory so live games read them cheaply.
 */
export class BotLab {
  private baseDir: string;
  private weights: BotWeights;
  private runLog: TrainingRun[];

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? path.resolve(__dirname, "../../data/bot");
    mkdirSync(this.baseDir, { recursive: true });
    this.weights = this.readJson(this.weightsFile(), DEFAULT_WEIGHTS);
    this.runLog = this.readJson(this.runsFile(), [] as TrainingRun[]);
  }

  private weightsFile() {
    return path.join(this.baseDir, "weights.json");
  }
  private runsFile() {
    return path.join(this.baseDir, "runs.json");
  }
  private readJson<T>(file: string, fallback: T): T {
    if (!existsSync(file)) return fallback;
    try {
      return JSON.parse(readFileSync(file, "utf8")) as T;
    } catch {
      return fallback;
    }
  }

  current(): BotWeights {
    return this.weights;
  }

  setWeights(w: BotWeights): void {
    this.weights = w;
    writeFileSync(this.weightsFile(), JSON.stringify(w, null, 2), "utf8");
  }

  appendRun(run: TrainingRun): void {
    this.runLog.push(run);
    if (this.runLog.length > 500) this.runLog = this.runLog.slice(-500);
    writeFileSync(this.runsFile(), JSON.stringify(this.runLog, null, 2), "utf8");
  }

  runs(): TrainingRun[] {
    return this.runLog;
  }

  /** Summary for the API/UI. */
  stats() {
    const recent = this.runLog.slice(-30);
    const best = this.runLog.reduce((m, r) => Math.max(m, r.bestWinRate), 0);
    return {
      weights: this.weights,
      totalRuns: this.runLog.length,
      bestWinRate: best,
      latestWinRate: this.runLog.at(-1)?.bestWinRate ?? null,
      recent,
    };
  }
}
