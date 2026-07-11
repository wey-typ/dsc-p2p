import { describe, it, expect } from "vitest";
import {
  type Card,
  type GameState,
  type Player,
  type TaskState,
  type TaskObjective,
  playCard,
  legalMovesFor,
  canCommunicate,
  canStartDistress,
  startDistress,
  pickDistressCard,
  describeObjective,
} from "./index.js";

const PLAYERS: Player[] = [
  { id: "p0", name: "Alpha", isBot: false },
  { id: "p1", name: "Bravo", isBot: false },
  { id: "p2", name: "Charlie", isBot: false },
];

const B = (v: number): Card => ({ suit: "blue", value: v });
const G = (v: number): Card => ({ suit: "green", value: v });
const SUB = (v: number): Card => ({ suit: "sub", value: v });

function mkObjTask(objective: TaskObjective, owner: number, i = 0): TaskState {
  return { id: `obj-${i}`, objective, owner, constraint: { kind: "none" }, status: "pending" };
}

function makeState(hands: Card[][], tasks: TaskState[], opts?: Partial<GameState>): GameState {
  return {
    players: PLAYERS.slice(0, hands.length),
    hands: hands.map((h) => h.slice()),
    tasks,
    commander: 0,
    trick: { leader: 0, plays: [] },
    turn: 0,
    trickNumber: 0,
    completedCount: 0,
    tricksWon: new Array(hands.length).fill(0),
    phase: "playing",
    communications: [],
    sonarUsed: new Array(hands.length).fill(false),
    comms: "open",
    distressUsed: false,
    expectedTrickSize: hands.filter((h) => h.length > 0).length,
    ...opts,
  };
}

function playTrick(state: GameState, cards: Card[]): GameState {
  let s = state;
  for (const c of cards) s = playCard(s, s.turn, c);
  return s;
}

// Two-trick script: trick 1 → seat 0 wins (B9); trick 2 → seat 2 wins (B3 over B1/B2).
const HANDS = (): Card[][] => [
  [B(9), B(1)],
  [B(5), B(2)],
  [B(7), B(3)],
];

describe("winTrick objective", () => {
  it("completes when the owner wins the named trick", () => {
    let s = makeState(HANDS(), [mkObjTask({ kind: "winTrick", trick: 1 }, 0)]);
    s = playTrick(s, [B(9), B(5), B(7)]);
    expect(s.tasks[0]!.status).toBe("done");
    expect(s.phase).toBe("won"); // only task, done mid-game
  });

  it("fails instantly when someone else wins the named trick", () => {
    let s = makeState(HANDS(), [mkObjTask({ kind: "winTrick", trick: 1 }, 1)]);
    s = playTrick(s, [B(9), B(5), B(7)]); // seat 0 wins, owner was seat 1
    expect(s.phase).toBe("lost");
    expect(s.failReason).toMatch(/trick #1/);
  });
});

describe("winExactly objective", () => {
  it("settles at game end when the quota is met exactly", () => {
    let s = makeState(HANDS(), [mkObjTask({ kind: "winExactly", count: 1 }, 2)]);
    s = playTrick(s, [B(9), B(5), B(7)]); // seat 0 wins
    expect(s.tasks[0]!.status).toBe("pending"); // not settled yet
    s = playTrick(s, [B(1), B(2), B(3)]); // seat 2 wins
    expect(s.phase).toBe("won");
    expect(s.tasks[0]!.status).toBe("done");
  });

  it("fails the moment the owner exceeds the quota", () => {
    let s = makeState(HANDS(), [mkObjTask({ kind: "winExactly", count: 0 }, 0)]);
    s = playTrick(s, [B(9), B(5), B(7)]); // seat 0 wins its 1st — over the 0 quota
    expect(s.phase).toBe("lost");
    expect(s.failReason).toMatch(/too many tricks/);
  });

  it("fails early when the quota can no longer be reached", () => {
    let s = makeState(HANDS(), [mkObjTask({ kind: "winExactly", count: 3 }, 1)]);
    s = playTrick(s, [B(9), B(5), B(7)]); // 1 trick left; seat 1 has 0 wins, needs 3
    expect(s.phase).toBe("lost");
    expect(s.failReason).toMatch(/no longer be reached/);
  });
});

describe("avoidColor objective", () => {
  it("fails instantly when the owner captures the forbidden colour", () => {
    let s = makeState(HANDS(), [mkObjTask({ kind: "avoidColor", suit: "blue" }, 0)]);
    s = playTrick(s, [B(9), B(5), B(7)]); // seat 0 captures blue cards
    expect(s.phase).toBe("lost");
  });

  it("completes at game end when the colour was never captured", () => {
    let s = makeState(HANDS(), [mkObjTask({ kind: "avoidColor", suit: "green" }, 0)]);
    s = playTrick(s, [B(9), B(5), B(7)]);
    s = playTrick(s, [B(1), B(2), B(3)]);
    expect(s.phase).toBe("won");
    expect(s.tasks[0]!.status).toBe("done");
  });

  it("describes objectives for the UI", () => {
    expect(describeObjective({ kind: "winTrick", trick: 1 })).toMatch(/FIRST trick/);
    expect(describeObjective({ kind: "winExactly", count: 0 })).toMatch(/NO tricks/);
    expect(describeObjective({ kind: "avoidColor", suit: "pink" })).toMatch(/no Coral/);
  });
});

describe("comms complications", () => {
  // A pending end-of-game objective keeps these games alive between tricks.
  const keepAlive = () => [mkObjTask({ kind: "avoidColor", suit: "pink" }, 1)];

  it("delayed comms block sonar until two tricks have resolved", () => {
    let s = makeState(HANDS(), keepAlive(), { comms: "delayed" });
    expect(canCommunicate(s, 0)).toBe(false);
    s = playTrick(s, [B(9), B(5), B(7)]);
    expect(s.phase).toBe("playing");
    expect(canCommunicate(s, 0)).toBe(false); // only 1 trick done
    // craft a 3-trick game instead: reuse by adding a third card each
    let s3 = makeState(
      [
        [B(9), B(1), G(2)],
        [B(5), B(2), G(4)],
        [B(7), B(3), G(6)],
      ],
      keepAlive(),
      { comms: "delayed" }
    );
    s3 = playTrick(s3, [B(9), B(5), B(7)]);
    s3 = playTrick(s3, [B(1), B(2), B(3)]);
    expect(s3.trickNumber).toBe(2);
    expect(s3.phase).toBe("playing");
    expect(canCommunicate(s3, 0)).toBe(true); // two tricks resolved — sonar back online
  });

  it("silent comms block sonar for the whole mission", () => {
    let s = makeState(HANDS(), keepAlive(), { comms: "silent" });
    expect(canCommunicate(s, 0)).toBe(false);
    s = playTrick(s, [B(9), B(5), B(7)]);
    expect(s.phase).toBe("playing");
    expect(canCommunicate(s, 2)).toBe(false);
  });
});

describe("distress signal", () => {
  it("passes one card per seat in the chosen direction, then play resumes", () => {
    let s = makeState(HANDS(), []);
    expect(canStartDistress(s)).toBe(true);
    s = startDistress(s, "left");
    expect(legalMovesFor(s, s.turn)).toHaveLength(0); // play blocked while pending
    expect(() => playCard(s, s.turn, B(9))).toThrow(/distress/);
    s = pickDistressCard(s, 0, B(9));
    s = pickDistressCard(s, 1, B(5));
    expect(s.distress).toBeDefined(); // still waiting on seat 2
    s = pickDistressCard(s, 2, B(7));
    expect(s.distress).toBeUndefined();
    // left = +1: seat 1 got B9, seat 2 got B5, seat 0 got B7
    expect(s.hands[1]).toContainEqual(B(9));
    expect(s.hands[2]).toContainEqual(B(5));
    expect(s.hands[0]).toContainEqual(B(7));
    expect(s.hands[0]).not.toContainEqual(B(9));
    // hands stay balanced and play works again
    expect(s.hands.every((h) => h.length === 2)).toBe(true);
    expect(legalMovesFor(s, s.turn).length).toBeGreaterThan(0);
  });

  it("rejects passing submarines and double-picks, and is once per mission", () => {
    let s = makeState(
      [
        [SUB(1), B(9)],
        [B(5), B(2)],
        [B(7), B(3)],
      ],
      []
    );
    s = startDistress(s, "right");
    expect(() => pickDistressCard(s, 0, SUB(1))).toThrow(/Submarines/);
    s = pickDistressCard(s, 0, B(9));
    expect(() => pickDistressCard(s, 0, B(9))).toThrow(/already chose/);
    s = pickDistressCard(s, 1, B(5));
    s = pickDistressCard(s, 2, B(7));
    // right = -1: seat 0 got seat 1's B5
    expect(s.hands[0]).toContainEqual(B(5));
    expect(canStartDistress(s)).toBe(false); // already used
    expect(() => startDistress(s, "left")).toThrow(/before the first card/);
  });

  it("cannot fire once a card has been played", () => {
    let s = makeState(HANDS(), []);
    s = playCard(s, 0, B(9));
    expect(canStartDistress(s)).toBe(false);
  });
});
