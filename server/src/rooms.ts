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
  BotPlanner,
  chooseDistressPass,
  startDistress,
  pickDistressCard,
  type BotWeights,
  DEFAULT_WEIGHTS,
  buildSimpleMission,
  buildSolvableGameWithLine,
  missionName,
  mulberry32,
  MIN_PLAYERS,
  MAX_PLAYERS,
  MAX_LEVEL,
} from "@dsc/shared";
import { CampaignStore, slugify } from "./campaign.js";
import type { HistoryStore } from "./history.js";
import type { GameRecord } from "@dsc/shared";

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
  /** Shared bot brain for the current game (solver-backed planner); reset each deal. */
  planner: BotPlanner | null;
  paused: boolean;
  /** When the room became fully empty (all disconnected); for grace-period cleanup. */
  emptySince?: number;
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
  private history: HistoryStore | null;
  private weightsProvider: () => BotWeights;

  constructor(
    seed?: number,
    store?: CampaignStore | null,
    history?: HistoryStore | null,
    weightsProvider?: () => BotWeights
  ) {
    this.rng = mulberry32(seed ?? 0x9e3779b9);
    this.store = store === undefined ? new CampaignStore() : store;
    this.history = history ?? null;
    this.weightsProvider = weightsProvider ?? (() => DEFAULT_WEIGHTS);
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
      planner: null,
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
    room.emptySince = undefined;
    return { room, player };
  }

  disconnect(code: string, playerId: string, now = Date.now()): void {
    const room = this.getRoom(code);
    if (!room) return;
    const p = room.players.find((x) => x.id === playerId);
    if (p) p.connected = false;
    if (room.players.every((x) => !x.connected)) {
      // Don't delete immediately — keep the room for a grace period so players can
      // reconnect after a brief drop (phone lock / Wi-Fi blip). Swept later.
      room.emptySince = now;
      return;
    }
    // If the host dropped, hand the host role to the first still-connected player so
    // game controls (pause/end/start) never get stuck.
    if (room.hostId === playerId) {
      const next = room.players.find((x) => x.connected);
      if (next) room.hostId = next.id;
    }
  }

  /** Fully remove a player and re-seat the rest (lobby use: leave / kick). */
  removePlayer(code: string, playerId: string): void {
    const room = this.getRoom(code);
    if (!room) return;
    const wasHost = room.hostId === playerId;
    room.players = room.players.filter((p) => p.id !== playerId);
    room.players.forEach((p, i) => (p.seat = i)); // keep seats contiguous
    if (room.players.length === 0) {
      room.emptySince = Date.now();
      return;
    }
    if (wasHost) {
      const next = room.players.find((p) => p.connected) ?? room.players[0]!;
      room.hostId = next.id;
    }
  }

  /** Host removes another player. Lobby only (removing a seat mid-hand breaks the deal). */
  kick(code: string, requesterId: string, targetId: string): { ok: true } | { error: string } {
    const room = this.getRoom(code);
    if (!room) return { error: "Room not found." };
    if (room.hostId !== requesterId) return { error: "Only the host can remove players." };
    if (room.phase !== "lobby") return { error: "Can only remove players in the lobby." };
    if (targetId === requesterId) return { error: "You can't remove yourself." };
    if (!room.players.some((p) => p.id === targetId)) return { error: "Player not found." };
    this.removePlayer(code, targetId);
    return { ok: true };
  }

  /**
   * Re-attach a returning player (same playerId) to their existing seat after a drop.
   * Their hand and the game state are untouched, so play resumes seamlessly.
   */
  rejoin(code: string, playerId: string): { room: Room; player: RoomPlayer } | { error: string } {
    const room = this.getRoom(code);
    if (!room) return { error: "That game is no longer available." };
    const player = room.players.find((p) => p.id === playerId);
    if (!player) return { error: "Your seat is no longer in this game." };
    player.connected = true;
    room.emptySince = undefined;
    return { room, player };
  }

  /** Delete rooms that have been fully empty longer than the grace period. */
  sweepEmptyRooms(graceMs = 120000, now = Date.now()): void {
    for (const room of [...this.rooms.values()]) {
      if (room.emptySince !== undefined && now - room.emptySince > graceMs) {
        this.rooms.delete(room.code);
      }
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
    const enginePlayers: Player[] = room.players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
    }));
    // Fresh bot brain per deal; the node budget keeps worst-case thinking time per bot
    // move well under a second.
    room.planner = new BotPlanner({ nodes: 20000, maxAttempts: 2 });
    if (taskCount !== undefined) {
      // Explicit taskCount forces a simple unordered mission (used by tests / quick play).
      const mission = buildSimpleMission(n, taskCount, rng, `mission-${room.level + 1}`);
      room.mission = mission;
      room.game = createGame(enginePlayers, mission, rng);
    } else {
      // Build a GUARANTEED-SOLVABLE mission for this level so every level is winnable,
      // and hand the constructive winning line to the bot planner: bots start the game
      // already knowing one way to win and only re-solve if a human deviates from it.
      const { state, line } = buildSolvableGameWithLine(enginePlayers, room.level, rng);
      room.game = state;
      room.planner.seedPlan(state, line);
      room.mission = {
        id: `mission-${room.level + 1}`,
        name: `Mission ${room.level + 1} · ${missionName(room.level)}`,
        tasks: [],
      };
    }
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
    room.planner = null;
    room.phase = "lobby";
    room.paused = false;
    return { ok: true };
  }

  /** Alias kept for the client's "restart/back to lobby" control. */
  restart(code: string): { ok: true } | { error: string } {
    return this.endGame(code);
  }

  /** Choose which level to play next (lobby only). Clamped to 0..MAX_LEVEL. */
  setLevel(code: string, level: number): { ok: true } | { error: string } {
    const room = this.getRoom(code);
    if (!room) return { error: "Room not found." };
    if (room.phase !== "lobby") return { error: "Can only change level in the lobby." };
    if (!Number.isFinite(level)) return { error: "Invalid level." };
    room.level = Math.max(0, Math.min(MAX_LEVEL, Math.floor(level)));
    return { ok: true };
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
    // On transition to a terminal state, update + persist campaign progress + history.
    if (wasPlaying && room.game.phase !== "playing") {
      const playedLevel = room.level; // mission level that was just played
      const outcome = room.game.phase;
      if (outcome === "won") {
        room.cleared += 1;
        room.level += 1;
      } else {
        room.attempts += 1;
      }
      this.persist(room);
      this.recordHistory(room, playedLevel, outcome);
    }
    return { ok: true };
  }

  private recordHistory(room: Room, playedLevel: number, outcome: "won" | "lost"): void {
    if (!this.history || !room.game) return;
    const finishedAt = this.now();
    const rec: GameRecord = {
      id: `${slugify(room.campaignName)}-${finishedAt}`,
      finishedAt,
      crewName: room.campaignName,
      missionName: room.mission?.name ?? `Mission ${playedLevel + 1}`,
      level: playedLevel,
      outcome,
      failReason: room.game.failReason,
      players: room.players.map((p) => ({ seat: p.seat, name: p.name, isBot: p.isBot })),
      tricks: room.game.resolvedTricks ?? [],
      tasks: room.game.tasks,
      communications: room.game.communications,
    };
    this.history.save(rec);
  }

  private static BOT_NAMES = ["Marlin", "Coral", "Finn", "Nessie", "Bubbles", "Kraken"];

  addBot(code: string): { ok: true } | { error: string } {
    const room = this.getRoom(code);
    if (!room) return { error: "Room not found." };
    if (room.phase !== "lobby") return { error: "Can only add bots in the lobby." };
    if (room.players.length >= MAX_PLAYERS) return { error: "Room is full." };
    const used = new Set(room.players.map((p) => p.name));
    const base = RoomManager.BOT_NAMES.find((n) => !used.has(`${n} (bot)`)) ?? "Diverbot";
    room.players.push({
      id: this.nextId("bot"),
      name: `${base} (bot)`,
      seat: room.players.length,
      connected: true,
      isBot: true,
    });
    return { ok: true };
  }

  removeBot(code: string): { ok: true } | { error: string } {
    const room = this.getRoom(code);
    if (!room) return { error: "Room not found." };
    if (room.phase !== "lobby") return { error: "Can only remove bots in the lobby." };
    const idx = [...room.players].reverse().findIndex((p) => p.isBot);
    if (idx === -1) return { error: "No bots to remove." };
    room.players.splice(room.players.length - 1 - idx, 1);
    room.players.forEach((p, i) => (p.seat = i)); // re-seat
    return { ok: true };
  }

  /** True if it's currently a bot seat's turn in an active, unpaused game. */
  isBotTurn(code: string): boolean {
    const room = this.getRoom(code);
    if (!room || !room.game || room.paused || room.game.phase !== "playing" || room.game.distress) return false;
    const seatPlayer = room.players.find((p) => p.seat === room.game!.turn);
    return seatPlayer?.isBot === true;
  }

  /** Play one bot move for the current turn (if it is a bot). Returns whether it acted. */
  playBotTurn(code: string): boolean {
    const room = this.getRoom(code);
    if (!room || !room.game || !this.isBotTurn(code)) return false;
    const seat = room.game.turn;
    room.planner ??= new BotPlanner({ nodes: 20000, maxAttempts: 2 });
    const card = room.planner.choose(room.game, seat, this.weightsProvider());
    const player = room.players.find((p) => p.seat === seat)!;
    const res = this.play(code, player.id, card);
    return "ok" in res;
  }

  /** Host fires the distress signal: every diver must pass one card `direction`. */
  distress(code: string, playerId: string, direction: "left" | "right"): { ok: true } | { error: string } {
    const room = this.getRoom(code);
    if (!room || !room.game) return { error: "No active game." };
    if (room.paused) return { error: "Game is paused." };
    if (room.hostId !== playerId) return { error: "Only the host can fire the distress signal." };
    try {
      room.game = startDistress(room.game, direction);
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Cannot fire the distress signal." };
    }
    this.botDistressPicks(room);
    return { ok: true };
  }

  /** A diver picks the card they pass for the pending distress signal. */
  distressPick(code: string, playerId: string, card: Card): { ok: true } | { error: string } {
    const room = this.getRoom(code);
    if (!room || !room.game) return { error: "No active game." };
    const player = room.players.find((p) => p.id === playerId);
    if (!player) return { error: "You are not in this room." };
    try {
      room.game = pickDistressCard(room.game, player.seat, card);
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Cannot pass that card." };
    }
    this.afterDistressMaybeComplete(room);
    return { ok: true };
  }

  /** Bots choose their distress pass immediately (humans pick at their own pace). */
  private botDistressPicks(room: Room): void {
    for (const p of room.players) {
      if (!room.game?.distress) break;
      if (!p.isBot || room.game.distress.picks[p.seat]) continue;
      room.game = pickDistressCard(room.game, p.seat, chooseDistressPass(room.game, p.seat));
    }
    this.afterDistressMaybeComplete(room);
  }

  /** Once every seat has passed, hands changed — the seeded plan is stale, so replan. */
  private afterDistressMaybeComplete(room: Room): void {
    if (room.game && !room.game.distress) {
      room.planner = new BotPlanner({ nodes: 20000, maxAttempts: 2 });
    }
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
