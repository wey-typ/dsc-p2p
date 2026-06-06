import {
  type Card,
  type ColorSuit,
  type Suit,
  COLOR_SUITS,
  MAX_COLOR_VALUE,
  MAX_TRUMP_VALUE,
  TRUMP_SUIT,
} from "./types.js";
import { shuffle } from "./rng.js";

/** Stable string id for a card, e.g. "pink-5" or "sub-4". */
export function cardId(card: Card): string {
  return `${card.suit}-${card.value}`;
}

export function cardsEqual(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.value === b.value;
}

export function isTrump(card: Card): boolean {
  return card.suit === TRUMP_SUIT;
}

/** The full 40-card deck: 4 colours × 1..9 (36) + submarines 1..4 (4). */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of COLOR_SUITS) {
    for (let v = 1; v <= MAX_COLOR_VALUE; v++) {
      deck.push({ suit, value: v });
    }
  }
  for (let v = 1; v <= MAX_TRUMP_VALUE; v++) {
    deck.push({ suit: TRUMP_SUIT, value: v });
  }
  return deck;
}

export interface DealResult {
  /** hands[seat] = that seat's cards. */
  hands: Card[][];
  /** Seat index holding the highest submarine — the Commander, who leads first. */
  commander: number;
}

/**
 * Shuffle the full deck and deal all 40 cards round-robin to `numPlayers` seats.
 * With 3 players the deal is intentionally uneven (one seat gets 14, others 13).
 * The Commander is whoever is dealt the highest submarine (sub-4).
 */
export function deal(numPlayers: number, rng: () => number): DealResult {
  if (numPlayers < 2 || numPlayers > 5) {
    throw new Error(`numPlayers must be 2..5, got ${numPlayers}`);
  }
  const shuffled = shuffle(createDeck(), rng);
  const hands: Card[][] = Array.from({ length: numPlayers }, () => []);
  shuffled.forEach((card, i) => {
    hands[i % numPlayers]!.push(card);
  });

  const commander = hands.findIndex((hand) =>
    hand.some((c) => c.suit === TRUMP_SUIT && c.value === MAX_TRUMP_VALUE)
  );
  // Deck always contains sub-4, so this is always found.
  return { hands, commander };
}

/** Sort a hand for display: colour suits grouped, then submarines; ascending value. */
export function sortHand(hand: readonly Card[]): Card[] {
  const order: Record<Suit, number> = {
    blue: 0,
    green: 1,
    pink: 2,
    yellow: 3,
    sub: 4,
  };
  return hand.slice().sort((a, b) => {
    if (a.suit !== b.suit) return order[a.suit] - order[b.suit];
    return a.value - b.value;
  });
}

/** Convenience guard used by UI/tests. */
export function isColorSuit(suit: Suit): suit is ColorSuit {
  return suit !== TRUMP_SUIT;
}
