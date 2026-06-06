import { describe, it, expect } from "vitest";
import { rankLeaderboard } from "./leaderboard.js";

describe("rankLeaderboard", () => {
  it("ranks by cleared desc, then fewer attempts, then name", () => {
    const ranked = rankLeaderboard([
      { name: "Beta", level: 3, cleared: 3, attempts: 5 },
      { name: "Alpha", level: 5, cleared: 5, attempts: 2 },
      { name: "Gamma", level: 3, cleared: 3, attempts: 1 },
    ]);
    expect(ranked.map((e) => e.name)).toEqual(["Alpha", "Gamma", "Beta"]);
    expect(ranked.map((e) => e.rank)).toEqual([1, 2, 3]);
  });

  it("computes success rate and handles zero activity", () => {
    const [a, b] = rankLeaderboard([
      { name: "Win", level: 3, cleared: 3, attempts: 1 }, // 75%
      { name: "New", level: 0, cleared: 0, attempts: 0 }, // 0%
    ]);
    expect(a!.successRate).toBeCloseTo(0.75);
    expect(b!.successRate).toBe(0);
  });

  it("returns an empty array for no records", () => {
    expect(rankLeaderboard([])).toEqual([]);
  });
});
