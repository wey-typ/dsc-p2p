import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { type AddressInfo } from "node:net";
import { legalMovesFor, type GameRecord, type HistorySummary } from "@dsc/shared";
import { HistoryStore } from "./history.js";
import { RoomManager } from "./rooms.js";
import { createGameServer, type GameServer } from "./gameServer.js";

let dir: string;
let store: HistoryStore;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "dsc-hist-"));
  store = new HistoryStore(dir);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const REC: GameRecord = {
  id: "crew-1000",
  finishedAt: 1000,
  crewName: "Crew",
  missionName: "Mission 1 · Shallow Reef",
  level: 0,
  outcome: "won",
  players: [{ seat: 0, name: "A", isBot: false }],
  tricks: [{ leader: 0, plays: [{ seat: 0, card: { suit: "blue", value: 5 } }], winner: 0 }],
  tasks: [],
  communications: [],
};

describe("HistoryStore", () => {
  it("saves, gets, and summarises", () => {
    store.save(REC);
    expect(store.get("crew-1000")?.missionName).toBe("Mission 1 · Shallow Reef");
    const sums = store.listSummaries();
    expect(sums).toHaveLength(1);
    expect(sums[0]).toMatchObject({ id: "crew-1000", outcome: "won", tricks: 1 });
  });

  it("lists most-recent first", () => {
    store.save({ ...REC, id: "a", finishedAt: 1 });
    store.save({ ...REC, id: "b", finishedAt: 2 });
    expect(store.listSummaries().map((s) => s.id)).toEqual(["b", "a"]);
  });
});

describe("RoomManager records a finished game to history", () => {
  it("writes a GameRecord with the resolved tricks when a game ends", () => {
    const rm = new RoomManager(7, null, store);
    const { room } = rm.createRoom("Host", "Loggers");
    rm.joinRoom(room.code, "Two");
    rm.joinRoom(room.code, "Three");
    rm.startGame(room.code, 2, 4);
    let guard = 0;
    while (room.game!.phase === "playing" && guard++ < 200) {
      const seat = room.game!.turn;
      const player = room.players.find((p) => p.seat === seat)!;
      const legal = legalMovesFor(room.game!, seat);
      rm.play(room.code, player.id, legal[0]!);
    }
    const sums = store.listSummaries();
    expect(sums).toHaveLength(1);
    expect(sums[0]!.tricks).toBeGreaterThan(0);
    const full = store.get(sums[0]!.id)!;
    expect(full.tricks.length).toBe(sums[0]!.tricks);
    expect(full.players.map((p) => p.name)).toEqual(["Host", "Two", "Three"]);
  });
});

describe("GET /api/history endpoints", () => {
  let server: GameServer;
  let url: string;
  beforeEach(async () => {
    store.save(REC);
    server = createGameServer(1, null, store);
    await new Promise<void>((r) => server.httpServer.listen(0, r));
    url = `http://localhost:${(server.httpServer.address() as AddressInfo).port}`;
  });
  afterEach(async () => {
    server.io.close();
    await new Promise<void>((r) => server.httpServer.close(() => r()));
  });

  it("lists summaries and fetches a full record; 404 for unknown", async () => {
    const list = (await (await fetch(`${url}/api/history`)).json()) as HistorySummary[];
    expect(list.some((s) => s.id === "crew-1000")).toBe(true);
    const full = (await (await fetch(`${url}/api/history/crew-1000`)).json()) as GameRecord;
    expect(full.missionName).toBe("Mission 1 · Shallow Reef");
    expect((await fetch(`${url}/api/history/nope`)).status).toBe(404);
  });
});
