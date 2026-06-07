import type { Card, PlayerView } from "@dsc/shared";

/** Lightweight room info shared with the guest (mirrors the LAN version's RoomView). */
export interface P2PRoom {
  phase: "lobby" | "playing" | "won" | "lost";
  level: number;
  players: { seat: number; name: string }[];
  hostName: string;
}

/** Guest → Host messages. */
export type GuestMsg =
  | { t: "hello"; name: string }
  | { t: "start"; level?: number }
  | { t: "play"; card: Card }
  | { t: "communicate"; card: Card }
  | { t: "restart" };

/** Host → Guest messages. */
export type HostMsg =
  | { t: "room"; room: P2PRoom }
  | { t: "view"; view: PlayerView }
  | { t: "error"; message: string };

export const GUEST_SEAT = 1;
export const HOST_SEAT = 0;
