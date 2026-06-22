#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
E2E_DATA_DIR="$PROJECT_ROOT/e2e/data"
BACKEND_DIR="$PROJECT_ROOT/backend"
BIN_DIR="$PROJECT_ROOT/node_modules/.bin"

# Clean up
fuser -k 3000/tcp 2>/dev/null || true
fuser -k 5173/tcp 2>/dev/null || true
rm -rf "$E2E_DATA_DIR"
mkdir -p "$E2E_DATA_DIR"

# Write e2e .env (backup original)
if [ -f "$BACKEND_DIR/.env" ] && [ ! -f "$BACKEND_DIR/.env.bak" ]; then
  cp "$BACKEND_DIR/.env" "$BACKEND_DIR/.env.bak"
fi
cat > "$BACKEND_DIR/.env" << EOF
DATABASE_URL="file:$E2E_DATA_DIR/db.sqlite"
DATA_DIR="$E2E_DATA_DIR"
PORT=3000
NODE_ENV=development
EOF

# Run prisma migrations
cd "$BACKEND_DIR"
"$BIN_DIR/prisma" generate
"$BIN_DIR/prisma" migrate deploy

# Start both servers via npm run dev (uses concurrently)
echo "[e2e-servers] Starting backend + frontend via npm run dev…"
cd "$PROJECT_ROOT"
npm run dev &
DEV_PID=$!

# Wait for backend
for i in $(seq 1 60); do
  if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
    echo "[e2e-servers] Backend ready"
    break
  fi
  sleep 1
done

# Wait for frontend
for i in $(seq 1 60); do
  if curl -s http://localhost:5173 > /dev/null 2>&1; then
    echo "[e2e-servers] Frontend ready"
    break
  fi
  sleep 1
done

echo "[e2e-servers] Both servers running"

# Run the WDIO tests
cd "$PROJECT_ROOT/e2e"
npx wdio run wdio.conf.ts
EXIT_CODE=$?

# Cleanup
echo "[e2e-servers] Stopping servers…"
# Kill the npm run dev process group (concurrently + its children)
kill $DEV_PID 2>/dev/null || true
# Fallback: kill anything still on these ports
fuser -k 3000/tcp 2>/dev/null || true
fuser -k 5173/tcp 2>/dev/null || true

# Restore original .env
if [ -f "$BACKEND_DIR/.env.bak" ]; then
  mv "$BACKEND_DIR/.env.bak" "$BACKEND_DIR/.env"
fi

exit $EXIT_CODE
