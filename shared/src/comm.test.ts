import { describe, it, expect } from "vitest";
import {
  type Card,
  type Player,
  type GameState,
  type TaskState,
  sonarPosition,
  canCommunicate,
  communicate,
  playCard,
} from "./index.js";

const PLAYERS: Player[] = [
  { id: "p0", name: "A", isBot: false },
  { id: "p1", name: "B", isBot: false },
  { id: "p2", name: "C", isBot: false },
];

const B = (v: number): Card => ({ suit: "blue", value: v });
const G = (v: number): Card => ({ suit: "green", value: v });

function state(hands: Card[][], tasks: TaskState[] = []): GameState {
  return {
    players: PLAYERS,
    hands: hands.map((h) => h.slice()),
    tasks,
    commander: 0,
    trick: { leader: 0, plays: [] },
    turn: 0,
    trickNumber: 0,
    completedCount: 0,
    tricksWon: [0, 0, 0],
    phase: "playing",
    communications: [],
    sonarUsed: [false, false, false],
    comms: "open",
    distressUsed: false,
    expectedTrickSize: hands.filter((h) => h.length > 0).length,
  };
}

describe("sonarPosition", () => {
  const hand: Card[] = [B(3), B(7), G(5), { suit: "sub", value: 2 }];
  it("classifies highest/lowest/only and rejects middles & submarines", () => {
    expect(sonarPosition(hand, B(7))).toBe("highest");
    expect(sonarPosition(hand, B(3))).toBe("lowest");
    expect(sonarPosition(hand, G(5))).toBe("only");
    expect(sonarPosition([B(1), B(5), B(9)], B(5))).toBeNull(); // middle
    expect(sonarPosition(hand, { suit: "sub", value: 2 })).toBeNull();
    expect(sonarPosition(hand, B(4))).toBeNull(); // not held
  });
});

describe("communicate", () => {
  it("records a truthful signal and spends the token", () => {
    const s = state([[B(3), B(7), G(5)], [B(1)], [B(2)]]);
    const after = communicate(s, 0, B(7));
    expect(after.communications).toEqual([{ seat: 0, card: B(7), position: "highest" }]);
    expect(after.sonarUsed[0]).toBe(true);
    expect(canCommunicate(after, 0)).toBe(false); // token spent
  });

  it("rejects a second signal from the same seat", () => {
    let s = state([[B(3), B(7)], [B(1)], [B(2)]]);
    s = communicate(s, 0, B(7));
    expect(() => communicate(s, 0, B(3))).toThrow(/already used your sonar/);
  });

  it("rejects signalling a middle card or a submarine", () => {
    const s = state([[B(1), B(5), B(9), { suit: "sub", value: 1 }], [B(2)], [B(3)]]);
    expect(() => communicate(s, 0, B(5))).toThrow(/cannot be signalled/);
    expect(() => communicate(s, 0, { suit: "sub", value: 1 })).toThrow(/cannot be signalled/);
  });

  it("cannot communicate mid-trick (only between tricks)", () => {
    let s = state([[B(3), B(7)], [B(1), B(2)], [B(4), B(5)]]);
    s = playCard(s, 0, B(3)); // a card is now on the table
    expect(canCommunicate(s, 1)).toBe(false);
    expect(() => communicate(s, 1, B(2))).toThrow(/only between tricks/);
  });
});
