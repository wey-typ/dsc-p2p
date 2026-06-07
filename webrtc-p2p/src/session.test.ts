import { describe, it, expect } from "vitest";
import { type PlayerView, mulberry32 } from "@dsc/shared";
import { createMemoryPair } from "./transport.js";
import { HostController, GuestController } from "./session.js";
import type { P2PRoom } from "./protocol.js";

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("P2P session", () => {
  it("plays a full 2-player game; host authoritative; hands private", async () => {
    const { a, b } = createMemoryPair();
    let hostView: PlayerView | null = null;
    let guestView: PlayerView | null = null;
    let hostRoom: P2PRoom | null = null;

    const host = new HostController("Alpha", { onHostView: (v) => (hostView = v), onRoom: (r) => (hostRoom = r) }, mulberry32(123));
    host.attachGuest(a);
    const guest = new GuestController(b, "Bravo", "g1", { onView: (v) => (guestView = v), onRoom: () => {} });

    await flush();
    expect(hostRoom?.players.map((p) => p.name)).toEqual(["Alpha", "Bravo"]);
    host.start(0);
    await flush();
    expect(hostView!.handCounts.reduce((x, y) => x + y, 0)).toBe(40);

    for (let i = 0; i < 80 && hostView!.phase === "playing"; i++) {
      if (hostView!.turn === 0) { const c = hostView!.legalMoves[0]; if (c) host.play(c); }
      else { const c = guestView!.legalMoves[0]; if (c) guest.play(c); }
      await flush();
    }
    expect(["won", "lost"]).toContain(hostView!.phase);
    expect(hostView!.hand.length).toBe(hostView!.handCounts[0]);
    expect(guestView!.hand.length).toBe(guestView!.handCounts[1]);
    expect(guestView!.youSeat).toBe(1);
  });

  it("supports 3 players (host + 2 guests) end to end", async () => {
    const p1 = createMemoryPair();
    const p2 = createMemoryPair();
    const views: (PlayerView | null)[] = [null, null, null];

    const host = new HostController("H", { onHostView: (v) => (views[0] = v), onRoom: () => {} }, mulberry32(7));
    host.attachGuest(p1.a);
    host.attachGuest(p2.a);
    const g1 = new GuestController(p1.b, "G1", "g1", { onView: (v) => (views[1] = v), onRoom: () => {} });
    const g2 = new GuestController(p2.b, "G2", "g2", { onView: (v) => (views[2] = v), onRoom: () => {} });
    await flush();
    expect(host.playerCount()).toBe(3);

    host.start(0);
    await flush();
    expect(views[0]!.handCounts.reduce((x, y) => x + y, 0)).toBe(40);

    for (let i = 0; i < 120 && views[0]!.phase === "playing"; i++) {
      const turn = views[0]!.turn;
      const v = views[turn]!;
      const c = v.legalMoves[0];
      if (c) (turn === 0 ? host.play(c) : turn === 1 ? g1.play(c) : g2.play(c));
      await flush();
    }
    expect(["won", "lost"]).toContain(views[0]!.phase);
    expect(host.playerCount()).toBe(3);
  });

  it("a dropped guest reclaims its seat on reconnect (same guestId), game intact", async () => {
    const p1 = createMemoryPair();
    let hostView: PlayerView | null = null;
    let guestView: PlayerView | null = null;

    const host = new HostController("H", { onHostView: (v) => (hostView = v), onRoom: () => {} }, mulberry32(5));
    host.attachGuest(p1.a);
    new GuestController(p1.b, "G", "g1", { onView: () => {}, onRoom: () => {} });
    await flush();
    host.start(0);
    await flush();
    // play one card so the game is mid-flight
    if (hostView!.turn === 0) host.play(hostView!.legalMoves[0]!);
    await flush();
    const cardsBefore = host.serialize().game!.hands.reduce((n, h) => n + h.length, 0);

    // guest drops
    p1.a.close();
    await flush();
    expect(host.playerCount()).toBe(2); // seat kept for reconnect

    // guest re-handshakes with the SAME guestId
    const p2 = createMemoryPair();
    host.attachGuest(p2.a);
    new GuestController(p2.b, "G", "g1", { onView: (v) => (guestView = v), onRoom: () => {} });
    await flush();

    expect(host.playerCount()).toBe(2); // reclaimed, not a new seat
    expect(guestView).not.toBeNull(); // received the live view
    expect(guestView!.youSeat).toBe(1);
    expect(host.serialize().game!.hands.reduce((n, h) => n + h.length, 0)).toBe(cardsBefore);
  });

  it("serialize/restore lets a fresh host resume the game", async () => {
    const p1 = createMemoryPair();
    let hostView: PlayerView | null = null;
    const host = new HostController("H", { onHostView: (v) => (hostView = v), onRoom: () => {} }, mulberry32(11));
    host.attachGuest(p1.a);
    new GuestController(p1.b, "G", "g1", { onView: () => {}, onRoom: () => {} });
    await flush();
    host.start(0);
    await flush();
    if (hostView!.turn === 0) host.play(hostView!.legalMoves[0]!);
    await flush();
    const snap = host.serialize();

    // brand-new host instance restores the snapshot; a returning guest gets the live state
    let resumedGuestView: PlayerView | null = null;
    const host2 = new HostController("H", { onHostView: () => {}, onRoom: () => {} }, mulberry32(0));
    host2.restore(snap);
    const p2 = createMemoryPair();
    host2.attachGuest(p2.a);
    new GuestController(p2.b, "G", "g1", { onView: (v) => (resumedGuestView = v), onRoom: () => {} });
    await flush();

    expect(resumedGuestView).not.toBeNull();
    expect(host2.serialize().game!.trickNumber).toBe(snap.game!.trickNumber);
  });
});
