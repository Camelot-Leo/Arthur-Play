"use client";
import { io, type Socket } from "socket.io-client";
import { REALTIME_PATH } from "@arthur/shared";

/** URL del servizio realtime: vuoto = stesso dominio (produzione dietro reverse proxy). */
const REALTIME_URL = process.env.NEXT_PUBLIC_REALTIME_URL || undefined;

type Auth = Record<string, unknown> | ((cb: (data: object) => void) => void);

export function connectRealtime(auth: Auth): Socket {
  return io(REALTIME_URL as string, {
    path: REALTIME_PATH,
    auth: auth as never,
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
    timeout: 10_000,
  });
}

/** Ticket di 5 minuti per Regia/Proiezione, richiesto a ogni (ri)connessione. */
export function ticketAuth(sid: string, role: "control" | "projection") {
  return (cb: (data: object) => void) => {
    fetch(`/api/sessioni/${encodeURIComponent(sid)}/ticket?ruolo=${role === "projection" ? "proiezione" : "regia"}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { ticket?: string }) => cb({ role, ticket: d.ticket ?? "" }))
      .catch(() => cb({ role, ticket: "" }));
  };
}

export function emitAck<T>(socket: Socket, event: string, payload?: unknown): Promise<T> {
  return socket.timeout(8000).emitWithAck(event, payload) as Promise<T>;
}
