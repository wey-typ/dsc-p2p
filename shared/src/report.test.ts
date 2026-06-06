import { describe, it, expect } from "vitest";
import { simulateBotCampaign } from "./index.js";

describe("simulateBotCampaign", () => {
  const opts = { passes: 3, levels: [0, 1, 2], players: 3, seedBase: 123 };

  it("plays every level once per pass and aggregates per-level results", () => {
    const r = simulateBotCampaign(opts);
    expect(r.games).toHaveLength(3 * 3); // passes × levels
    expect(r.summary).toHaveLength(3);
    for (const s of r.summary) {
      expect(s.attempts).toBe(3); // one per pass
      expect(s.wins + s.failures).toBe(s.attempts);
    }
    expect(r.totals.games).toBe(9);
    expect(r.totals.wins + r.totals.failures).toBe(9);
    // each game has its outcome and (for played games) some tricks
    for (const g of r.games) {
      expect(["won", "lost"]).toContain(g.outcome);
      expect(g.tasks.length).toBe(g.taskTotal);
    }
  });

  it("is deterministic for a fixed seedBase", () => {
    const a = simulateBotCampaign(opts);
    const b = simulateBotCampaign(opts);
    expect(a.totals).toEqual(b.totals);
    expect(a.summary).toEqual(b.summary);
  });

  it("passes loop back to the first level (order preserved each pass)", () => {
    const r = simulateBotCampaign(opts);
    const passOne = r.games.filter((g) => g.pass === 1).map((g) => g.level);
    expect(passOne).toEqual([0, 1, 2]);
    const passThree = r.games.filter((g) => g.pass === 3).map((g) => g.level);
    expect(passThree).toEqual([0, 1, 2]);
  });
});
