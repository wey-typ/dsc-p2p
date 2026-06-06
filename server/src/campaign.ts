import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Persisted progress for one crew's campaign. */
export interface CampaignProgress {
  id: string;
  name: string;
  /** Index of the current mission (0-based). Increments on each clear. */
  level: number;
  /** Total failed attempts across the campaign. */
  attempts: number;
  /** Total missions cleared (== level once you've never gone back). */
  cleared: number;
  updatedAt: number;
}

/** Normalize a crew name into a stable filesystem-safe id. */
export function slugify(name: string): string {
  const s = (name ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s.length > 0 ? s.slice(0, 40) : "crew";
}

function freshProgress(id: string, name: string, now: number): CampaignProgress {
  return { id, name, level: 0, attempts: 0, cleared: 0, updatedAt: now };
}

/**
 * Tiny JSON-file store for campaign progress. One file per campaign id.
 * `now` is injectable so tests stay deterministic.
 */
export class CampaignStore {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? path.resolve(__dirname, "../../data/campaigns");
    mkdirSync(this.baseDir, { recursive: true });
  }

  private fileFor(id: string): string {
    return path.join(this.baseDir, `${id}.json`);
  }

  /** Load existing progress for `name`, or a fresh record if none exists. */
  load(name: string, now = 0): CampaignProgress {
    const id = slugify(name);
    const file = this.fileFor(id);
    if (existsSync(file)) {
      try {
        const data = JSON.parse(readFileSync(file, "utf8")) as CampaignProgress;
        return { ...freshProgress(id, name, now), ...data, id };
      } catch {
        // Corrupt file -> start clean rather than crash a live game.
      }
    }
    return freshProgress(id, name, now);
  }

  save(p: CampaignProgress): void {
    writeFileSync(this.fileFor(p.id), JSON.stringify(p, null, 2), "utf8");
  }

  /** All saved campaigns (for the leaderboard). */
  list(): CampaignProgress[] {
    if (!existsSync(this.baseDir)) return [];
    return readdirSync(this.baseDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        try {
          return JSON.parse(readFileSync(path.join(this.baseDir, f), "utf8")) as CampaignProgress;
        } catch {
          return null;
        }
      })
      .filter((x): x is CampaignProgress => x !== null);
  }
}
