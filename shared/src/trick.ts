import { type Card, type Play, type Trick, TRUMP_SUIT } from "./types.js";
import { cardsEqual } from "./cards.js";

/** The led suit of a trick (suit of the first card played), or null if not led yet. */
export function ledSuit(trick: Trick): Card["suit"] | null {
  return trick.plays[0]?.card.suit ?? null;
}

/**
 * Which cards in `hand` may legally be played given the current trick.
 * Rule: you must follow the led suit if you can; otherwise any card is legal.
 * The leader (no plays yet) may play anything.
 */
export function legalMoves(hand: readonly Card[], trick: Trick): Card[] {
  const led = ledSuit(trick);
  if (led === null) return hand.slice();
  const inSuit = hand.filter((c) => c.suit === led);
  return inSuit.length > 0 ? inSuit : hand.slice();
}

export function isLegalPlay(card: Card, hand: readonly Card[], trick: Trick): boolean {
  if (!hand.some((c) => cardsEqual(c, card))) return false;
  return legalMoves(hand, trick).some((c) => cardsEqual(c, card));
}

/**
 * The seat index that wins a completed (or partial) trick:
 * highest submarine if any were played, otherwise highest card of the led suit.
 *
 * With `undertow` (deep-mission complication): the current drags everything down —
 * the LOWEST card of the led suit wins, and submarines sink (they never win an
 * undertow trick, unless a submarine was led and the trick holds nothing else).
 */
export function trickWinner(trick: Trick, undertow = false): number {
  if (trick.plays.length === 0) {
    throw new Error("Cannot determine winner of an empty trick");
  }
  const led = ledSuit(trick)!;
  if (undertow) {
    const inSuit = trick.plays.filter((p) => p.card.suit === led && p.card.suit !== TRUMP_SUIT);
    // Subs sink: only when a sub was led (pool empty) do subs compete — lowest wins.
    const pool: Play[] = inSuit.length > 0 ? inSuit : trick.plays.filter((p) => p.card.suit === led);
    let low = pool[0]!;
    for (const p of pool) {
      if (p.card.value < low.card.value) low = p;
    }
    return low.seat;
  }
  const candidates: Play[] = trick.plays.filter((p) => p.card.suit === TRUMP_SUIT);
  const pool: Play[] = candidates.length > 0
    ? candidates
    : trick.plays.filter((p) => p.card.suit === led);
  let best = pool[0]!;
  for (const p of pool) {
    if (p.card.value > best.card.value) best = p;
  }
  return best.seat;
}

/** Returns true once every seat has played a card into the trick. */
export function isTrickComplete(trick: Trick, numPlayers: number): boolean {
  return trick.plays.length === numPlayers;
}
