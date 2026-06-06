/**
 * Core domain types for Deep Sea Crew.
 *
 * An original, rules-inspired cooperative trick-taking engine. Pure data + pure
 * functions only — no I/O — so the whole engine is unit-testable in isolation.
 */

/** The four colour suits plus the trump suit ("sub" = submarine, black). */
export type ColorSuit = "blue" | "green" | "pink" | "yellow";
export type Suit = ColorSuit | "sub";

export const COLOR_SUITS: readonly ColorSuit[] = ["blue", "green", "pink", "yellow"];
export const TRUMP_SUIT = "sub" as const;

/** Highest colour value (1..9) and highest trump value (1..4). */
export const MAX_COLOR_VALUE = 9;
export const MAX_TRUMP_VALUE = 4;

/** A single card. Colour cards are value 1..9; submarines are value 1..4. */
export interface Card {
  readonly suit: Suit;
  readonly value: number;
}

/** A player seat. A seat is human-or-bot agnostic at the engine level. */
export interface Player {
  readonly id: string;
  readonly name: string;
  readonly isBot: boolean;
}

/** One card played into the current trick, tagged with who played it. */
export interface Play {
  readonly seat: number; // index into the seats array
  readonly card: Card;
}

/** The trick currently being played. */
export interface Trick {
  /** Seat index that led this trick. */
  readonly leader: number;
  /** Plays in the order they were made (plays[0] is the lead). */
  readonly plays: Play[];
}
