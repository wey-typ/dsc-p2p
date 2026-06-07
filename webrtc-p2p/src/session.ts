import {
  type GameState,
  type Player,
  type Card,
  type PlayerView,
  buildSolvableGame,
  playCard,
  communicate,
  projectForSeat,
  missionName,
  mulberry32,
} from "@dsc/shared";
import type { Transport } from "./transport.js";
import { type GuestMsg, type HostMsg, type P2PRoom, GUEST_SEAT, HOST_SEAT } from "./protocol.js";

/**
 * Host controller: this browser is the authority. It owns the GameState (via the shared
 * engine), accepts the guest's actions over a Transport, and sends each side its own
 * private view. The host's own UI talks to it directly (no network).
 */
export class HostController {
  private players: Player[];
  private guest: Transport | null = null;
  private game: GameState | null = null;
  private level = 0;
  private rng: () => number;
  private guestName = "Guest";

  constructor(
    private hostName: string,
    private cb: { onHostView: (v: PlayerView | null) => void; onRoom: (r: P2PRoom) => void; onError?: (m: string) => void },
    rng?: () => number
  ) {
    this.players = [{ id: "host", name: hostName, isBot: false }];
    this.rng = rng ?? mulberry32(Math.floor(Math.random() * 1e9));
  }

  /** Attach the (single) guest's transport once the WebRTC channel is open. */
  attachGuest(t: Transport): void {
    this.guest = t;
    t.onMessage((d) => this.onGuestMsg(d as GuestMsg));
    t.onClose(() => {
      this.guest = null;
      this.broadcastRoom();
    });
  }

  private onGuestMsg(msg: GuestMsg): void {
    switch (msg?.t) {
      case "hello":
        this.guestName = msg.name?.slice(0, 16) || "Guest";
        this.ensureSeat();
        this.broadcast();
        break;
      case "start":
        this.start(msg.level ?? this.level);
        break;
      case "play":
        this.applyPlay(GUEST_SEAT, msg.card);
        break;
      case "communicate":
        this.applyCommunicate(GUEST_SEAT, msg.card);
        break;
      case "restart":
        this.game = null;
        this.broadcast();
        break;
    }
  }

  private ensureSeat(): void {
    if (this.players.length < 2) {
      this.players.push({ id: "guest", name: this.guestName, isBot: false });
    } else {
      this.players[GUEST_SEAT] = { id: "guest", name: this.guestName, isBot: false };
    }
  }

  setLevel(level: number): void {
    this.level = Math.max(0, level);
    this.broadcastRoom();
  }

  start(level = this.level): void {
    if (this.players.length < 2) {
      this.cb.onError?.("Waiting for a second diver to connect.");
      return;
    }
    this.level = Math.max(0, level);
    this.game = buildSolvableGame(this.players, this.level, this.rng);
    this.broadcast();
  }

  /** Host's own move (seat 0). */
  play(card: Card): void {
    this.applyPlay(HOST_SEAT, card);
  }
  communicateHost(card: Card): void {
    this.applyCommunicate(HOST_SEAT, card);
  }
  restart(): void {
    this.game = null;
    this.broadcast();
  }

  private applyPlay(seat: number, card: Card): void {
    if (!this.game) return;
    try {
      this.game = playCard(this.game, seat, card);
    } catch (e) {
      this.toSeat(seat, { t: "error", message: e instanceof Error ? e.message : "Illegal move." });
      return;
    }
    this.broadcast();
  }

  private applyCommunicate(seat: number, card: Card): void {
    if (!this.game) return;
    try {
      this.game = communicate(this.game, seat, card);
    } catch (e) {
      this.toSeat(seat, { t: "error", message: e instanceof Error ? e.message : "Cannot signal." });
      return;
    }
    this.broadcast();
  }

  private room(): P2PRoom {
    return {
      phase: this.game ? this.game.phase : "lobby",
      level: this.level,
      hostName: this.hostName,
      players: this.players.map((p, i) => ({ seat: i, name: p.name })),
    };
  }

  private broadcast(): void {
    this.broadcastRoom();
    if (this.game) {
      this.cb.onHostView(projectForSeat(this.game, HOST_SEAT));
      this.guest?.send({ t: "view", view: projectForSeat(this.game, GUEST_SEAT) } satisfies HostMsg);
    } else {
      this.cb.onHostView(null);
    }
  }

  private broadcastRoom(): void {
    const r = this.room();
    this.cb.onRoom(r);
    this.guest?.send({ t: "room", room: r } satisfies HostMsg);
  }

  private toSeat(seat: number, msg: HostMsg): void {
    if (seat === GUEST_SEAT) this.guest?.send(msg);
    else if (msg.t === "error") this.cb.onError?.(msg.message);
  }

  missionTitle(): string {
    return `Mission ${this.level + 1} · ${missionName(this.level)}`;
  }
}

/**
 * Guest controller: a thin client. Sends actions to the host and renders the views/room
 * the host sends back. No game logic lives here (the host is authoritative).
 */
export class GuestController {
  constructor(
    private t: Transport,
    private name: string,
    private cb: { onView: (v: PlayerView) => void; onRoom: (r: P2PRoom) => void; onError?: (m: string) => void }
  ) {
    t.onMessage((d) => this.onHostMsg(d as HostMsg));
    this.t.send({ t: "hello", name } satisfies GuestMsg);
  }

  private onHostMsg(msg: HostMsg): void {
    switch (msg?.t) {
      case "room":
        this.cb.onRoom(msg.room);
        break;
      case "view":
        this.cb.onView(msg.view);
        break;
      case "error":
        this.cb.onError?.(msg.message);
        break;
    }
  }

  play(card: Card): void {
    this.t.send({ t: "play", card } satisfies GuestMsg);
  }
  communicate(card: Card): void {
    this.t.send({ t: "communicate", card } satisfies GuestMsg);
  }
}
