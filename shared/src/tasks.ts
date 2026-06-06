import type { Card } from "./types.js";

/**
 * Ordering constraints a task can carry. These make missions progressively harder.
 * - none:     complete any time.
 * - relative: must be completed in ascending `order` relative to other relative tasks.
 * - absolute: must be exactly the `order`-th task the crew completes overall (1-based).
 * - last:     must be the very last task completed.
 */
export type TaskConstraint =
  | { kind: "none" }
  | { kind: "relative"; order: number }
  | { kind: "absolute"; order: number }
  | { kind: "last" };

export type TaskStatus = "pending" | "done" | "failed";

/** A task definition as authored in a mission (before the game assigns runtime state). */
export interface MissionTask {
  /** The card whose trick must be won by `owner`. */
  readonly card: Card;
  /** Seat index responsible for capturing the card. */
  readonly owner: number;
  readonly constraint: TaskConstraint;
}

/** Runtime task state during a game. */
export interface TaskState {
  readonly id: string;
  readonly card: Card;
  readonly owner: number;
  readonly constraint: TaskConstraint;
  status: TaskStatus;
  /** 1-based order in which this task was completed among all tasks. */
  completionIndex?: number;
  /** Index of the trick (1-based) in which it resolved. */
  completedAtTrick?: number;
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
