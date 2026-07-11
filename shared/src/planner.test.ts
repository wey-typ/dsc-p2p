import { describe, it, expect } from "vitest";
import {
  type Player,
  type GameState,
  BotPlanner,
  buildSolvableGame,
  buildSolvableGameWithLine,
  buildMissionForLevel,
  createGame,
  chooseBotPlayFast,
  isLegalPlay,
  legalMovesFor,
  mulberry32,
  playCard,
} from "./index.js";

function players(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({ id: `b${i}`, name: `Bot${i}`, isBot: true }));
}

function runPlannedGame(start: GameState, nodes = 20000, planner?: BotPlanner): GameState {
  planner ??= new BotPlanner({ nodes, maxAttempts: 2 });
  let state = start;
  for (let i = 0; i < 80 && state.phase === "playing"; i++) {
    const card = planner.choose(state, state.turn);
    expect(isLegalPlay(card, state.hands[state.turn]!, state.trick)).toBe(true);
    state = playCard(state, state.turn, card);
  }
  return state;
}

describe("BotPlanner", () => {
  it("always wins live deals when seeded with the generator's winning line", { timeout: 60000 }, () => {
    // Mirrors the live server: buildSolvableGameWithLine + seedPlan at game start.
    for (const n of [3, 4]) {
      for (const level of [0, 2, 4, 6]) {
        for (let seed = 0; seed < 4; seed++) {
          const { state, line } = buildSolvableGameWithLine(players(n), level, mulberry32(seed * 31 + level));
          const planner = new BotPlanner({ nodes: 20000, maxAttempts: 2 });
          planner.seedPlan(state, line);
          expect(runPlannedGame(state, 20000, planner).phase).toBe("won");
        }
      }
    }
  });

  it("usually wins solvable missions even without a seeded line", { timeout: 60000 }, () => {
    let wins = 0;
    const games = 8;
    for (let seed = 0; seed < games; seed++) {
      const start = buildSolvableGame(players(3), 2, mulberry32(seed * 31));
      if (runPlannedGame(start).phase === "won") wins++;
    }
    expect(wins / games).toBeGreaterThanOrEqual(0.75);
  });

  it("always plays legal moves and terminates on random (possibly unsolvable) deals", { timeout: 60000 }, () => {
    for (const level of [4, 8]) {
      for (let seed = 0; seed < 2; seed++) {
        const start = createGame(
          players(4),
          buildMissionForLevel(4, level, mulberry32(seed)),
          mulberry32(seed + 1)
        );
        const end = runPlannedGame(start, 5000);
        expect(["won", "lost"]).toContain(end.phase);
      }
    }
  });

  it("replans when another seat deviates from the plan", () => {
    const start = buildSolvableGame(players(3), 2, mulberry32(7));
    const planner = new BotPlanner({ nodes: 20000, maxAttempts: 2 });
    let state = start;
    let deviated = false;
    for (let i = 0; i < 80 && state.phase === "playing"; i++) {
      let card;
      if (!deviated && i === 2) {
        // A "human" plays the fast heuristic's pick instead of the planner's plan.
        card = chooseBotPlayFast(state, state.turn);
        deviated = true;
      } else {
        card = planner.choose(state, state.turn);
      }
      expect(isLegalPlay(card, state.hands[state.turn]!, state.trick)).toBe(true);
      state = playCard(state, state.turn, card);
    }
    expect(["won", "lost"]).toContain(state.phase);
  });

  it("stops searching once a deal is proved hopeless, but keeps playing legally", () => {
    // A tiny node budget forces inconclusive solves; after maxAttempts the planner
    // must fall back to the heuristic without ever stalling or playing illegally.
    const start = createGame(
      players(5),
      buildMissionForLevel(5, 8, mulberry32(3)),
      mulberry32(4)
    );
    const planner = new BotPlanner({ nodes: 200, maxAttempts: 1 });
    let state = start;
    for (let i = 0; i < 80 && state.phase === "playing"; i++) {
      const card = planner.choose(state, state.turn);
      expect(legalMovesFor(state, state.turn).some((m) => m.suit === card.suit && m.value === card.value)).toBe(true);
      state = playCard(state, state.turn, card);
    }
    expect(["won", "lost"]).toContain(state.phase);
  });
});
