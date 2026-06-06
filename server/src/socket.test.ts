import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { type AddressInfo } from "node:net";
import { io as ioc, type Socket as ClientSocket } from "socket.io-client";
import {
  EV,
  type RoomView,
  type PlayerView,
  type JoinAck,
} from "@dsc/shared";
import { createGameServer, type GameServer } from "./gameServer.js";

let server: GameServer;
let url: string;

beforeAll(async () => {
  server = createGameServer(99, null, null);
  await new Promise<void>((resolve) => server.httpServer.listen(0, resolve));
  const port = (server.httpServer.address() as AddressInfo).port;
  url = `http://localhost:${port}`;
});

afterAll(async () => {
  server.io.close();
  await new Promise<void>((resolve) => server.httpServer.close(() => resolve()));
});

function connect(): ClientSocket {
  return ioc(url, { transports: ["websocket"], forceNew: true });
}

function emitAck(sock: ClientSocket, ev: string, payload: unknown): Promise<JoinAck> {
  return new Promise((resolve) => sock.emit(ev, payload, (ack: JoinAck) => resolve(ack)));
}

/** Wait until the next GameView for this socket satisfies `pred`. */
function nextView(sock: ClientSocket, pred: (v: PlayerView) => boolean): Promise<PlayerView> {
  return new Promise((resolve) => {
    const handler = (v: PlayerView) => {
      if (pred(v)) {
        sock.off(EV.GameView, handler);
        resolve(v);
      }
    };
    sock.on(EV.GameView, handler);
  });
}

describe("socket integration: full game over the wire", () => {
  it("3 players join, start, and play a real game to a terminal state", async () => {
    const a = connect();
    const b = connect();
    const c = connect();
    await Promise.all([
      new Promise<void>((r) => a.on("connect", () => r())),
      new Promise<void>((r) => b.on("connect", () => r())),
      new Promise<void>((r) => c.on("connect", () => r())),
    ]);

    // Track latest views + terminal phase per client.
    const latest = new Map<ClientSocket, PlayerView>();
    let terminal: PlayerView | null = null;
    for (const s of [a, b, c]) {
      s.on(EV.GameView, (v: PlayerView) => {
        latest.set(s, v);
        if (v.phase !== "playing") terminal = v;
      });
    }

    // Create + join.
    const ackA = await emitAck(a, EV.RoomCreate, { name: "Alpha" });
    expect(ackA.ok).toBe(true);
    const code = ackA.code!;
    const ackB = await emitAck(b, EV.RoomJoin, { code, name: "Bravo" });
    const ackC = await emitAck(c, EV.RoomJoin, { code, name: "Charlie" });
    expect(ackB.ok && ackC.ok).toBe(true);

    // Wait for the room to show 3 players, then start.
    await new Promise<void>((resolve) => {
      a.on(EV.RoomState, (r: RoomView) => {
        if (r.players.length === 3) resolve();
      });
    });

    const sockets = [a, b, c];
    const firstViews = Promise.all(sockets.map((s) => nextView(s, () => true)));
    a.emit(EV.GameStart, { taskCount: 2 });
    await firstViews;

    // Each client only ever sees its own hand contents; counts cover all 40 cards.
    for (const s of sockets) {
      const v = latest.get(s)!;
      expect(v.hand.length).toBe(v.handCounts[v.youSeat]);
      expect(v.handCounts.reduce((x, y) => x + y, 0)).toBe(40);
    }

    // Drive the game: find whichever client currently holds legal moves (the active
    // seat) and play its first legal card. Selecting by legalMoves — rather than by a
    // possibly-stale `turn` field on one client — avoids cross-client view races.
    for (let guard = 0; guard < 200 && !terminal; guard++) {
      const actor = sockets.find((s) => {
        const v = latest.get(s);
        return v && v.phase === "playing" && v.turn === v.youSeat && v.legalMoves.length > 0;
      });
      if (!actor) {
        await new Promise((r) => setTimeout(r, 5)); // let an in-flight broadcast land
        continue;
      }
      const v = latest.get(actor)!;
      const before = v.trick.plays.length;
      const played = nextView(
        actor,
        (nv) => nv.phase !== "playing" || nv.trick.plays.length !== before
      );
      actor.emit(EV.GamePlay, { card: v.legalMoves[0]! });
      await played;
    }

    expect(terminal).not.toBeNull();
    expect(["won", "lost"]).toContain(terminal!.phase);

    a.disconnect();
    b.disconnect();
    c.disconnect();
  }, 15000);
});
