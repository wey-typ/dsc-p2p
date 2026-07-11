import type { Card, ColorSuit } from "./types.js";

/**
 * Ordering constraints a task can carry. These make missions progressively harder.
 * Constraints only ever attach to CAPTURE tasks (win-this-card); other objective kinds
 * always carry `none`. "Order" is counted among capture tasks only.
 * - none:     complete any time.
 * - relative: must be completed in ascending `order` relative to other relative tasks.
 * - absolute: must be exactly the `order`-th capture task the crew completes (1-based).
 * - last:     must be the last CAPTURE task completed.
 */
export type TaskConstraint =
  | { kind: "none" }
  | { kind: "relative"; order: number }
  | { kind: "absolute"; order: number }
  | { kind: "last" };

/**
 * What a task requires (the "extension" objective deck). Beyond the classic
 * win-this-exact-card capture, missions can demand trick-level feats:
 * - capture:    `owner` must win the trick containing `card` (the original task type).
 * - winTrick:   `owner` must win trick number `trick` (1-based; usually the first).
 * - winExactly: `owner` must finish the mission having won exactly `count` tricks
 *               (0 = win no tricks at all).
 * - avoidColor: `owner` must not capture ANY card of `suit` all mission.
 */
export type TaskObjective =
  | { kind: "capture"; card: Card }
  | { kind: "winTrick"; trick: number }
  | { kind: "winExactly"; count: number }
  | { kind: "avoidColor"; suit: ColorSuit };

export type TaskStatus = "pending" | "done" | "failed";

/** A task definition as authored in a mission (before the game assigns runtime state). */
export interface MissionTask {
  readonly objective: TaskObjective;
  /** Seat index responsible for the objective. */
  readonly owner: number;
  readonly constraint: TaskConstraint;
}

/** Runtime task state during a game. */
export interface TaskState {
  readonly id: string;
  readonly objective: TaskObjective;
  /** Convenience mirror of `objective.card` for capture tasks (undefined otherwise). */
  readonly card?: Card;
  readonly owner: number;
  readonly constraint: TaskConstraint;
  status: TaskStatus;
  /** 1-based order in which this task was completed among CAPTURE tasks. */
  completionIndex?: number;
  /** Index of the trick (1-based) in which it resolved. */
  completedAtTrick?: number;
}

/** Shorthand: authored capture task (keeps mission-building code readable). */
export function captureTask(card: Card, owner: number, constraint: TaskConstraint = { kind: "none" }): MissionTask {
  return { objective: { kind: "capture", card }, owner, constraint };
}

/** Sort key so tasks completing in the same trick resolve in a constraint-friendly order. */
export function completionSortKey(c: TaskConstraint): number {
  switch (c.kind) {
    case "relative":
    case "absolute":
      return c.order;
    case "none":
      return Number.MAX_SAFE_INTEGER - 1;
    case "last":
      return Number.MAX_SAFE_INTEGER;
  }
}

const SUIT_LABEL: Record<ColorSuit, string> = {
  blue: "Current",
  green: "Kelp",
  pink: "Coral",
  yellow: "Sand",
};

/** Short human-readable description of a task objective (shared by client + history UI). */
export function describeObjective(o: TaskObjective): string {
  switch (o.kind) {
    case "capture":
      return `Win the ${SUIT_LABEL[o.card.suit as ColorSuit] ?? o.card.suit} ${o.card.value}`;
    case "winTrick":
      return o.trick === 1 ? "Win the FIRST trick" : `Win trick #${o.trick}`;
    case "winExactly":
      return o.count === 0
        ? "Win NO tricks"
        : `Win exactly ${o.count} trick${o.count === 1 ? "" : "s"}`;
    case "avoidColor":
      return `Win no ${SUIT_LABEL[o.suit]} cards`;
  }
}
