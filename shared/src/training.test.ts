import { describe, it, expect } from "vitest";
import { evaluateWeights, trainWeights, DEFAULT_WEIGHTS, type EvalOptions } from "./index.js";

const FAST: EvalOptions = { players: [3], levels: [0, 1], gamesPerCell: 6, seedBase: 500 };

describe("training", () => {
  it("evaluateWeights is deterministic for fixed seeds", () => {
    const a = evaluateWeights(DEFAULT_WEIGHTS, FAST);
    const b = evaluateWeights(DEFAULT_WEIGHTS, FAST);
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(1);
  });

  it("trainWeights never regresses (keeps the best) and logs each generation", () => {
    const res = trainWeights(DEFAULT_WEIGHTS, 8, FAST, 42);
    expect(res.log).toHaveLength(8);
    expect(res.bestWinRate).toBeGreaterThanOrEqual(res.startWinRate);
    // bestWinRate in the log is monotonic non-decreasing
    for (let i = 1; i < res.log.length; i++) {
      expect(res.log[i]!.bestWinRate).toBeGreaterThanOrEqual(res.log[i - 1]!.bestWinRate);
    }
  });

  it("is reproducible for a fixed training seed", () => {
    const a = trainWeights(DEFAULT_WEIGHTS, 5, FAST, 7);
    const b = trainWeights(DEFAULT_WEIGHTS, 5, FAST, 7);
    expect(a.bestWinRate).toBe(b.bestWinRate);
    expect(a.best).toEqual(b.best);
  });
});
