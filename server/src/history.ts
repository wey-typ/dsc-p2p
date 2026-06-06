import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type GameRecord, type HistorySummary, toSummary } from "@dsc/shared";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** JSON-file store of finished games (one file per game) for post-game review. */
export class HistoryStore {
  private baseDir: string;
  private cap: number;

  constructor(baseDir?: string, cap = 200) {
    this.baseDir = baseDir ?? path.resolve(__dirname, "../../data/history");
    this.cap = cap;
    mkdirSync(this.baseDir, { recursive: true });
  }

  private fileFor(id: string): string {
    return path.join(this.baseDir, `${id}.json`);
  }

  save(rec: GameRecord): void {
    writeFileSync(this.fileFor(rec.id), JSON.stringify(rec, null, 2), "utf8");
    this.prune();
  }

  get(id: string): GameRecord | null {
    const file = this.fileFor(id);
    if (!existsSync(file)) return null;
    try {
      return JSON.parse(readFileSync(file, "utf8")) as GameRecord;
    } catch {
      return null;
    }
  }

  private all(): GameRecord[] {
    if (!existsSync(this.baseDir)) return [];
    return readdirSync(this.baseDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        try {
          return JSON.parse(readFileSync(path.join(this.baseDir, f), "utf8")) as GameRecord;
        } catch {
          return null;
        }
      })
      .filter((x): x is GameRecord => x !== null);
  }

  /** Recent games first, as lightweight summaries. */
  listSummaries(limit = 50): HistorySummary[] {
    return this.all()
      .sort((a, b) => b.finishedAt - a.finishedAt)
      .slice(0, limit)
      .map(toSummary);
  }

  /** Keep only the newest `cap` records on disk. */
  private prune(): void {
    const recs = this.all().sort((a, b) => b.finishedAt - a.finishedAt);
    for (const old of recs.slice(this.cap)) {
      try {
        const f = this.fileFor(old.id);
        if (existsSync(f)) unlinkSync(f);
      } catch {
        /* ignore */
      }
    }
  }
}
