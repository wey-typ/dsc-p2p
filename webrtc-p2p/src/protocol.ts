import type { Card, PlayerView } from "@dsc/shared";

/** Lightweight room info shared with the guest (mirrors the LAN version's RoomView). */
export interface P2PRoom {
  phase: "lobby" | "playing" | "won" | "lost";
  level: number;
  players: { seat: number; name: string }[];
  hostName: string;
}

/** Guest → Host messages. `guestId` is a stable per-device id so a returning guest
 *  reclaims its existing seat (reconnect) instead of taking a new one. */
export type GuestMsg =
  | { t: "hello"; name: string; guestId: string }
  | { t: "play"; card: Card }
  | { t: "communicate"; card: Card };

/** Host → Guest messages. */
export type HostMsg =
  | { t: "room"; room: P2PRoom }
  | { t: "view"; view: PlayerView }
  | { t: "error"; message: string };

export const GUEST_SEAT = 1;
export const HOST_SEAT = 0;
