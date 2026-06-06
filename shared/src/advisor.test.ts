import { describe, it, expect } from "vitest";
import {
  type Player,
  createGame,
  buildMissionForLevel,
  projectForSeat,
  suggestPlay,
  cardName,
  isLegalPlay,
  mulberry32,
  chooseBotPlay,
  playCard,
} from "./index.js";

function players(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, isBot: false }));
}

describe("suggestPlay", () => {
  it("recommends a legal card with a non-empty reason on your turn", () => {
    const state = createGame(players(3), buildMissionForLevel(3, 2, mulberry32(5)), mulberry32(6));
    const view = projectForSeat(state, state.turn);
    const s = suggestPlay(view);
    expect(s.card).not.toBeNull();
    expect(isLegalPlay(s.card!, state.hands[state.turn]!, state.trick)).toBe(true);
    expect(s.reason.length).toBeGreaterThan(10);
  });

  it("declines when it isn't your turn", () => {
    const state = createGame(players(3), buildMissionForLevel(3, 0, mulberry32(1)), mulberry32(2));
    const notTurn = (state.turn + 1) % 3;
    const s = suggestPlay(projectForSeat(state, notTurn));
    expect(s.card).toBeNull();
    expect(s.reason).toMatch(/your turn/i);
  });

  it("always suggests a legal move across many game states", () => {
    let state = createGame(players(4), buildMissionForLevel(4, 1, mulberry32(9)), mulberry32(10));
    for (let i = 0; i < 30 && state.phase === "playing"; i++) {
      const view = projectForSeat(state, state.turn);
      const s = suggestPlay(view);
      expect(s.card).not.toBeNull();
      expect(view.legalMoves.some((c) => cardName(c) === cardName(s.card!))).toBe(true);
      // advance using the bot so we visit varied states
      state = playCard(state, state.turn, chooseBotPlay(state, state.turn));
    }
  });

  it("formats card names readably", () => {
    expect(cardName({ suit: "pink", value: 5 })).toBe("Coral 5");
    expect(cardName({ suit: "sub", value: 3 })).toBe("Submarine 3");
  });
});
