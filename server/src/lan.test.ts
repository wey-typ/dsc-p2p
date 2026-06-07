import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { type AddressInfo } from "node:net";
import { createGameServer, type GameServer } from "./gameServer.js";

let server: GameServer;
let url: string;

beforeAll(async () => {
  server = createGameServer(1, null, null, null);
  await new Promise<void>((r) => server.httpServer.listen(0, r));
  url = `http://localhost:${(server.httpServer.address() as AddressInfo).port}`;
});
afterAll(async () => {
  server.io.close();
  await new Promise<void>((r) => server.httpServer.close(() => r()));
});

describe("GET /api/lan", () => {
  it("returns a shareable base URL with the listening port", async () => {
    const res = await fetch(`${url}/api/lan`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { baseUrl: string; ip: string | null };
    expect(data.baseUrl).toMatch(/^http:\/\/.+:\d+$/);
  });
});
