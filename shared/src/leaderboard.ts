/** Shared leaderboard shapes + ranking, used by both the server route and the client. */

export interface CrewRecord {
  name: string;
  level: number;
  cleared: number;
  attempts: number;
}

export interface LeaderboardEntry extends CrewRecord {
  rank: number;
  /** Cleared / (cleared + attempts), 0..1; 0 when nothing attempted. */
  successRate: number;
}

/**
 * Rank crews by missions cleared (desc), then fewer attempts (asc), then name (asc).
 * Returns a new sorted array with 1-based ranks and a computed success rate.
 */
export function rankLeaderboard(records: readonly CrewRecord[]): LeaderboardEntry[] {
  const sorted = records.slice().sort((a, b) => {
    if (b.cleared !== a.cleared) return b.cleared - a.cleared;
    if (a.attempts !== b.attempts) return a.attempts - b.attempts;
    return a.name.localeCompare(b.name);
  });
  return sorted.map((r, i) => {
    const denom = r.cleared + r.attempts;
    return { ...r, rank: i + 1, successRate: denom === 0 ? 0 : r.cleared / denom };
  });
}
