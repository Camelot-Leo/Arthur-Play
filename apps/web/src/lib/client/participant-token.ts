"use client";
import { participantCookieName } from "@arthur/shared";

/**
 * Token tecnico del partecipante (vincolo 4): casuale, generato dal server, salvato in un
 * cookie tecnico legato al codice della sessione. Scade con la sessione.
 * Non contiene e non deriva da dati del dispositivo o della rete.
 */
export function readToken(code: string): string | null {
  const name = `${participantCookieName(code)}=`;
  for (const part of document.cookie.split("; ")) if (part.startsWith(name)) return decodeURIComponent(part.slice(name.length));
  return null;
}

export function saveToken(code: string, token: string, expiresAt: number) {
  const maxAge = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${participantCookieName(code)}=${encodeURIComponent(token)}; Max-Age=${maxAge}; Path=/; SameSite=Strict${secure}`;
}

export function clearToken(code: string) {
  document.cookie = `${participantCookieName(code)}=; Max-Age=0; Path=/; SameSite=Strict`;
}
