import {
  type GameState,
  type Mission,
  type Player,
  type RoomView,
  type RoomPlayerView,
  type Card,
  createGame,
  playCard,
  buildSimpleMission,
  defaultTaskCount,
  mulberry32,
  MIN_PLAYERS,
  MAX_PLAYERS,
} from "@dsc/shared";

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
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I

export class RoomManager {
  private rooms = new Map<string, Room>();
  private rng: () => number;

  constructor(seed?: number) {
    // Default to a time-free-but-varied seed; tests pass a fixed seed for determinism.
    this.rng = mulberry32(seed ?? 0x9e3779b9);
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

  createRoom(hostName: string): { room: Room; player: RoomPlayer } {
    const code = this.genCode();
    const player: RoomPlayer = {
      id: this.nextId(),
      name: sanitizeName(hostName),
      seat: 0,
      connected: true,
      isBot: false,
    };
    const room: Room = {
      code,
      hostId: player.id,
      players: [player],
      phase: "lobby",
      game: null,
      mission: null,
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

  /** Mark a member disconnected; if it empties the room, delete it. */
  disconnect(code: string, playerId: string): void {
    const room = this.getRoom(code);
    if (!room) return;
    const p = room.players.find((x) => x.id === playerId);
    if (p) p.connected = false;
    if (room.players.every((x) => !x.connected)) {
      this.rooms.delete(room.code);
    }
  }

  startGame(code: string, taskCount?: number, seed?: number): { ok: true } | { error: string } {
    const room = this.getRoom(code);
    if (!room) return { error: "Room not found." };
    if (room.players.length < MIN_PLAYERS) {
      return { error: `Need at least ${MIN_PLAYERS} players.` };
    }
    const n = room.players.length;
    const rng = mulberry32(seed ?? Math.floor(this.rng() * 1e9));
    const count = taskCount ?? defaultTaskCount(n);
    const mission = buildSimpleMission(n, count, rng);
    const enginePlayers: Player[] = room.players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
    }));
    room.mission = mission;
    room.game = createGame(enginePlayers, mission, rng);
    room.phase = "playing";
    return { ok: true };
  }

  /** Restart the same room from the lobby (or replay a new deal). */
  restart(code: string): { ok: true } | { error: string } {
    const room = this.getRoom(code);
    if (!room) return { error: "Room not found." };
    room.game = null;
    room.mission = null;
    room.phase = "lobby";
    return { ok: true };
  }

  play(code: string, playerId: string, card: Card): { ok: true } | { error: string } {
    const room = this.getRoom(code);
    if (!room || !room.game) return { error: "No active game." };
    const player = room.players.find((p) => p.id === playerId);
    if (!player) return { error: "You are not in this room." };
    try {
      room.game = playCard(room.game, player.seat, card);
      room.phase = room.game.phase;
      return { ok: true };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Illegal move." };
    }
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
    };
  }
}

export function sanitizeName(name: string): string {
  const trimmed = (name ?? "").trim().slice(0, 16);
  return trimmed.length > 0 ? trimmed : "Diver";
}
