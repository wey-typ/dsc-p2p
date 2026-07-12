import { type Card, COLOR_SUITS, MAX_COLOR_VALUE } from "./types.js";
import type { CommsMode, Mission } from "./game.js";
import type { MissionTask, TaskObjective } from "./tasks.js";
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
    objective: { kind: "capture", card },
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

/** Options shared by the mission builders. */
export interface MissionOptions {
  /** Extension rules: special objectives, comms complications, distress (default true). */
  extension?: boolean;
}

/**
 * How many of the mission's tasks are "extension" objectives (win-the-first-trick,
 * win-exactly-N, win-no-colour) rather than classic card captures.
 */
export function objectiveCountForLevel(level: number): number {
  if (level <= 0) return 0;
  if (level <= 2) return 1;
  if (level <= 5) return 2;
  return 3;
}

/** Sonar restriction by level: interference from the Vents, dead sonar in the deep. */
export function commsForLevel(level: number): CommsMode {
  if (level >= 7) return "silent";
  if (level >= 5) return "delayed";
  return "open";
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
export function missionNotes(level: number, extension = true): string[] {
  const notes: string[] = [];
  if (extension && level >= 1) notes.push("Special objectives join the dive (first trick / trick quotas / forbidden colours).");
  if (level >= 2) notes.push("One card task must be completed LAST.");
  if (level >= 4) notes.push("Most card tasks must be completed in numbered order.");
  if (extension && level >= 5 && level < 7) notes.push("Sonar interference: signals only after the first two tricks.");
  if (level >= 6) notes.push("The ① task must be the very first completed.");
  if (extension && level >= 7) notes.push("Sonar is DEAD: no signals this mission.");
  if (notes.length === 0) notes.push("Complete the tasks in any order.");
  return notes;
}

/** A random extension objective (for the random mission builder; may be unsolvable). */
function randomObjective(numPlayers: number, i: number, rng: () => number): TaskObjective {
  const roll = Math.floor(rng() * 3);
  if (roll === 0 && i === 0) return { kind: "winTrick", trick: 1 };
  if (roll <= 1) {
    const suit = COLOR_SUITS[Math.floor(rng() * COLOR_SUITS.length)]!;
    return { kind: "avoidColor", suit };
  }
  // A reachable quota: hand sizes are 40/numPlayers, keep the ask modest.
  return { kind: "winExactly", count: Math.floor(rng() * 3) };
}

/**
 * Build the mission for a campaign `level`. Difficulty escalates by band:
 *  - 0:    card captures only, no ordering.
 *  - 1+:   extension objectives replace some captures (see objectiveCountForLevel).
 *  - 2–3:  one capture task must be completed last.
 *  - 4–5:  the remaining captures must be completed in relative order, + the last task.
 *  - 5–6:  sonar delayed until after trick 2.
 *  - 6+ :  the first capture is pinned to absolute position #1.
 *  - 7+ :  sonar dead.
 * Constraint sets are kept jointly satisfiable (last is separate from the ordered set).
 * NOTE: random deals are NOT guaranteed solvable — live games use buildSolvableGame.
 */
export function buildMissionForLevel(
  numPlayers: number,
  level: number,
  rng: () => number,
  opts: MissionOptions = {}
): Mission {
  const extension = opts.extension !== false;
  const count = missionTaskCount(level);
  const objectiveCount = extension ? Math.min(objectiveCountForLevel(level), count - 1) : 0;
  const captureCount = count - objectiveCount;

  const pool = shuffle(colorCards(), rng);
  const picked = pool.slice(0, Math.min(captureCount, pool.length));

  const tasks: MissionTask[] = picked.map((card, i) => ({
    objective: { kind: "capture", card } as TaskObjective,
    owner: i % numPlayers,
    constraint: { kind: "none" } as MissionTask["constraint"],
  }));

  const lastIdx = tasks.length - 1;
  const hasLast = level >= 2 && tasks.length >= 2;
  const orderedMax = hasLast ? lastIdx : tasks.length; // indices [0, orderedMax) are "ordered"

  if (level >= 4) {
    // Relative order 1..k across the non-last capture tasks.
    for (let i = 0; i < orderedMax; i++) {
      tasks[i] = { ...tasks[i]!, constraint: { kind: "relative", order: i + 1 } };
    }
  }
  if (level >= 6 && orderedMax >= 1) {
    // Pin the first capture to absolute slot #1 (still consistent with the relative chain).
    tasks[0] = { ...tasks[0]!, constraint: { kind: "absolute", order: 1 } };
  }
  if (hasLast) {
    tasks[lastIdx] = { ...tasks[lastIdx]!, constraint: { kind: "last" } };
  }

  // Extension objectives (never ordered; owners continue round-robin after the captures).
  for (let i = 0; i < objectiveCount; i++) {
    tasks.push({
      objective: randomObjective(numPlayers, i, rng),
      owner: (picked.length + i) % numPlayers,
      constraint: { kind: "none" },
    });
  }

  return {
    id: `mission-${level + 1}`,
    name: `Mission ${level + 1} · ${missionName(level)}`,
    tasks,
    comms: extension ? commsForLevel(level) : "open",
    distressAllowed: extension,
  };
}
