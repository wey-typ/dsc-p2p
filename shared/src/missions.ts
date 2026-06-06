import { type Card, COLOR_SUITS, MAX_COLOR_VALUE } from "./types.js";
import type { Mission } from "./game.js";
import type { MissionTask } from "./tasks.js";
import { shuffle } from "./rng.js";

/** All 36 colour cards (valid task targets; submarines are never task cards). */
function colorCards(): Card[] {
  const cards: Card[] = [];
  for (const suit of COLOR_SUITS) {
    for (let v = 1; v <= MAX_COLOR_VALUE; v++) cards.push({ suit, value: v });
  }
  return cards;
}

/**
 * Build a simple unordered mission: pick `taskCount` distinct colour cards as targets
 * and assign owners round-robin across seats. Good enough to drive early playable games;
 * the curated, constraint-bearing mission set lands in a later cycle.
 */
export function buildSimpleMission(
  numPlayers: number,
  taskCount: number,
  rng: () => number,
  id = "free-dive"
): Mission {
  const pool = shuffle(colorCards(), rng);
  const picked = pool.slice(0, Math.max(1, Math.min(taskCount, pool.length)));
  const tasks: MissionTask[] = picked.map((card, i) => ({
    card,
    owner: i % numPlayers,
    constraint: { kind: "none" },
  }));
  return { id, name: `Free Dive (${tasks.length} tasks)`, tasks };
}

/** Default number of tasks scaled loosely by player count for a quick game. */
export function defaultTaskCount(numPlayers: number): number {
  return Math.max(2, numPlayers);
}
