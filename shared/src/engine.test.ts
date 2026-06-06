import { describe, it, expect } from "vitest";
import {
  createDeck,
  cardId,
  deal,
  sortHand,
  mulberry32,
  shuffle,
  legalMoves,
  isLegalPlay,
  trickWinner,
  isTrickComplete,
  type Card,
  type Trick,
} from "./index.js";

describe("deck", () => {
  it("has 40 unique cards: 36 colour + 4 submarine", () => {
    const deck = createDeck();
    expect(deck).toHaveLength(40);
    expect(deck.filter((c) => c.suit === "sub")).toHaveLength(4);
    expect(deck.filter((c) => c.suit !== "sub")).toHaveLength(36);
    expect(new Set(deck.map(cardId)).size).toBe(40);
  });

  it("colour cards are 1..9 and submarines 1..4", () => {
    const deck = createDeck();
    const blues = deck.filter((c) => c.suit === "blue").map((c) => c.value).sort((a, b) => a - b);
    expect(blues).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const subs = deck.filter((c) => c.suit === "sub").map((c) => c.value).sort((a, b) => a - b);
    expect(subs).toEqual([1, 2, 3, 4]);
  });
});

describe("rng", () => {
  it("shuffle is deterministic for a given seed and a permutation of the deck", () => {
    const a = shuffle(createDeck(), mulberry32(42));
    const b = shuffle(createDeck(), mulberry32(42));
    const c = shuffle(createDeck(), mulberry32(43));
    expect(a.map(cardId)).toEqual(b.map(cardId));
    expect(a.map(cardId)).not.toEqual(c.map(cardId));
    expect(new Set(a.map(cardId)).size).toBe(40);
  });
});

describe("deal", () => {
  it("deals all 40 cards across seats with no duplicates", () => {
    for (const n of [2, 3, 4, 5]) {
      const { hands, commander } = deal(n, mulberry32(7));
      const all = hands.flat();
      expect(all).toHaveLength(40);
      expect(new Set(all.map(cardId)).size).toBe(40);
      // commander holds sub-4
      expect(hands[commander]!.some((c) => c.suit === "sub" && c.value === 4)).toBe(true);
    }
  });

  it("splits 40 as evenly as possible (3 players => 14/13/13)", () => {
    const { hands } = deal(3, mulberry32(1));
    const sizes = hands.map((h) => h.length).sort((a, b) => b - a);
    expect(sizes).toEqual([14, 13, 13]);
  });

  it("rejects illegal player counts", () => {
    expect(() => deal(1, mulberry32(1))).toThrow();
    expect(() => deal(6, mulberry32(1))).toThrow();
  });
});

describe("legal moves (follow suit)", () => {
  const hand: Card[] = [
    { suit: "blue", value: 3 },
    { suit: "blue", value: 7 },
    { suit: "green", value: 5 },
    { suit: "sub", value: 2 },
  ];

  it("leader may play anything", () => {
    const trick: Trick = { leader: 0, plays: [] };
    expect(legalMoves(hand, trick)).toHaveLength(4);
  });

  it("must follow led suit when able", () => {
    const trick: Trick = { leader: 0, plays: [{ seat: 0, card: { suit: "blue", value: 1 } }] };
    const legal = legalMoves(hand, trick).map(cardId);
    expect(legal.sort()).toEqual(["blue-3", "blue-7"]);
    expect(isLegalPlay({ suit: "green", value: 5 }, hand, trick)).toBe(false);
    expect(isLegalPlay({ suit: "blue", value: 7 }, hand, trick)).toBe(true);
  });

  it("may play anything (incl. trump) when void in led suit", () => {
    const trick: Trick = { leader: 0, plays: [{ seat: 0, card: { suit: "pink", value: 9 } }] };
    expect(legalMoves(hand, trick)).toHaveLength(4);
    expect(isLegalPlay({ suit: "sub", value: 2 }, hand, trick)).toBe(true);
  });

  it("rejects playing a card not in hand", () => {
    const trick: Trick = { leader: 0, plays: [] };
    expect(isLegalPlay({ suit: "yellow", value: 1 }, hand, trick)).toBe(false);
  });
});

describe("trick winner", () => {
  it("highest card of led suit wins with no trump", () => {
    const trick: Trick = {
      leader: 0,
      plays: [
        { seat: 0, card: { suit: "blue", value: 3 } },
        { seat: 1, card: { suit: "blue", value: 8 } },
        { seat: 2, card: { suit: "green", value: 9 } }, // off-suit, can't win
      ],
    };
    expect(trickWinner(trick)).toBe(1);
  });

  it("any submarine beats colour cards; highest submarine wins", () => {
    const trick: Trick = {
      leader: 0,
      plays: [
        { seat: 0, card: { suit: "blue", value: 9 } },
        { seat: 1, card: { suit: "sub", value: 1 } },
        { seat: 2, card: { suit: "sub", value: 3 } },
        { seat: 3, card: { suit: "blue", value: 8 } },
      ],
    };
    expect(trickWinner(trick)).toBe(2);
  });

  it("off-suit non-trump never wins", () => {
    const trick: Trick = {
      leader: 2,
      plays: [
        { seat: 2, card: { suit: "pink", value: 2 } },
        { seat: 3, card: { suit: "yellow", value: 9 } },
      ],
    };
    expect(trickWinner(trick)).toBe(2);
  });

  it("isTrickComplete tracks fill", () => {
    const trick: Trick = { leader: 0, plays: [{ seat: 0, card: { suit: "blue", value: 1 } }] };
    expect(isTrickComplete(trick, 3)).toBe(false);
  });
});

describe("sortHand", () => {
  it("groups by suit (colours then subs), ascending value", () => {
    const hand: Card[] = [
      { suit: "sub", value: 1 },
      { suit: "blue", value: 9 },
      { suit: "blue", value: 2 },
      { suit: "yellow", value: 5 },
    ];
    expect(sortHand(hand).map(cardId)).toEqual(["blue-2", "blue-9", "yellow-5", "sub-1"]);
  });
});
