#!/usr/bin/env bash
# Avvia PostgreSQL e Redis in locale (installazione nativa).
# Redis parte con infra/redis/redis.conf: nessuna persistenza su disco.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if command -v pg_ctlcluster >/dev/null; then
  pg_ctlcluster 16 main start 2>/dev/null || true
fi
if ! redis-cli ping >/dev/null 2>&1; then
  redis-server "$ROOT/infra/redis/redis.conf" --daemonize yes
fi
sleep 1
redis-cli ping
echo "Persistenza Redis (devono risultare vuoto e 'no'):"
redis-cli config get save
redis-cli config get appendonly
