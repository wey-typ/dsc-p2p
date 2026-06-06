import type { ResolvedTrick, Communication, GamePhase } from "./game.js";
import type { TaskState } from "./tasks.js";

/** A player as recorded in a finished game. */
export interface RecordedPlayer {
  seat: number;
  name: string;
  isBot: boolean;
}

/** A full, self-contained record of one finished game — enough to review trick by trick. */
export interface GameRecord {
  id: string;
  finishedAt: number;
  crewName: string;
  missionName: string;
  level: number;
  outcome: Extract<GamePhase, "won" | "lost">;
  failReason?: string;
  players: RecordedPlayer[];
  tricks: ResolvedTrick[];
  tasks: TaskState[];
  communications: Communication[];
}

/** Lightweight row for the history list view. */
export interface HistorySummary {
  id: string;
  finishedAt: number;
  crewName: string;
  missionName: string;
  level: number;
  outcome: "won" | "lost";
  players: string[];
  tricks: number;
  tasksCleared: number;
  tasksTotal: number;
}

export function toSummary(rec: GameRecord): HistorySummary {
  return {
    id: rec.id,
    finishedAt: rec.finishedAt,
    crewName: rec.crewName,
    missionName: rec.missionName,
    level: rec.level,
    outcome: rec.outcome,
    players: rec.players.map((p) => p.name),
    tricks: rec.tricks.length,
    tasksCleared: rec.tasks.filter((t) => t.status === "done").length,
    tasksTotal: rec.tasks.length,
  };
}
