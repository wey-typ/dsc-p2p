import { describe, it, expect } from "vitest";
import {
  type Player,
  buildSolvableGameWithLine,
  buildSolvableGame,
  solveGame,
  playCard,
  mulberry32,
  missionTaskCount,
} from "./index.js";

function bots(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({ id: `b${i}`, name: `B${i}`, isBot: true }));
}

/** Replay a card line through the engine, stopping at game end. */
function replay(state: ReturnType<typeof buildSolvableGame>, line: ReturnType<typeof buildSolvableGameWithLine>["line"]) {
  let s = state;
  for (const card of line) {
    if (s.phase !== "playing") break;
    s = playCard(s, s.turn, card);
  }
  return s;
}

describe("buildSolvableGame", () => {
  it("its constructive line wins, for every player count and level", () => {
    for (const n of [2, 3, 4, 5]) {
      for (const level of [0, 2, 4, 6, 8]) {
        const { state, line } = buildSolvableGameWithLine(bots(n), level, mulberry32(n * 100 + level));
        const end = replay(state, line);
        expect(end.phase).toBe("won"); // guaranteed solvable by construction
      }
    }
  });

  it("makes tasks that are valid colour cards with in-range owners", () => {
    const { state } = buildSolvableGameWithLine(bots(4), 6, mulberry32(3));
    expect(state.tasks.length).toBeLessThanOrEqual(missionTaskCount(6));
    expect(state.tasks.length).toBeGreaterThan(0);
    for (const t of state.tasks) {
      expect(t.card.suit).not.toBe("sub");
      expect(t.owner).toBeGreaterThanOrEqual(0);
      expect(t.owner).toBeLessThan(4);
    }
    // exactly one 'last' at level >= 2
    expect(state.tasks.filter((t) => t.constraint.kind === "last")).toHaveLength(1);
  });

  it("the solver also finds a win on an easy solvable instance", () => {
    const g = buildSolvableGame(bots(3), 0, mulberry32(1));
    const line = solveGame(g, { nodes: 200000 });
    expect(line).not.toBeNull();
  });
});
