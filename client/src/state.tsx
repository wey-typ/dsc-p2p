import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  EV,
  type RoomView,
  type PlayerView,
  type Card,
  type JoinAck,
} from "@dsc/shared";

interface GameContextValue {
  connected: boolean;
  room: RoomView | null;
  view: PlayerView | null;
  youId: string | null;
  error: string | null;
  clearError: () => void;
  createRoom: (name: string, crewName?: string) => Promise<JoinAck>;
  joinRoom: (code: string, name: string) => Promise<JoinAck>;
  startGame: (taskCount?: number) => void;
  addBot: () => void;
  removeBot: () => void;
  kick: (playerId: string) => void;
  setLevel: (level: number) => void;
  restart: () => void;
  pause: () => void;
  resume: () => void;
  endGame: () => void;
  play: (card: Card) => void;
  communicate: (card: Card) => void;
  leave: () => void;
}

const Ctx = createContext<GameContextValue | null>(null);

// Same-origin in production (server serves the client); Vite proxies /socket.io in dev.
function makeSocket(): Socket {
  return io({ autoConnect: true, transports: ["websocket", "polling"] });
}

// --- Reconnect session (remembered on this device so a dropped player can rejoin) ---
const SESSION_KEY = "dsc.session";
interface Session {
  code: string;
  playerId: string;
}
function saveSession(s: Session): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}
function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function GameProvider({ children }: { children: React.ReactNode }) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [view, setView] = useState<PlayerView | null>(null);
  const [youId, setYouId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const socket = makeSocket();
    socketRef.current = socket;
    socket.on("connect", () => {
      setConnected(true);
      // If this device has a saved session, try to re-attach to that seat seamlessly.
      const s = loadSession();
      if (s?.code && s?.playerId) {
        socket.emit(EV.RoomRejoin, s, (ack: JoinAck) => {
          if (ack?.ok) {
            if (ack.youId) setYouId(ack.youId);
          } else {
            clearSession();
            setRoom(null);
            setView(null);
            setYouId(null);
          }
        });
      }
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on(EV.RoomState, (r: RoomView) => setRoom(r));
    socket.on(EV.GameView, (v: PlayerView) => setView(v));
    socket.on(EV.ErrorMsg, (e: { message: string }) => setError(e.message));
    socket.on(EV.Kicked, (e: { message?: string }) => {
      clearSession();
      setRoom(null);
      setView(null);
      setYouId(null);
      setError(e?.message ?? "You were removed from the room.");
    });
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, []);

  const value = useMemo<GameContextValue>(() => {
    const s = () => socketRef.current!;
    const emitWithAck = (event: string, payload: unknown) =>
      new Promise<JoinAck>((resolve) => {
        s().emit(event, payload, (ack: JoinAck) => {
          if (ack?.youId) setYouId(ack.youId);
          if (ack?.ok && ack.code && ack.youId) saveSession({ code: ack.code, playerId: ack.youId });
          if (ack && !ack.ok && ack.error) setError(ack.error);
          resolve(ack);
        });
      });
    return {
      connected,
      room,
      view,
      youId,
      error,
      clearError: () => setError(null),
      createRoom: (name, crewName) => emitWithAck(EV.RoomCreate, { name, crewName }),
      joinRoom: (code, name) => emitWithAck(EV.RoomJoin, { code: code.toUpperCase(), name }),
      startGame: (taskCount) => s().emit(EV.GameStart, { taskCount }),
      addBot: () => s().emit(EV.RoomAddBot, {}),
      removeBot: () => s().emit(EV.RoomRemoveBot, {}),
      kick: (playerId) => s().emit(EV.RoomKick, { playerId }),
      setLevel: (level) => s().emit(EV.RoomSetLevel, { level }),
      restart: () => {
        setView(null);
        s().emit(EV.GameRestart, {});
      },
      pause: () => s().emit(EV.GamePause, {}),
      resume: () => s().emit(EV.GameResume, {}),
      endGame: () => {
        setView(null);
        s().emit(EV.GameEnd, {});
      },
      play: (card) => s().emit(EV.GamePlay, { card }),
      communicate: (card) => s().emit(EV.GameCommunicate, { card }),
      leave: () => {
        clearSession(); // intentional leave — don't auto-rejoin next time
        s().emit(EV.RoomLeave, {});
        setRoom(null);
        setView(null);
        setYouId(null);
      },
    };
  }, [connected, room, view, youId, error]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGame(): GameContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useGame must be used within GameProvider");
  return v;
}
