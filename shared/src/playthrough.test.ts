import { describe, it, expect } from "vitest";
import {
  type Player,
  createGame,
  buildMissionForLevel,
  legalMovesFor,
  playCard,
  mulberry32,
} from "./index.js";

function players(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, isBot: true }));
}

/** Greedily play the first legal card for whoever's turn until the game ends. */
function autoPlay(numPlayers: number, level: number, seed: number) {
  let state = createGame(players(numPlayers), buildMissionForLevel(numPlayers, level, mulberry32(seed)), mulberry32(seed + 1));
  for (let i = 0; i < 60 && state.phase === "playing"; i++) {
    const moves = legalMovesFor(state, state.turn);
    expect(moves.length).toBeGreaterThan(0); // active seat always has a legal move
    state = playCard(state, state.turn, moves[0]!);
  }
  return state;
}

describe("generated missions always resolve (no stalls / no throws)", () => {
  it("reaches a terminal state across player counts and levels", () => {
    for (const n of [2, 3, 4, 5]) {
      for (const level of [0, 2, 4, 6, 8]) {
        for (let seed = 0; seed < 5; seed++) {
          const end = autoPlay(n, level, seed * 17 + level);
          expect(["won", "lost"]).toContain(end.phase);
          // Invariant: total cards never exceeds the 40-card deck.
          expect(end.hands.reduce((a, h) => a + h.length, 0)).toBeLessThanOrEqual(40);
        }
      }
    }
  });

  it("at least some random playthroughs win (engine can succeed, not just fail)", () => {
    let wins = 0;
    for (let seed = 0; seed < 40; seed++) {
      if (autoPlay(3, 0, seed).phase === "won") wins++;
    }
    expect(wins).toBeGreaterThan(0);
  });
});
