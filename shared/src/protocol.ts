import type { Card } from "./types.js";
import type { PlayerView } from "./view.js";
import type { GamePhase } from "./game.js";

/** Lobby/room info visible to everyone in a room. */
export interface RoomPlayerView {
  readonly id: string;
  readonly name: string;
  readonly seat: number;
  readonly connected: boolean;
  readonly isBot: boolean;
}

export type RoomPhase = "lobby" | GamePhase;

export interface RoomView {
  readonly code: string;
  readonly hostId: string;
  readonly phase: RoomPhase;
  readonly players: RoomPlayerView[];
  readonly minPlayers: number;
  readonly maxPlayers: number;
  /** True while the host has paused an in-progress game. */
  readonly paused: boolean;
  /** Campaign progress for this crew. */
  readonly campaignName: string;
  readonly level: number;
  readonly attempts: number;
  readonly cleared: number;
}

// ---- socket event names (single source of truth for client + server) ----
export const EV = {
  // client -> server
  RoomCreate: "room:create",
  RoomJoin: "room:join",
  RoomLeave: "room:leave",
  GameStart: "game:start",
  GamePlay: "game:play",
  GameRestart: "game:restart",
  GamePause: "game:pause",
  GameResume: "game:resume",
  GameEnd: "game:end",
  // server -> client
  RoomState: "room:state",
  GameView: "game:view",
  ErrorMsg: "error:msg",
} as const;

// ---- payloads ----
export interface CreatePayload {
  name: string;
  /** Optional crew/campaign name used to save & resume progress. */
  crewName?: string;
}
export interface JoinPayload {
  code: string;
  name: string;
}
export interface StartPayload {
  taskCount?: number;
}
export interface PlayPayload {
  card: Card;
}

/** Ack returned to the client after create/join. */
export interface JoinAck {
  ok: boolean;
  error?: string;
  code?: string;
  youId?: string;
  seat?: number;
}

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;

export type { PlayerView };
