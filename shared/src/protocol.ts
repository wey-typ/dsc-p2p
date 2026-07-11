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
  RoomRejoin: "room:rejoin",
  RoomKick: "room:kick",
  RoomAddBot: "room:addbot",
  RoomRemoveBot: "room:removebot",
  RoomSetLevel: "room:setlevel",
  GameStart: "game:start",
  GamePlay: "game:play",
  GameRestart: "game:restart",
  GamePause: "game:pause",
  GameResume: "game:resume",
  GameEnd: "game:end",
  GameCommunicate: "game:communicate",
  GameDistress: "game:distress",
  GameDistressPick: "game:distresspick",
  // server -> client
  RoomState: "room:state",
  GameView: "game:view",
  ErrorMsg: "error:msg",
  Kicked: "room:kicked",
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
export interface RejoinPayload {
  code: string;
  playerId: string;
}
export interface KickPayload {
  playerId: string;
}
export interface StartPayload {
  taskCount?: number;
}
export interface SetLevelPayload {
  level: number;
}

/** Highest selectable named level (0-based). 9 named missions: levels 0..8. */
export const MAX_LEVEL = 8;
export interface PlayPayload {
  card: Card;
}
export interface CommunicatePayload {
  card: Card;
}
/** Host fires the distress signal: every diver must pass one card this way. */
export interface DistressPayload {
  direction: "left" | "right";
}
/** A diver chooses the card they pass for the pending distress signal. */
export interface DistressPickPayload {
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
