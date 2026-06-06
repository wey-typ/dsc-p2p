import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { networkInterfaces } from "node:os";
import express from "express";
import { Server } from "socket.io";
import {
  EV,
  projectForSeat,
  type CreatePayload,
  type JoinPayload,
  type StartPayload,
  type PlayPayload,
  type JoinAck,
} from "@dsc/shared";
import { RoomManager, type Room } from "./rooms.js";

const PORT = Number(process.env.PORT ?? 3000);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
// Serve the built client if present (client build lands here in a later cycle).
const clientDist = path.resolve(__dirname, "../../client/dist");
app.use(express.static(clientDist));
app.get("/health", (_req, res) => res.json({ ok: true }));

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });
const rooms = new RoomManager();

/** socket.id -> { code, playerId } so we can route plays and clean up on disconnect. */
const membership = new Map<string, { code: string; playerId: string }>();

function broadcastRoom(room: Room): void {
  io.to(room.code).emit(EV.RoomState, rooms.toRoomView(room));
  if (room.game) {
    for (const p of room.players) {
      io.to(socketIdFor(room.code, p.id) ?? "").emit(
        EV.GameView,
        projectForSeat(room.game, p.seat)
      );
    }
  }
}

/** Reverse lookup: find the socket id for a given (code, playerId). */
function socketIdFor(code: string, playerId: string): string | undefined {
  for (const [sid, m] of membership) {
    if (m.code === code && m.playerId === playerId) return sid;
  }
  return undefined;
}

io.on("connection", (socket) => {
  socket.on(EV.RoomCreate, (payload: CreatePayload, ack?: (a: JoinAck) => void) => {
    const { room, player } = rooms.createRoom(payload?.name ?? "");
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
    const res = rooms.startGame(m.code, payload?.taskCount);
    if ("error" in res) return socket.emit(EV.ErrorMsg, { message: res.error });
    const room = rooms.getRoom(m.code);
    if (room) broadcastRoom(room);
  });

  socket.on(EV.GameRestart, () => {
    const m = membership.get(socket.id);
    if (!m) return;
    rooms.restart(m.code);
    const room = rooms.getRoom(m.code);
    if (room) broadcastRoom(room);
  });

  socket.on(EV.GamePlay, (payload: PlayPayload) => {
    const m = membership.get(socket.id);
    if (!m) return;
    const res = rooms.play(m.code, m.playerId, payload.card);
    if ("error" in res) return socket.emit(EV.ErrorMsg, { message: res.error });
    const room = rooms.getRoom(m.code);
    if (room) broadcastRoom(room);
  });

  socket.on(EV.RoomLeave, () => handleLeave(socket.id));
  socket.on("disconnect", () => handleLeave(socket.id));
});

function handleLeave(socketId: string): void {
  const m = membership.get(socketId);
  if (!m) return;
  membership.delete(socketId);
  rooms.disconnect(m.code, m.playerId);
  const room = rooms.getRoom(m.code);
  if (room) broadcastRoom(room);
}

httpServer.listen(PORT, () => {
  const ips = lanAddresses();
  console.log(`\n🌊 Deep Sea Crew server on port ${PORT}`);
  console.log(`   Local:   http://localhost:${PORT}`);
  for (const ip of ips) console.log(`   On Wi-Fi: http://${ip}:${PORT}  <- open this on phones`);
  console.log("");
});

function lanAddresses(): string[] {
  const out: string[] = [];
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === "IPv4" && !a.internal) out.push(a.address);
    }
  }
  return out;
}
