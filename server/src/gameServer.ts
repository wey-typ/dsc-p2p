import { createServer, type Server as HttpServer } from "node:http";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { networkInterfaces } from "node:os";
import path from "node:path";
import express from "express";
import { Server } from "socket.io";
import {
  EV,
  projectForSeat,
  rankLeaderboard,
  trainWeights,
  type EvalOptions,
  type CreatePayload,
  type JoinPayload,
  type RejoinPayload,
  type StartPayload,
  type PlayPayload,
  type CommunicatePayload,
  type DistressPayload,
  type DistressPickPayload,
  type SetLevelPayload,
  type SetExtensionPayload,
  type KickPayload,
  type JoinAck,
} from "@dsc/shared";
import { RoomManager, type Room } from "./rooms.js";
import { CampaignStore } from "./campaign.js";
import { HistoryStore } from "./history.js";
import { BotLab } from "./botlab.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface GameServer {
  httpServer: HttpServer;
  io: Server;
  rooms: RoomManager;
  store: CampaignStore | null;
  history: HistoryStore | null;
  botLab: BotLab | null;
}

/** Build the HTTP + Socket.IO server with all room/game handlers wired up. */
export function createGameServer(
  seed?: number,
  store?: CampaignStore | null,
  history?: HistoryStore | null,
  botLab?: BotLab | null
): GameServer {
  // `undefined` => default disk store; `null` => no persistence (tests).
  const campaignStore = store === undefined ? new CampaignStore() : store;
  const historyStore = history === undefined ? new HistoryStore() : history;
  const lab = botLab === undefined ? new BotLab() : botLab;

  const app = express();
  const clientDist = path.resolve(__dirname, "../../client/dist");
  app.use(express.static(clientDist));
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.get("/api/leaderboard", (_req, res) => {
    const records = campaignStore ? campaignStore.list() : [];
    res.json(rankLeaderboard(records));
  });
  app.get("/api/history", (_req, res) => {
    res.json(historyStore ? historyStore.listSummaries() : []);
  });
  app.get("/api/history/:id", (req, res) => {
    const rec = historyStore?.get(req.params.id);
    if (!rec) return res.status(404).json({ error: "Not found" });
    res.json(rec);
  });
  // Best LAN base URL for sharing (QR / link). Uses the server's real Wi-Fi address +
  // the port the request came in on, so phones on the same network can reach it.
  app.get("/api/lan", (req, res) => {
    const port = req.socket.localPort ?? 3000;
    const virtual = /^(utun|ipsec|ppp|tun|tap|awdl|llw|bridge|vboxnet|vmnet|docker|veth)/i;
    let ip: string | null = null;
    for (const [name, addrs] of Object.entries(networkInterfaces())) {
      if (virtual.test(name)) continue;
      for (const a of addrs ?? []) {
        if (a.family === "IPv4" && !a.internal) {
          ip = a.address;
          break;
        }
      }
      if (ip) break;
    }
    const host = ip ?? req.hostname ?? "localhost";
    res.json({ baseUrl: `http://${host}:${port}`, ip });
  });
  app.get("/api/bot-stats", (_req, res) => {
    res.json(lab ? lab.stats() : { weights: null, totalRuns: 0, bestWinRate: 0, latestWinRate: null, recent: [] });
  });
  // The latest generated bot campaign report (run `npm run bot-report`).
  app.get("/bot-report", (_req, res) => {
    const file = path.resolve(__dirname, "../../data/reports/bot-report.html");
    if (!existsSync(file)) {
      return res
        .status(404)
        .send("<p>No bot report yet. Run <code>npm run bot-report</code> first.</p>");
    }
    res.sendFile(file);
  });
  app.get("/win-report", (_req, res) => {
    const file = path.resolve(__dirname, "../../data/reports/win-report.html");
    if (!existsSync(file)) {
      return res
        .status(404)
        .send("<p>No win report yet. Run <code>npm run win-report</code> first.</p>");
    }
    res.sendFile(file);
  });

  const httpServer = createServer(app);
  const io = new Server(httpServer, { cors: { origin: "*" } });
  const rooms = new RoomManager(
    seed,
    campaignStore,
    historyStore,
    lab ? () => lab.current() : undefined
  );

  // --- "Get better after each play": a small guarded self-play training step that runs
  // in the background whenever a game involving bots finishes. ---
  let autoTraining = false;
  let lastAutoTrainAt = 0;
  function maybeAutoTrain(room: Room): void {
    if (!lab || room.phase === "playing" || room.paused) return;
    if (!room.players.some((p) => p.isBot)) return;
    const now = Date.now();
    if (autoTraining || now - lastAutoTrainAt < 1500) return;
    autoTraining = true;
    lastAutoTrainAt = now;
    setTimeout(() => {
      try {
        const fast: EvalOptions = { players: [3], levels: [0, 1], gamesPerCell: 8, seedBase: now & 0xffff };
        const res = trainWeights(lab.current(), 3, fast, now & 0xffffffff);
        if (res.bestWinRate >= res.startWinRate) lab.setWeights(res.best);
        lab.appendRun({
          at: Date.now(),
          source: "auto",
          generations: 3,
          startWinRate: res.startWinRate,
          bestWinRate: res.bestWinRate,
          weights: lab.current(),
        });
      } catch {
        /* training is best-effort; never crash a game */
      } finally {
        autoTraining = false;
      }
    }, 50);
  }

  /** socket.id -> { code, playerId } for routing plays and cleanup. */
  const membership = new Map<string, { code: string; playerId: string }>();

  function socketIdFor(code: string, playerId: string): string | undefined {
    for (const [sid, m] of membership) {
      if (m.code === code && m.playerId === playerId) return sid;
    }
    return undefined;
  }

  function broadcastRoom(room: Room): void {
    io.to(room.code).emit(EV.RoomState, rooms.toRoomView(room));
    if (room.game) {
      for (const p of room.players) {
        const sid = socketIdFor(room.code, p.id);
        if (sid) io.to(sid).emit(EV.GameView, projectForSeat(room.game, p.seat));
      }
    }
  }

  /** Run a host-only room action, then rebroadcast. Non-hosts are ignored. */
  function hostAction(
    socketId: string,
    fn: (code: string) => { ok: true } | { error: string }
  ): void {
    const m = membership.get(socketId);
    if (!m) return;
    const room = rooms.getRoom(m.code);
    if (!room || room.hostId !== m.playerId) return;
    fn(m.code);
    const updated = rooms.getRoom(m.code);
    if (updated) {
      broadcastRoom(updated);
      scheduleBots(m.code);
    }
  }

  /** While it's a bot's turn, play one move per ~700ms tick, broadcasting each step. */
  function scheduleBots(code: string): void {
    if (!rooms.isBotTurn(code)) return;
    setTimeout(() => {
      if (rooms.playBotTurn(code)) {
        const room = rooms.getRoom(code);
        if (room) {
          broadcastRoom(room);
          maybeAutoTrain(room);
        }
        scheduleBots(code); // chain to the next bot turn, if any
      }
    }, 700);
  }

  function handleLeave(socketId: string): void {
    const m = membership.get(socketId);
    if (!m) return;
    membership.delete(socketId);
    const room = rooms.getRoom(m.code);
    // In the lobby, fully remove the seat; mid-game, just mark disconnected so the
    // player can reconnect to their hand.
    if (room && room.phase === "lobby") rooms.removePlayer(m.code, m.playerId);
    else rooms.disconnect(m.code, m.playerId);
    const updated = rooms.getRoom(m.code);
    if (updated) broadcastRoom(updated);
  }

  io.on("connection", (socket) => {
    socket.on(EV.RoomCreate, (payload: CreatePayload, ack?: (a: JoinAck) => void) => {
      const { room, player } = rooms.createRoom(payload?.name ?? "", payload?.crewName);
      socket.join(room.code);
      membership.set(socket.id, { code: room.code, playerId: player.id });
      ack?.({ ok: true, code: room.code, youId: player.id, seat: player.seat });
      broadcastRoom(room);
    });

    socket.on(EV.RoomJoin, (payload: JoinPayload, ack?: (a: JoinAck) => void) => {
      const res = rooms.joinRoom(payload?.code ?? "", payload?.name ?? "");
      if ("error" in res) return ack?.({ ok: false, error: res.error });
      socket.join(res.room.code);
      membership.set(socket.id, { code: res.room.code, playerId: res.player.id });
      ack?.({ ok: true, code: res.room.code, youId: res.player.id, seat: res.player.seat });
      broadcastRoom(res.room);
    });

    socket.on(EV.RoomRejoin, (payload: RejoinPayload, ack?: (a: JoinAck) => void) => {
      const res = rooms.rejoin(payload?.code ?? "", payload?.playerId ?? "");
      if ("error" in res) return ack?.({ ok: false, error: res.error });
      socket.join(res.room.code);
      membership.set(socket.id, { code: res.room.code, playerId: res.player.id });
      ack?.({ ok: true, code: res.room.code, youId: res.player.id, seat: res.player.seat });
      broadcastRoom(res.room);
    });

    socket.on(EV.GameStart, (payload: StartPayload) => {
      const m = membership.get(socket.id);
      if (!m) return;
      const room0 = rooms.getRoom(m.code);
      if (!room0 || room0.hostId !== m.playerId) return; // host only
      const res = rooms.startGame(m.code, payload?.taskCount);
      if ("error" in res) return socket.emit(EV.ErrorMsg, { message: res.error });
      const room = rooms.getRoom(m.code);
      if (room) broadcastRoom(room);
      scheduleBots(m.code); // commander may be a bot
    });

    socket.on(EV.RoomAddBot, () => hostAction(socket.id, (code) => rooms.addBot(code)));
    socket.on(EV.RoomRemoveBot, () => hostAction(socket.id, (code) => rooms.removeBot(code)));
    socket.on(EV.RoomSetLevel, (payload: SetLevelPayload) =>
      hostAction(socket.id, (code) => rooms.setLevel(code, payload?.level ?? 0))
    );
    socket.on(EV.RoomSetExtension, (payload: SetExtensionPayload) =>
      hostAction(socket.id, (code) => rooms.setExtension(code, payload?.extension === true))
    );

    socket.on(EV.GameRestart, () => hostAction(socket.id, (code) => rooms.restart(code)));
    socket.on(EV.GameEnd, () => hostAction(socket.id, (code) => rooms.endGame(code)));
    socket.on(EV.GamePause, () => hostAction(socket.id, (code) => rooms.pause(code)));
    socket.on(EV.GameResume, () => hostAction(socket.id, (code) => rooms.resume(code)));

    socket.on(EV.GamePlay, (payload: PlayPayload) => {
      const m = membership.get(socket.id);
      if (!m) return;
      const res = rooms.play(m.code, m.playerId, payload.card);
      if ("error" in res) return socket.emit(EV.ErrorMsg, { message: res.error });
      const room = rooms.getRoom(m.code);
      if (room) {
        broadcastRoom(room);
        maybeAutoTrain(room);
      }
      scheduleBots(m.code); // next seat may be a bot
    });

    socket.on(EV.GameCommunicate, (payload: CommunicatePayload) => {
      const m = membership.get(socket.id);
      if (!m) return;
      const res = rooms.communicate(m.code, m.playerId, payload.card);
      if ("error" in res) return socket.emit(EV.ErrorMsg, { message: res.error });
      const room = rooms.getRoom(m.code);
      if (room) broadcastRoom(room);
    });

    socket.on(EV.GameDistress, (payload: DistressPayload) => {
      const m = membership.get(socket.id);
      if (!m) return;
      const dir = payload?.direction === "right" ? "right" : "left";
      const res = rooms.distress(m.code, m.playerId, dir);
      if ("error" in res) return socket.emit(EV.ErrorMsg, { message: res.error });
      const room = rooms.getRoom(m.code);
      if (room) broadcastRoom(room);
      scheduleBots(m.code); // all-bot crews finish passing instantly
    });

    socket.on(EV.GameDistressPick, (payload: DistressPickPayload) => {
      const m = membership.get(socket.id);
      if (!m) return;
      const res = rooms.distressPick(m.code, m.playerId, payload.card);
      if ("error" in res) return socket.emit(EV.ErrorMsg, { message: res.error });
      const room = rooms.getRoom(m.code);
      if (room) broadcastRoom(room);
      scheduleBots(m.code); // play resumes once the last pass lands
    });

    socket.on(EV.RoomKick, (payload: KickPayload) => {
      const m = membership.get(socket.id);
      if (!m) return;
      const res = rooms.kick(m.code, m.playerId, payload?.playerId ?? "");
      if ("error" in res) return socket.emit(EV.ErrorMsg, { message: res.error });
      const sid = socketIdFor(m.code, payload.playerId);
      if (sid) {
        io.to(sid).emit(EV.Kicked, { message: "The host removed you from the room." });
        io.sockets.sockets.get(sid)?.leave(m.code);
        membership.delete(sid);
      }
      const room = rooms.getRoom(m.code);
      if (room) broadcastRoom(room);
    });

    socket.on(EV.RoomLeave, () => handleLeave(socket.id));
    socket.on("disconnect", () => handleLeave(socket.id));
  });

  // Periodically clean up rooms that stayed empty past the reconnect grace period.
  const sweep = setInterval(() => rooms.sweepEmptyRooms(), 30000);
  sweep.unref?.(); // don't keep the process (or tests) alive
  io.on("close", () => clearInterval(sweep));

  return { httpServer, io, rooms, store: campaignStore, history: historyStore, botLab: lab };
}
