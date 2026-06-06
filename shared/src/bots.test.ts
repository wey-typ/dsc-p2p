import { describe, it, expect } from "vitest";
import {
  type Player,
  type Card,
  type GameState,
  createGame,
  buildMissionForLevel,
  legalMovesFor,
  playCard,
  chooseBotPlay,
  isLegalPlay,
  isTaskReady,
  mulberry32,
} from "./index.js";

function players(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({ id: `b${i}`, name: `Bot${i}`, isBot: true }));
}

type Chooser = (s: GameState, seat: number) => Card;
const naive: Chooser = (s, seat) => legalMovesFor(s, seat)[0]!;
const smart: Chooser = (s, seat) => chooseBotPlay(s, seat);

function runGame(n: number, level: number, seed: number, choose: Chooser): GameState {
  let state = createGame(players(n), buildMissionForLevel(n, level, mulberry32(seed)), mulberry32(seed + 7));
  for (let i = 0; i < 60 && state.phase === "playing"; i++) {
    state = playCard(state, state.turn, choose(state, state.turn));
  }
  return state;
}

function winRate(n: number, level: number, games: number, choose: Chooser): number {
  let wins = 0;
  for (let s = 0; s < games; s++) if (runGame(n, level, s * 13 + level, choose).phase === "won") wins++;
  return wins / games;
}

describe("chooseBotPlay", () => {
  it("always returns a legal move and games terminate", () => {
    for (const n of [2, 3, 4, 5]) {
      for (const level of [0, 3, 6, 8]) {
        for (let seed = 0; seed < 5; seed++) {
          let state = createGame(players(n), buildMissionForLevel(n, level, mulberry32(seed)), mulberry32(seed + 1));
          for (let i = 0; i < 60 && state.phase === "playing"; i++) {
            const card = chooseBotPlay(state, state.turn);
            expect(isLegalPlay(card, state.hands[state.turn]!, state.trick)).toBe(true);
            state = playCard(state, state.turn, card);
          }
          expect(["won", "lost"]).toContain(state.phase);
        }
      }
    }
  });

  it("is competent on easy missions", () => {
    // The Crew is a hard co-op puzzle for a reactive bot; ~30% on level-0 (3p) is solid.
    expect(winRate(3, 0, 60, smart)).toBeGreaterThan(0.2);
  });

  it("clearly beats a naive 'first legal card' bot", () => {
    // Delivery + ducking lets owners capture their task cards; naive play scatters them.
    expect(winRate(3, 0, 60, smart)).toBeGreaterThan(winRate(3, 0, 60, naive));
    expect(winRate(4, 0, 60, smart)).toBeGreaterThan(winRate(4, 0, 60, naive));
    // And never does worse on ordered missions (ordering-safety avoids self-destruct).
    for (const level of [2, 4, 6]) {
      expect(winRate(4, level, 40, smart)).toBeGreaterThanOrEqual(winRate(4, level, 40, naive));
    }
  });

  it("isTaskReady respects ordering", () => {
    const state = createGame(players(3), buildMissionForLevel(3, 6, mulberry32(2)), mulberry32(3));
    const abs = state.tasks.find((t) => t.constraint.kind === "absolute");
    if (abs) expect(isTaskReady(state, abs)).toBe(true); // absolute #1 ready at start (count 0)
    const last = state.tasks.find((t) => t.constraint.kind === "last");
    if (last && state.tasks.length > 1) expect(isTaskReady(state, last)).toBe(false); // others pending
  });
});
