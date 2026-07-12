import { describe, it, expect } from "vitest";
import {
  type Card,
  type GameState,
  type Player,
  type MissionModifier,
  trickWinner,
  playCard,
  buildSolvableGameWithLine,
  missionNotes,
  modifiersForLevel,
  mulberry32,
  BotPlanner,
  isLegalPlay,
} from "./index.js";

const PLAYERS: Player[] = [
  { id: "p0", name: "Alpha", isBot: false },
  { id: "p1", name: "Bravo", isBot: false },
  { id: "p2", name: "Charlie", isBot: false },
];

const B = (v: number): Card => ({ suit: "blue", value: v });
const G = (v: number): Card => ({ suit: "green", value: v });
const SUB = (v: number): Card => ({ suit: "sub", value: v });

function makeState(hands: Card[][], modifiers: MissionModifier[], commander = 0): GameState {
  return {
    players: PLAYERS.slice(0, hands.length),
    hands: hands.map((h) => h.slice()),
    tasks: [
      // A pending end-of-game objective keeps the game alive between tricks.
      { id: "keep", objective: { kind: "avoidColor", suit: "pink" }, owner: 1, constraint: { kind: "none" }, status: "pending" },
    ],
    commander,
    trick: { leader: commander, plays: [] },
    turn: commander,
    trickNumber: 0,
    completedCount: 0,
    tricksWon: new Array(hands.length).fill(0),
    phase: "playing",
    communications: [],
    sonarUsed: new Array(hands.length).fill(false),
    comms: "open",
    distressUsed: false,
    distressAllowed: true,
    modifiers,
    expectedTrickSize: hands.filter((h) => h.length > 0).length,
  };
}

function playTrick(state: GameState, cards: Card[]): GameState {
  let s = state;
  for (const c of cards) s = playCard(s, s.turn, c);
  return s;
}

describe("undertow trick winner", () => {
  const trick = (cards: Card[]) => ({ leader: 0, plays: cards.map((card, seat) => ({ seat, card })) });

  it("lowest card of the led suit wins", () => {
    expect(trickWinner(trick([B(9), B(2), B(5)]), true)).toBe(1);
    expect(trickWinner(trick([B(9), B(2), B(5)]), false)).toBe(0); // normal rules unchanged
  });

  it("submarines sink (never win an undertow trick over led-suit cards)", () => {
    expect(trickWinner(trick([B(9), SUB(4), B(5)]), true)).toBe(2); // lowest blue, not the sub
    expect(trickWinner(trick([B(9), SUB(4), B(5)]), false)).toBe(1); // normally the sub trumps
  });

  it("off-suit dumps never win, and a sub-led undertow trick goes to the lowest sub", () => {
    expect(trickWinner(trick([B(9), G(1), B(5)]), true)).toBe(2); // G1 didn't follow suit
    expect(trickWinner(trick([SUB(3), SUB(1), G(2)]), true)).toBe(1); // subs led: lowest sub
  });
});

describe("undertow in the engine", () => {
  it("applies on scheduled tricks only", () => {
    // everyN: 2 -> trick 1 normal (highest wins), trick 2 undertow (lowest wins).
    let s = makeState(
      [
        [B(9), B(1)],
        [B(5), B(2)],
        [B(7), B(3)],
      ],
      [{ kind: "undertow", everyN: 2 }]
    );
    s = playTrick(s, [B(9), B(5), B(7)]); // normal: seat 0 wins with B9
    expect(s.lastTrickWinner).toBe(0);
    s = playTrick(s, [B(1), B(2), B(3)]); // undertow: seat 0's B1 is lowest -> wins
    expect(s.lastTrickWinner).toBe(0);
    expect(s.tricksWon[0]).toBe(2);
  });
});

describe("commander's burden", () => {
  it("fails instantly when the commander wins an early trick", () => {
    let s = makeState(
      [
        [B(9), B(1)],
        [B(5), B(2)],
        [B(7), B(3)],
      ],
      [{ kind: "commanderBan", tricks: 3 }]
    );
    s = playTrick(s, [B(9), B(5), B(7)]); // commander (seat 0) wins trick 1
    expect(s.phase).toBe("lost");
    expect(s.failReason).toMatch(/Commander Alpha won trick #1/);
  });

  it("is fine when the commander ducks the banned tricks", () => {
    let s = makeState(
      [
        [B(1), B(2)],
        [B(5), B(6)],
        [B(7), B(3)],
      ],
      [{ kind: "commanderBan", tricks: 2 }]
    );
    s = playTrick(s, [B(1), B(5), B(7)]); // seat 2 wins
    expect(s.phase).toBe("playing");
    s = playTrick(s, [B(3), B(2), B(6)]); // seat 2 leads B3; seat 1 wins with B6
    // Deck exhausted with the ban respected: the keep-alive objective settles -> won.
    expect(s.phase).toBe("won");
  });
});

describe("deep missions (levels 9-11) stay guaranteed solvable", () => {
  const bots = (n: number): Player[] =>
    Array.from({ length: n }, (_, i) => ({ id: `b${i}`, name: `B${i}`, isBot: true }));

  it("the constructive line wins under the new modifiers", () => {
    for (const level of [9, 10, 11]) {
      for (let seed = 0; seed < 5; seed++) {
        const { state, line } = buildSolvableGameWithLine(bots(3), level, mulberry32(seed * 7 + level));
        expect(state.modifiers.length).toBeGreaterThan(0);
        let s = state;
        for (const card of line) s = playCard(s, s.turn, card);
        expect(s.phase).toBe("won");
      }
    }
  });

  it("seeded planner bots clear The Void (level 11)", { timeout: 60000 }, () => {
    for (let seed = 0; seed < 3; seed++) {
      const { state, line } = buildSolvableGameWithLine(bots(4), 11, mulberry32(seed * 13 + 3));
      const planner = new BotPlanner({ nodes: 20000, maxAttempts: 2 });
      planner.seedPlan(state, line);
      let s = state;
      for (let i = 0; i < 80 && s.phase === "playing"; i++) {
        const card = planner.choose(s, s.turn);
        expect(isLegalPlay(card, s.hands[s.turn]!, s.trick)).toBe(true);
        s = playCard(s, s.turn, card);
      }
      expect(s.phase).toBe("won");
    }
  });

  it("level notes describe the complications; classic mode strips them", () => {
    expect(missionNotes(9).join(" ")).toMatch(/Undertow/);
    expect(missionNotes(10).join(" ")).toMatch(/Commander/);
    expect(missionNotes(11).join(" ")).toMatch(/Undertow.*Commander|Commander.*Undertow/);
    expect(missionNotes(11, false).join(" ")).not.toMatch(/Undertow|Commander/);
    expect(modifiersForLevel(8)).toHaveLength(0);
    const classic = buildSolvableGameWithLine(bots(3), 11, mulberry32(1), { extension: false });
    expect(classic.state.modifiers).toHaveLength(0);
  });
});
