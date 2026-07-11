import { describe, it, expect } from "vitest";
import {
  buildMissionForLevel,
  missionTaskCount,
  mulberry32,
  cardId,
  type Card,
  type TaskConstraint,
} from "./index.js";

function kinds(level: number): TaskConstraint["kind"][] {
  return buildMissionForLevel(4, level, mulberry32(level + 1)).tasks.map((t) => t.constraint.kind);
}

describe("buildMissionForLevel", () => {
  it("scales task count with level and caps at 8", () => {
    expect(missionTaskCount(0)).toBe(2);
    expect(missionTaskCount(4)).toBe(6);
    expect(missionTaskCount(50)).toBe(8);
  });

  it("produces distinct colour-card capture tasks with in-range owners", () => {
    for (const level of [0, 3, 6, 9]) {
      const m = buildMissionForLevel(4, level, mulberry32(7));
      expect(m.tasks).toHaveLength(missionTaskCount(level));
      // all capture targets are distinct colour cards (never submarines)
      const captures = m.tasks.filter((t) => t.objective.kind === "capture");
      const ids = captures.map((t) => cardId((t.objective as { kind: "capture"; card: Card }).card));
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.every((id) => !id.startsWith("sub"))).toBe(true);
      expect(m.tasks.every((t) => t.owner >= 0 && t.owner < 4)).toBe(true);
    }
  });

  it("mixes in extension objectives from level 1", () => {
    expect(
      buildMissionForLevel(4, 0, mulberry32(1)).tasks.every((t) => t.objective.kind === "capture")
    ).toBe(true);
    for (const level of [1, 3, 6]) {
      const m = buildMissionForLevel(4, level, mulberry32(level));
      expect(m.tasks.some((t) => t.objective.kind !== "capture")).toBe(true);
      // objectives never carry ordering constraints
      expect(
        m.tasks.filter((t) => t.objective.kind !== "capture").every((t) => t.constraint.kind === "none")
      ).toBe(true);
    }
  });

  it("introduces constraints by band", () => {
    expect(kinds(0).every((k) => k === "none")).toBe(true); // band A
    expect(kinds(2).filter((k) => k === "last")).toHaveLength(1); // band B: one 'last'
    const c = kinds(4);
    expect(c.filter((k) => k === "relative").length).toBeGreaterThan(0); // band C
    expect(c.filter((k) => k === "last")).toHaveLength(1);
    expect(kinds(6).filter((k) => k === "absolute")).toHaveLength(1); // band D: pinned #1
  });

  it("keeps ordering constraints internally consistent", () => {
    const m = buildMissionForLevel(4, 7, mulberry32(3));
    const lasts = m.tasks.filter((t) => t.constraint.kind === "last");
    expect(lasts).toHaveLength(1); // at most one 'last'
    const abs = m.tasks
      .map((t) => t.constraint)
      .filter((c): c is { kind: "absolute"; order: number } => c.kind === "absolute");
    // any absolute order is within the task count and not colliding with 'last' slot
    for (const a of abs) {
      expect(a.order).toBeGreaterThanOrEqual(1);
      expect(a.order).toBeLessThan(m.tasks.length); // never the last slot
    }
    // relative orders are distinct and strictly increasing (an absolute #1 may take slot 1)
    const rel = m.tasks
      .map((t) => t.constraint)
      .filter((c): c is { kind: "relative"; order: number } => c.kind === "relative")
      .map((c) => c.order)
      .sort((x, y) => x - y);
    expect(new Set(rel).size).toBe(rel.length);
    rel.forEach((o, i) => i > 0 && expect(o).toBeGreaterThan(rel[i - 1]!));
  });
});
