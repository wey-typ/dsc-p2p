import { describe, it, expect } from "vitest";
import {
  type Card,
  type Player,
  type GameState,
  type MissionTask,
  type TaskState,
  playCard,
  legalMovesFor,
} from "./index.js";

// ---- helpers -------------------------------------------------------------

const PLAYERS: Player[] = [
  { id: "p0", name: "Alpha", isBot: false },
  { id: "p1", name: "Bravo", isBot: false },
  { id: "p2", name: "Charlie", isBot: false },
];

function mkTask(card: Card, owner: number, constraint: MissionTask["constraint"], i: number): TaskState {
  return { id: `t${i}-${card.suit}-${card.value}`, card, owner, constraint, status: "pending" };
}

/** Build a controlled state with explicit hands (no shuffle) so plays are scriptable. */
function makeState(hands: Card[][], tasks: TaskState[], leader = 0): GameState {
  return {
    players: PLAYERS.slice(0, hands.length),
    hands: hands.map((h) => h.slice()),
    tasks,
    commander: leader,
    trick: { leader, plays: [] },
    turn: leader,
    trickNumber: 0,
    completedCount: 0,
    phase: "playing",
    communications: [],
    sonarUsed: new Array(hands.length).fill(false),
    expectedTrickSize: hands.filter((h) => h.length > 0).length,
  };
}

/** Play a whole trick in seat order starting from current turn. */
function playTrick(state: GameState, cards: Card[]): GameState {
  let s = state;
  for (const c of cards) {
    s = playCard(s, s.turn, c);
  }
  return s;
}

const B = (v: number): Card => ({ suit: "blue", value: v });
const G = (v: number): Card => ({ suit: "green", value: v });

// ---- tests ---------------------------------------------------------------

describe("win / lose basics", () => {
  it("wins when the owner captures the required card", () => {
    const s = makeState([[B(5)], [B(3)], [G(9)]], [mkTask(B(5), 0, { kind: "none" }, 0)]);
    const end = playTrick(s, [B(5), B(3), G(9)]);
    expect(end.phase).toBe("won");
    expect(end.tasks[0]!.status).toBe("done");
  });

  it("loses when the wrong player captures the required card", () => {
    const s = makeState([[B(5)], [B(3)], [G(9)]], [mkTask(B(5), 1, { kind: "none" }, 0)]);
    const end = playTrick(s, [B(5), B(3), G(9)]);
    expect(end.phase).toBe("lost");
    expect(end.failReason).toMatch(/won by seat 0/);
  });

  it("loses if cards run out with a task still pending", () => {
    // Only task card never appears in any trick.
    const s = makeState([[B(5)], [B(3)], [G(9)]], [mkTask(B(8), 0, { kind: "none" }, 0)]);
    const end = playTrick(s, [B(5), B(3), G(9)]);
    expect(end.phase).toBe("lost");
    expect(end.failReason).toMatch(/Out of cards/);
  });

  it("records the completed trick + winner for display after it clears", () => {
    const s = makeState([[B(5), G(1)], [B(3), G(2)], [G(9), G(8)]], [mkTask(B(8), 0, { kind: "none" }, 0)]);
    const after = playTrick(s, [B(5), B(3), G(9)]); // seat0 wins blue with B(5)
    expect(after.trick.plays).toHaveLength(0); // current trick cleared
    expect(after.lastTrick?.plays.map((p) => p.card.value)).toEqual([5, 3, 9]);
    expect(after.lastTrickWinner).toBe(0);
  });

  it("a submarine trumps the led suit", () => {
    const s = makeState(
      [[B(9)], [{ suit: "sub", value: 1 }], [B(2)]],
      [mkTask(B(9), 1, { kind: "none" }, 0)] // seat1 wins with the sub
    );
    const end = playTrick(s, [B(9), { suit: "sub", value: 1 }, B(2)]);
    expect(end.phase).toBe("won");
  });
});

describe("ordering constraints", () => {
  it("relative order completed in sequence -> win", () => {
    const s = makeState(
      [[B(9), G(9)], [B(1), G(1)], [B(2), G(2)]],
      [
        mkTask(B(9), 0, { kind: "relative", order: 1 }, 0),
        mkTask(G(9), 0, { kind: "relative", order: 2 }, 1),
      ]
    );
    let e = playTrick(s, [B(9), B(1), B(2)]); // seat0 wins blue-9 (rel #1)
    expect(e.phase).toBe("playing");
    e = playTrick(e, [G(9), G(1), G(2)]); // seat0 wins green-9 (rel #2)
    expect(e.phase).toBe("won");
  });

  it("relative order out of sequence -> lose", () => {
    const s = makeState(
      [[B(9), G(9)], [B(1), G(1)], [B(2), G(2)]],
      [
        mkTask(B(9), 0, { kind: "relative", order: 2 }, 0), // higher captured first
        mkTask(G(9), 0, { kind: "relative", order: 1 }, 1),
      ]
    );
    const e = playTrick(s, [B(9), B(1), B(2)]);
    expect(e.phase).toBe("lost");
    expect(e.failReason).toMatch(/rel #2/);
  });

  it("'last' task completed early -> lose", () => {
    const s = makeState(
      [[B(9), G(9)], [B(1), G(1)], [B(2), G(2)]],
      [
        mkTask(B(9), 0, { kind: "last" }, 0), // captured first but must be last
        mkTask(G(9), 0, { kind: "none" }, 1),
      ]
    );
    const e = playTrick(s, [B(9), B(1), B(2)]);
    expect(e.phase).toBe("lost");
    expect(e.failReason).toMatch(/last task/);
  });

  it("'last' task completed last -> win", () => {
    const s = makeState(
      [[B(9), G(9)], [B(1), G(1)], [B(2), G(2)]],
      [
        mkTask(B(9), 0, { kind: "none" }, 0),
        mkTask(G(9), 0, { kind: "last" }, 1),
      ]
    );
    let e = playTrick(s, [B(9), B(1), B(2)]); // none task first
    e = playTrick(e, [G(9), G(1), G(2)]); // last task last
    expect(e.phase).toBe("won");
  });

  it("absolute-order task must hit its exact slot", () => {
    const s = makeState(
      [[B(9), G(9)], [B(1), G(1)], [B(2), G(2)]],
      [
        mkTask(B(9), 0, { kind: "none" }, 0),
        mkTask(G(9), 0, { kind: "absolute", order: 2 }, 1),
      ]
    );
    let e = playTrick(s, [B(9), B(1), B(2)]); // completion #1 (none)
    e = playTrick(e, [G(9), G(1), G(2)]); // completion #2 == absolute order 2
    expect(e.phase).toBe("won");
  });

  it("absolute-order violation -> lose", () => {
    const s = makeState(
      [[B(9), G(9)], [B(1), G(1)], [B(2), G(2)]],
      [
        mkTask(B(9), 0, { kind: "absolute", order: 2 }, 0), // wants slot 2 but completes #1
        mkTask(G(9), 0, { kind: "none" }, 1),
      ]
    );
    const e = playTrick(s, [B(9), B(1), B(2)]);
    expect(e.phase).toBe("lost");
    expect(e.failReason).toMatch(/task #2/);
  });
});

describe("turn enforcement", () => {
  it("legalMovesFor is empty when it isn't your turn", () => {
    const s = makeState([[B(5)], [B(3)], [G(9)]], [mkTask(B(5), 0, { kind: "none" }, 0)]);
    expect(legalMovesFor(s, 1)).toEqual([]);
    expect(legalMovesFor(s, 0)).toHaveLength(1);
  });

  it("throws on out-of-turn play", () => {
    const s = makeState([[B(5)], [B(3)], [G(9)]], [mkTask(B(5), 0, { kind: "none" }, 0)]);
    expect(() => playCard(s, 1, B(3))).toThrow(/turn/);
  });

  it("throws when failing to follow suit", () => {
    const s = makeState([[B(5)], [B(3), G(1)], [G(9)]], [mkTask(B(5), 0, { kind: "none" }, 0)]);
    const afterLead = playCard(s, 0, B(5)); // blue led
    expect(() => playCard(afterLead, 1, G(1))).toThrow(/Illegal/);
  });

  it("does not mutate the input state", () => {
    const s = makeState([[B(5)], [B(3)], [G(9)]], [mkTask(B(5), 0, { kind: "none" }, 0)]);
    const before = JSON.stringify(s);
    playCard(s, 0, B(5));
    expect(JSON.stringify(s)).toBe(before);
  });
});
