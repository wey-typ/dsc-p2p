import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { type AddressInfo } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { LeaderboardEntry } from "@dsc/shared";
import { CampaignStore } from "./campaign.js";
import { createGameServer, type GameServer } from "./gameServer.js";

let dir: string;
let server: GameServer;
let url: string;

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "dsc-lb-"));
  const store = new CampaignStore(dir);
  store.save({ id: "reef", name: "Reef Riders", level: 5, cleared: 5, attempts: 2, updatedAt: 0 });
  store.save({ id: "kelp", name: "Kelp Crew", level: 2, cleared: 2, attempts: 6, updatedAt: 0 });
  server = createGameServer(1, store);
  await new Promise<void>((r) => server.httpServer.listen(0, r));
  url = `http://localhost:${(server.httpServer.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.io.close();
  await new Promise<void>((r) => server.httpServer.close(() => r()));
  rmSync(dir, { recursive: true, force: true });
});

describe("GET /api/leaderboard", () => {
  it("returns ranked crews from the store", async () => {
    const res = await fetch(`${url}/api/leaderboard`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as LeaderboardEntry[];
    expect(data.map((e) => e.name)).toEqual(["Reef Riders", "Kelp Crew"]);
    expect(data[0]!.rank).toBe(1);
    expect(data[0]!.cleared).toBe(5);
  });
});
