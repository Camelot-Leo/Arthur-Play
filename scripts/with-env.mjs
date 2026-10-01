#!/usr/bin/env node
/**
 * Carica il file .env della root (se esiste) e lancia il comando indicato.
 * Disattiva anche la telemetria di Next.js (nessun invio di dati a terzi).
 * Uso: node ../../scripts/with-env.mjs <comando> [argomenti...]
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const envFile = fileURLToPath(new URL("../.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);
process.env.NEXT_TELEMETRY_DISABLED = "1";

const [cmd, ...args] = process.argv.slice(2);
const child = spawn(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
child.on("exit", (code, signal) => (signal ? process.kill(process.pid, signal) : process.exit(code ?? 0)));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
