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

/** Tasks scale with campaign level; capped so a single mission stays ~20 min. */
export function missionTaskCount(level: number): number {
  return Math.min(2 + level, 8);
}

/** A short flavour name for the mission at a given level. */
export function missionName(level: number): string {
  const names = [
    "Shallow Reef",
    "Kelp Forest",
    "The Drop-off",
    "Twilight Zone",
    "Hydrothermal Vents",
    "The Trench",
    "Midnight Zone",
    "The Abyssal Plain",
    "Hadal Depths",
  ];
  return names[Math.min(level, names.length - 1)]!;
}

/** Human-readable rules introduced at this level (for UI). */
export function missionNotes(level: number): string[] {
  const notes: string[] = [];
  if (level >= 2) notes.push("One task must be completed LAST.");
  if (level >= 4) notes.push("Most tasks must be completed in numbered order.");
  if (level >= 6) notes.push("The ① task must be the very first completed.");
  if (notes.length === 0) notes.push("Complete the tasks in any order.");
  return notes;
}

/**
 * Build the mission for a campaign `level`. Difficulty escalates by band:
 *  - 0–1: no ordering.
 *  - 2–3: one task must be completed last.
 *  - 4–5: the remaining tasks must be completed in relative order, + the last task.
 *  - 6+ : as above, plus the first task is pinned to absolute position #1.
 * Constraint sets are kept jointly satisfiable (last is separate from the ordered set).
 */
export function buildMissionForLevel(
  numPlayers: number,
  level: number,
  rng: () => number
): Mission {
  const count = missionTaskCount(level);
  const pool = shuffle(colorCards(), rng);
  const picked = pool.slice(0, Math.min(count, pool.length));

  const tasks: MissionTask[] = picked.map((card, i) => ({
    card,
    owner: i % numPlayers,
    constraint: { kind: "none" },
  }));

  const lastIdx = tasks.length - 1;
  const hasLast = level >= 2 && tasks.length >= 2;
  const orderedMax = hasLast ? lastIdx : tasks.length; // indices [0, orderedMax) are "ordered"

  if (level >= 4) {
    // Relative order 1..k across the non-last tasks.
    for (let i = 0; i < orderedMax; i++) {
      tasks[i] = { ...tasks[i]!, constraint: { kind: "relative", order: i + 1 } };
    }
  }
  if (level >= 6 && orderedMax >= 1) {
    // Pin the first task to absolute slot #1 (still consistent with the relative chain).
    tasks[0] = { ...tasks[0]!, constraint: { kind: "absolute", order: 1 } };
  }
  if (hasLast) {
    tasks[lastIdx] = { ...tasks[lastIdx]!, constraint: { kind: "last" } };
  }

  return {
    id: `mission-${level + 1}`,
    name: `Mission ${level + 1} · ${missionName(level)}`,
    tasks,
  };
}
