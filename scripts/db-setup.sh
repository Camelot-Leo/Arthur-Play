#!/usr/bin/env bash
# Crea ruolo e database locali (sviluppo e test). Idempotente.
set -euo pipefail
run() { if command -v sudo >/dev/null; then sudo -u postgres psql -v ON_ERROR_STOP=1 -qtAc "$1"; else su postgres -c "psql -v ON_ERROR_STOP=1 -qtAc \"$1\""; fi; }
[ "$(run "SELECT 1 FROM pg_roles WHERE rolname='arthur'")" = "1" ] || run "CREATE ROLE arthur LOGIN PASSWORD 'arthur'"
for db in arthur_play arthur_play_test; do
  [ "$(run "SELECT 1 FROM pg_database WHERE datname='$db'")" = "1" ] || run "CREATE DATABASE $db OWNER arthur"
done
echo "Database pronti: arthur_play, arthur_play_test (utente arthur)."
