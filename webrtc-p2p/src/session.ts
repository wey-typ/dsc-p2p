import {
  type GameState,
  type Player,
  type Card,
  type PlayerView,
  buildSolvableGame,
  playCard,
  communicate,
  chooseBotPlay,
  projectForSeat,
  missionName,
  mulberry32,
} from "@dsc/shared";
import type { Transport } from "./transport.js";
import { type GuestMsg, type HostMsg, type P2PRoom, HOST_SEAT } from "./protocol.js";

const MAX_PLAYERS = 5;

/** Serializable snapshot so the host can survive a tab reload / phone-lock eviction. */
export interface SavedHostState {
  players: Player[];
  level: number;
  game: GameState | null;
}

/**
 * Host controller: this browser is the authority. It owns the GameState (via the shared
 * engine), accepts each guest's actions over a Transport, and sends every seat its own
 * private view. Supports up to 5 players (host + 4 guests). Guests are keyed by a stable
 * `guestId`, so a dropped guest that re-handshakes RECLAIMS its seat (reconnect) with the
 * game intact.
 */
export class HostController {
  private players: Player[];
  private guests = new Map<number, Transport>(); // seat -> transport
  private pending = new Set<Transport>(); // attached, awaiting hello
  private game: GameState | null = null;
  private level = 0;
  private rng: () => number;
  private botCounter = 0;
  private botTimer: ReturnType<typeof setTimeout> | null = null;
  private botDelay = 600; // ms between bot moves (feels natural)

  constructor(
    hostName: string,
    private cb: {
      onHostView: (v: PlayerView | null) => void;
      onRoom: (r: P2PRoom) => void;
      onChange?: () => void; // fired on any state change (for persistence)
      onError?: (m: string) => void;
    },
    rng?: () => number
  ) {
    this.players = [{ id: "host", name: hostName, isBot: false }];
    this.rng = rng ?? mulberry32(Math.floor(Math.random() * 1e9));
  }

  /** Register a freshly-connected guest transport (seat resolved on its "hello"). */
  attachGuest(t: Transport): void {
    this.pending.add(t);
    t.onMessage((d) => this.onGuestMsg(t, d as GuestMsg));
    t.onClose(() => this.detach(t));
  }

  private seatOf(t: Transport): number | null {
    for (const [seat, tr] of this.guests) if (tr === t) return seat;
    return null;
  }

  private detach(t: Transport): void {
    this.pending.delete(t);
    const seat = this.seatOf(t);
    if (seat !== null) this.guests.delete(seat); // keep the player → reconnectable
    this.broadcastRoom();
  }

  private resolveSeat(guestId: string, name: string): number {
    const existing = this.players.findIndex((p) => p.id === guestId);
    if (existing >= 0) {
      this.players[existing] = { ...this.players[existing]!, name };
      return existing;
    }
    if (this.players.length >= MAX_PLAYERS) return -1;
    this.players.push({ id: guestId, name, isBot: false });
    return this.players.length - 1;
  }

  private onGuestMsg(t: Transport, msg: GuestMsg): void {
    switch (msg?.t) {
      case "hello": {
        const seat = this.resolveSeat(msg.guestId, (msg.name || "Guest").slice(0, 16));
        if (seat < 0) {
          t.send({ t: "error", message: "Room is full." } satisfies HostMsg);
          return;
        }
        this.pending.delete(t);
        this.guests.set(seat, t);
        this.broadcast(); // sends this guest the current room + (live) view
        break;
      }
      case "play": {
        const seat = this.seatOf(t);
        if (seat !== null) this.applyPlay(seat, msg.card);
        break;
      }
      case "communicate": {
        const seat = this.seatOf(t);
        if (seat !== null) this.applyCommunicate(seat, msg.card);
        break;
      }
    }
  }

  // ---- host's own actions (seat 0) ----
  play(card: Card): void {
    this.applyPlay(HOST_SEAT, card);
  }
  communicateHost(card: Card): void {
    this.applyCommunicate(HOST_SEAT, card);
  }
  setLevel(level: number): void {
    this.level = Math.max(0, level);
    this.broadcastRoom();
    this.cb.onChange?.();
  }
  start(level = this.level): void {
    if (this.players.length < 2) {
      this.cb.onError?.("Waiting for another diver to connect.");
      return;
    }
    this.level = Math.max(0, level);
    this.game = buildSolvableGame(this.players, this.level, this.rng);
    this.broadcast();
  }
  restart(): void {
    this.game = null;
    this.broadcast();
  }
  playerCount(): number {
    return this.players.length;
  }

  // ---- bots (host-run; lobby to add/remove, auto-played in-game) ----
  addBot(): void {
    if (this.game || this.players.length >= MAX_PLAYERS) return;
    this.botCounter += 1;
    this.players.push({ id: `bot-${this.botCounter}`, name: `Bot ${this.botCounter} (bot)`, isBot: true });
    this.broadcastRoom();
    this.cb.onChange?.();
  }
  removeBot(): void {
    if (this.game) return;
    const fromEnd = [...this.players].reverse().findIndex((p) => p.isBot);
    if (fromEnd < 0) return;
    this.players.splice(this.players.length - 1 - fromEnd, 1);
    this.broadcastRoom();
    this.cb.onChange?.();
  }
  isBotTurn(): boolean {
    return !!this.game && this.game.phase === "playing" && this.players[this.game.turn]?.isBot === true;
  }
  /** Play one move for the current bot seat (returns whether it acted). */
  playBotTurn(): boolean {
    if (!this.isBotTurn() || !this.game) return false;
    const seat = this.game.turn;
    this.applyPlay(seat, chooseBotPlay(this.game, seat));
    return true;
  }
  private scheduleBots(): void {
    if (this.botTimer || !this.isBotTurn()) return;
    this.botTimer = setTimeout(() => {
      this.botTimer = null;
      this.playBotTurn(); // applyPlay → broadcast → scheduleBots (chains to next bot)
    }, this.botDelay);
  }

  private applyPlay(seat: number, card: Card): void {
    if (!this.game) return;
    try {
      this.game = playCard(this.game, seat, card);
    } catch (e) {
      this.errorToSeat(seat, e instanceof Error ? e.message : "Illegal move.");
      return;
    }
    this.broadcast();
  }
  private applyCommunicate(seat: number, card: Card): void {
    if (!this.game) return;
    try {
      this.game = communicate(this.game, seat, card);
    } catch (e) {
      this.errorToSeat(seat, e instanceof Error ? e.message : "Cannot signal.");
      return;
    }
    this.broadcast();
  }

  private room(): P2PRoom {
    return {
      phase: this.game ? this.game.phase : "lobby",
      level: this.level,
      hostName: this.players[0]?.name ?? "Host",
      players: this.players.map((p, i) => ({ seat: i, name: p.name })),
    };
  }

  private broadcast(): void {
    this.broadcastRoom();
    if (this.game) {
      this.cb.onHostView(projectForSeat(this.game, HOST_SEAT));
      for (const [seat, t] of this.guests) t.send({ t: "view", view: projectForSeat(this.game, seat) } satisfies HostMsg);
    } else {
      this.cb.onHostView(null);
    }
    this.cb.onChange?.();
    this.scheduleBots();
  }
  private broadcastRoom(): void {
    const r = this.room();
    this.cb.onRoom(r);
    for (const t of this.guests.values()) t.send({ t: "room", room: r } satisfies HostMsg);
  }
  private errorToSeat(seat: number, message: string): void {
    if (seat === HOST_SEAT) this.cb.onError?.(message);
    else this.guests.get(seat)?.send({ t: "error", message } satisfies HostMsg);
  }

  // ---- persistence (host survives reload / phone eviction) ----
  serialize(): SavedHostState {
    return { players: this.players, level: this.level, game: this.game };
  }
  restore(saved: SavedHostState): void {
    this.players = saved.players?.length ? saved.players : this.players;
    this.level = saved.level ?? 0;
    this.game = saved.game ?? null;
    this.broadcast();
  }

  missionTitle(): string {
    return `Mission ${this.level + 1} · ${missionName(this.level)}`;
  }
}

/** Guest controller: thin client. Sends actions; renders the host's room/view. */
export class GuestController {
  constructor(
    private t: Transport,
    name: string,
    guestId: string,
    private cb: { onView: (v: PlayerView) => void; onRoom: (r: P2PRoom) => void; onError?: (m: string) => void }
  ) {
    t.onMessage((d) => this.onHostMsg(d as HostMsg));
    this.t.send({ t: "hello", name, guestId } satisfies GuestMsg);
  }
  private onHostMsg(msg: HostMsg): void {
    if (msg?.t === "room") this.cb.onRoom(msg.room);
    else if (msg?.t === "view") this.cb.onView(msg.view);
    else if (msg?.t === "error") this.cb.onError?.(msg.message);
  }
  play(card: Card): void {
    this.t.send({ t: "play", card } satisfies GuestMsg);
  }
  communicate(card: Card): void {
    this.t.send({ t: "communicate", card } satisfies GuestMsg);
  }
}
