import { createServer, type Server as HttpServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import express from "express";
import { Server } from "socket.io";
import {
  EV,
  projectForSeat,
  rankLeaderboard,
  type CreatePayload,
  type JoinPayload,
  type StartPayload,
  type PlayPayload,
  type CommunicatePayload,
  type JoinAck,
} from "@dsc/shared";
import { RoomManager, type Room } from "./rooms.js";
import { CampaignStore } from "./campaign.js";
import { HistoryStore } from "./history.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface GameServer {
  httpServer: HttpServer;
  io: Server;
  rooms: RoomManager;
  store: CampaignStore | null;
  history: HistoryStore | null;
}

/** Build the HTTP + Socket.IO server with all room/game handlers wired up. */
export function createGameServer(
  seed?: number,
  store?: CampaignStore | null,
  history?: HistoryStore | null
): GameServer {
  // `undefined` => default disk store; `null` => no persistence (tests).
  const campaignStore = store === undefined ? new CampaignStore() : store;
  const historyStore = history === undefined ? new HistoryStore() : history;

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

  const httpServer = createServer(app);
  const io = new Server(httpServer, { cors: { origin: "*" } });
  const rooms = new RoomManager(seed, campaignStore, historyStore);

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
        if (room) broadcastRoom(room);
        scheduleBots(code); // chain to the next bot turn, if any
      }
    }, 700);
  }

  function handleLeave(socketId: string): void {
    const m = membership.get(socketId);
    if (!m) return;
    membership.delete(socketId);
    rooms.disconnect(m.code, m.playerId);
    const room = rooms.getRoom(m.code);
    if (room) broadcastRoom(room);
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
      if (room) broadcastRoom(room);
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

    socket.on(EV.RoomLeave, () => handleLeave(socket.id));
    socket.on("disconnect", () => handleLeave(socket.id));
  });

  return { httpServer, io, rooms, store: campaignStore, history: historyStore };
}
