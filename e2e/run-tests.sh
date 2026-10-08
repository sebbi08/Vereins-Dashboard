#!/usr/bin/env bash
# Runs the e2e suite against the local docker-compose stack.
# WARNING: every spec resets that stack's data (dev-data) via POST /api/e2e/reset.
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

stop_services() {
  echo "[e2e] Stopping Docker services…"
  docker compose -f "$PROJECT_ROOT/docker-compose.yml" down
}

echo "[e2e] Starting Docker services…"
docker compose -f "$PROJECT_ROOT/docker-compose.yml" up -d --wait
# Stop the stack however the run ends; the script exits with wdio's exit code
trap stop_services EXIT

echo "[e2e] Running tests…"
cd "$PROJECT_ROOT/e2e"
npx wdio run wdio.conf.ts
