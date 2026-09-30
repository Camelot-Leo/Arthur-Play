import type { NextConfig } from "next";
import path from "node:path";

const isDev = process.env.NODE_ENV !== "production";

/** Origine del servizio realtime: vuota in produzione (stesso dominio via reverse proxy). */
const realtime = process.env.NEXT_PUBLIC_REALTIME_URL ?? "";
const realtimeWs = realtime.replace(/^http/, "ws");

/**
 * Content Security Policy: nessun dominio terzo. Script, stili, font, immagini e
 * connessioni solo dal dominio dell'app (e dal servizio realtime, stesso host).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${realtime ? ` ${realtime} ${realtimeWs}` : ""}`,
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@arthur/shared", "@arthur/db"],
  serverExternalPackages: ["ioredis", "postgres", "pino", "sharp", "nodemailer"],
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
        ],
      },
    ];
  },
};

export default config;
