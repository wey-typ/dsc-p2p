import { describe, it, expect } from "vitest";
import { type PlayerView, mulberry32 } from "@dsc/shared";
import { createMemoryPair } from "./transport.js";
import { HostController, GuestController } from "./session.js";
import type { P2PRoom } from "./protocol.js";

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("P2P host/guest session over a transport", () => {
  it("plays a full 2-player game; host is authoritative; hands stay private", async () => {
    const { a, b } = createMemoryPair();

    let hostView: PlayerView | null = null;
    let guestView: PlayerView | null = null;
    let hostRoom: P2PRoom | null = null;
    let guestRoom: P2PRoom | null = null;

    const host = new HostController(
      "Alpha",
      { onHostView: (v) => (hostView = v), onRoom: (r) => (hostRoom = r) },
      mulberry32(123)
    );
    host.attachGuest(a);
    const guest = new GuestController(b, "Bravo", {
      onView: (v) => (guestView = v),
      onRoom: (r) => (guestRoom = r),
    });

    await flush(); // guest "hello" reaches host
    expect(hostRoom?.players.map((p) => p.name)).toEqual(["Alpha", "Bravo"]);
    expect(guestRoom?.players).toHaveLength(2);

    host.start(0);
    await flush();
    expect(hostView).not.toBeNull();
    expect(guestView).not.toBeNull();
    // At the start the two private hands cover the whole 40-card deck.
    expect(hostView!.handCounts.reduce((x, y) => x + y, 0)).toBe(40);

    // Drive the game: whoever's turn plays their first legal card. Bounded loop.
    for (let i = 0; i < 80 && hostView!.phase === "playing"; i++) {
      if (hostView!.turn === 0) {
        const c = hostView!.legalMoves[0];
        if (c) host.play(c);
      } else {
        const c = guestView!.legalMoves[0];
        if (c) guest.play(c);
      }
      await flush();
    }

    expect(["won", "lost"]).toContain(hostView!.phase);

    // Privacy: each side only ever holds (sees) its OWN cards.
    expect(hostView!.hand.length).toBe(hostView!.handCounts[0]);
    expect(guestView!.hand.length).toBe(guestView!.handCounts[1]);
    expect(guestView!.youSeat).toBe(1);
  });

  it("rejects an out-of-turn guest play with an error message", async () => {
    const { a, b } = createMemoryPair();
    let guestErr: string | null = null;
    let guestView: PlayerView | null = null;
    const host = new HostController("Host", { onHostView: () => {}, onRoom: () => {} }, mulberry32(9));
    host.attachGuest(a);
    const guest = new GuestController(b, "Two", {
      onView: (v) => (guestView = v),
      onRoom: () => {},
      onError: (m) => (guestErr = m),
    });
    await flush();
    host.start(0);
    await flush();

    // Force a guest play even if it's the host's turn → expect an error back.
    if (guestView!.turn !== 1) {
      guest.play(guestView!.hand[0]!);
      await flush();
      expect(guestErr).toBeTruthy();
    }
  });
});
