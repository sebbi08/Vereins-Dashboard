#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "[e2e] Starting Docker services…"
docker compose -f "$PROJECT_ROOT/docker-compose.yml" up -d --wait

echo "[e2e] Running tests…"
cd "$PROJECT_ROOT/e2e"
npx wdio run wdio.conf.ts
EXIT_CODE=$?

echo "[e2e] Stopping Docker services…"
docker compose -f "$PROJECT_ROOT/docker-compose.yml" down

exit $EXIT_CODE
