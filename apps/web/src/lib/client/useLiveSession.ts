"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { EV, type ActivityContent, type ControlInit, type ResultsMessage, type SessionState } from "@arthur/shared";
import { connectRealtime, emitAck, ticketAuth } from "./realtime";

export type LiveSession = {
  /** Invia un comando della Regia e attende la conferma. */
  send: (event: string, payload?: unknown) => Promise<{ ok: boolean } | null>;
  connected: boolean;
  ended: boolean;
  activity: ActivityContent | null;
  state: SessionState | null;
  code: string;
  participants: number;
  results: ResultsMessage | null;
};

/** Collegamento di Regia o Proiezione alla sessione (con ticket rinnovato a ogni riconnessione). */
export function useLiveSession(sid: string, role: "control" | "projection"): LiveSession {
  const socketRef = useRef<Socket | null>(null);
  const [s, setS] = useState<Omit<LiveSession, "send">>({
    connected: false,
    ended: false,
    activity: null,
    state: null,
    code: "",
    participants: 0,
    results: null,
  });

  useEffect(() => {
    const socket = connectRealtime(ticketAuth(sid, role));
    socketRef.current = socket;
    socket.on("connect", async () => {
      setS((p) => ({ ...p, connected: true }));
      const init = await emitAck<ControlInit>(socket, EV.init).catch(() => null);
      if (init?.ok) {
        setS((p) => ({ ...p, activity: init.activity, state: init.state, code: init.code, participants: init.participants }));
      } else if (init && !init.ok) {
        setS((p) => ({ ...p, ended: true }));
        socket.disconnect();
      }
    });
    socket.on("disconnect", () => setS((p) => ({ ...p, connected: false })));
    socket.on("connect_error", (err) => {
      if (err.message === "not_found" || err.message === "unauthorized") {
        setS((p) => ({ ...p, ended: true }));
        socket.disconnect();
      }
    });
    socket.on(EV.state, (state: SessionState) => setS((p) => ({ ...p, state, results: p.results?.slideId === state.slide.id ? p.results : null })));
    socket.on(EV.results, (results: ResultsMessage) => setS((p) => ({ ...p, results })));
    socket.on(EV.presence, ({ count }: { count: number }) => setS((p) => ({ ...p, participants: count })));
    socket.on(EV.ended, () => {
      setS((p) => ({ ...p, ended: true }));
      socket.disconnect();
    });
    return () => {
      socket.disconnect();
    };
  }, [sid, role]);

  const send = useCallback(async (event: string, payload?: unknown) => {
    const socket = socketRef.current;
    if (!socket?.connected) return null;
    return emitAck<{ ok: boolean }>(socket, event, payload).catch(() => null);
  }, []);

  return { ...s, send };
}
