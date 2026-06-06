import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DEFAULT_WEIGHTS } from "@dsc/shared";
import { BotLab } from "./botlab.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "dsc-botlab-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("BotLab", () => {
  it("starts from default weights and persists updates across reloads", () => {
    const lab = new BotLab(dir);
    expect(lab.current()).toEqual(DEFAULT_WEIGHTS);
    const tuned = { ...DEFAULT_WEIGHTS, taskAversion: 14 };
    lab.setWeights(tuned);
    expect(new BotLab(dir).current()).toEqual(tuned);
  });

  it("appends training runs and summarises them", () => {
    const lab = new BotLab(dir);
    lab.appendRun({ at: 1, source: "cli", generations: 5, startWinRate: 0.2, bestWinRate: 0.25, weights: DEFAULT_WEIGHTS });
    lab.appendRun({ at: 2, source: "auto", generations: 3, startWinRate: 0.25, bestWinRate: 0.27, weights: DEFAULT_WEIGHTS });
    const s = lab.stats();
    expect(s.totalRuns).toBe(2);
    expect(s.bestWinRate).toBeCloseTo(0.27);
    expect(s.latestWinRate).toBeCloseTo(0.27);
    expect(s.recent).toHaveLength(2);
    // persisted
    expect(new BotLab(dir).runs()).toHaveLength(2);
  });
});
