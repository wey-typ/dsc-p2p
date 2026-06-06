import {
  type GameState,
  type Mission,
  type Player,
  type RoomView,
  type RoomPlayerView,
  type Card,
  createGame,
  playCard,
  communicate,
  buildSimpleMission,
  buildMissionForLevel,
  mulberry32,
  MIN_PLAYERS,
  MAX_PLAYERS,
} from "@dsc/shared";
import { CampaignStore } from "./campaign.js";

export interface RoomPlayer {
  id: string;
  name: string;
  seat: number;
  connected: boolean;
  isBot: boolean;
}

export interface Room {
  code: string;
  hostId: string;
  players: RoomPlayer[];
  phase: "lobby" | "playing" | "won" | "lost";
  game: GameState | null;
  mission: Mission | null;
  paused: boolean;
  // Campaign progress (mirrors the persisted record).
  campaignName: string;
  campaignId: string;
  level: number;
  attempts: number;
  cleared: number;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I

/** Tasks scale with campaign level; capped so a single game stays ~20 min. */
export function taskCountForLevel(level: number): number {
  return Math.min(2 + level, 8);
}

export class RoomManager {
  private rooms = new Map<string, Room>();
  private rng: () => number;
  private store: CampaignStore | null;

  constructor(seed?: number, store?: CampaignStore | null) {
    this.rng = mulberry32(seed ?? 0x9e3779b9);
    this.store = store === undefined ? new CampaignStore() : store;
  }

  private now(): number {
    // Real wall-clock in production; harmless for tests (timestamps unasserted).
    return Date.now();
  }

  private genCode(): string {
    let code = "";
    do {
      code = "";
      for (let i = 0; i < 4; i++) {
        code += CODE_ALPHABET[Math.floor(this.rng() * CODE_ALPHABET.length)];
      }
    } while (this.rooms.has(code));
    return code;
  }

  private nextId(prefix = "p"): string {
    return `${prefix}-${Math.floor(this.rng() * 1e9).toString(36)}`;
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  createRoom(hostName: string, crewName?: string): { room: Room; player: RoomPlayer } {
    const code = this.genCode();
    const player: RoomPlayer = {
      id: this.nextId(),
      name: sanitizeName(hostName),
      seat: 0,
      connected: true,
      isBot: false,
    };
    const name = sanitizeCrewName(crewName) || `Crew ${code}`;
    const progress = this.store ? this.store.load(name, this.now()) : null;
    const room: Room = {
      code,
      hostId: player.id,
      players: [player],
      phase: "lobby",
      game: null,
      mission: null,
      paused: false,
      campaignName: name,
      campaignId: progress?.id ?? name,
      level: progress?.level ?? 0,
      attempts: progress?.attempts ?? 0,
      cleared: progress?.cleared ?? 0,
    };
    this.rooms.set(code, room);
    return { room, player };
  }

  joinRoom(code: string, name: string): { room: Room; player: RoomPlayer } | { error: string } {
    const room = this.getRoom(code);
    if (!room) return { error: "Room not found." };
    if (room.phase !== "lobby") return { error: "Game already started." };
    if (room.players.length >= MAX_PLAYERS) return { error: "Room is full." };
    const player: RoomPlayer = {
      id: this.nextId(),
      name: sanitizeName(name),
      seat: room.players.length,
      connected: true,
      isBot: false,
    };
    room.players.push(player);
    return { room, player };
  }

  disconnect(code: string, playerId: string): void {
    const room = this.getRoom(code);
    if (!room) return;
    const p = room.players.find((x) => x.id === playerId);
    if (p) p.connected = false;
    if (room.players.every((x) => !x.connected)) {
      this.rooms.delete(room.code);
      return;
    }
    // If the host dropped, hand the host role to the first still-connected player so
    // game controls (pause/end/start) never get stuck.
    if (room.hostId === playerId) {
      const next = room.players.find((x) => x.connected);
      if (next) room.hostId = next.id;
    }
  }

  startGame(code: string, taskCount?: number, seed?: number): { ok: true } | { error: string } {
    const room = this.getRoom(code);
    if (!room) return { error: "Room not found." };
    if (room.phase === "playing") return { error: "Game already in progress." };
    if (room.players.length < MIN_PLAYERS) {
      return { error: `Need at least ${MIN_PLAYERS} players.` };
    }
    const n = room.players.length;
    const rng = mulberry32(seed ?? Math.floor(this.rng() * 1e9));
    // An explicit taskCount forces a simple unordered mission (used by tests / quick play);
    // otherwise build the curated, constraint-bearing mission for the current level.
    const mission =
      taskCount !== undefined
        ? buildSimpleMission(n, taskCount, rng, `mission-${room.level + 1}`)
        : buildMissionForLevel(n, room.level, rng);
    const enginePlayers: Player[] = room.players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
    }));
    room.mission = mission;
    room.game = createGame(enginePlayers, mission, rng);
    room.phase = "playing";
    room.paused = false;
    return { ok: true };
  }

  /** Return to the lobby, keeping campaign progress (used for "end" / "back to lobby"). */
  endGame(code: string): { ok: true } | { error: string } {
    const room = this.getRoom(code);
    if (!room) return { error: "Room not found." };
    this.persist(room);
    room.game = null;
    room.mission = null;
    room.phase = "lobby";
    room.paused = false;
    return { ok: true };
  }

  /** Alias kept for the client's "restart/back to lobby" control. */
  restart(code: string): { ok: true } | { error: string } {
    return this.endGame(code);
  }

  pause(code: string): { ok: true } | { error: string } {
    const room = this.getRoom(code);
    if (!room) return { error: "Room not found." };
    if (room.phase !== "playing") return { error: "No game to pause." };
    room.paused = true;
    return { ok: true };
  }

  resume(code: string): { ok: true } | { error: string } {
    const room = this.getRoom(code);
    if (!room) return { error: "Room not found." };
    room.paused = false;
    return { ok: true };
  }

  play(code: string, playerId: string, card: Card): { ok: true } | { error: string } {
    const room = this.getRoom(code);
    if (!room || !room.game) return { error: "No active game." };
    if (room.paused) return { error: "Game is paused." };
    const player = room.players.find((p) => p.id === playerId);
    if (!player) return { error: "You are not in this room." };
    const wasPlaying = room.game.phase === "playing";
    try {
      room.game = playCard(room.game, player.seat, card);
      room.phase = room.game.phase;
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Illegal move." };
    }
    // On transition to a terminal state, update + persist campaign progress.
    if (wasPlaying && room.game.phase !== "playing") {
      if (room.game.phase === "won") {
        room.cleared += 1;
        room.level += 1;
      } else {
        room.attempts += 1;
      }
      this.persist(room);
    }
    return { ok: true };
  }

  communicate(code: string, playerId: string, card: Card): { ok: true } | { error: string } {
    const room = this.getRoom(code);
    if (!room || !room.game) return { error: "No active game." };
    if (room.paused) return { error: "Game is paused." };
    const player = room.players.find((p) => p.id === playerId);
    if (!player) return { error: "You are not in this room." };
    try {
      room.game = communicate(room.game, player.seat, card);
      return { ok: true };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Cannot communicate." };
    }
  }

  private persist(room: Room): void {
    if (!this.store) return;
    this.store.save({
      id: room.campaignId,
      name: room.campaignName,
      level: room.level,
      attempts: room.attempts,
      cleared: room.cleared,
      updatedAt: this.now(),
    });
  }

  toRoomView(room: Room): RoomView {
    const players: RoomPlayerView[] = room.players.map((p) => ({
      id: p.id,
      name: p.name,
      seat: p.seat,
      connected: p.connected,
      isBot: p.isBot,
    }));
    return {
      code: room.code,
      hostId: room.hostId,
      phase: room.phase,
      players,
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
      paused: room.paused,
      campaignName: room.campaignName,
      level: room.level,
      attempts: room.attempts,
      cleared: room.cleared,
    };
  }
}

export function sanitizeName(name: string): string {
  const trimmed = (name ?? "").trim().slice(0, 16);
  return trimmed.length > 0 ? trimmed : "Diver";
}

export function sanitizeCrewName(name: string | undefined): string {
  return (name ?? "").trim().slice(0, 24);
}
