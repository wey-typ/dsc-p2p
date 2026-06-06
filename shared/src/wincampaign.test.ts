import { describe, it, expect } from "vitest";
import { simulateWinCampaign } from "./index.js";

describe("simulateWinCampaign", () => {
  it("wins every level (heuristic, then solver) for a small config", () => {
    const r = simulateWinCampaign({ playerCounts: [2, 3], levels: [0, 2, 4], maxTries: 40 });
    expect(r.totals.cells).toBe(6);
    expect(r.totals.unsolved).toBe(0);
    expect(r.totals.won).toBe(r.totals.cells);
    for (const res of r.results) {
      expect(res.won).toBe(true);
      expect(res.tricks.length).toBeGreaterThan(0);
      expect(res.strategy === "heuristic" || res.strategy === "solver").toBe(true);
    }
  }, 30000);

  it("records which strategy won and how many tries it took", () => {
    const r = simulateWinCampaign({ playerCounts: [3], levels: [0], maxTries: 20 });
    const res = r.results[0]!;
    expect(res.triesUsed).toBeGreaterThanOrEqual(1);
    expect(res.playerCount).toBe(3);
  }, 20000);
});
