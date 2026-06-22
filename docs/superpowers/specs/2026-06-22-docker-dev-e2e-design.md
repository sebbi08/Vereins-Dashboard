# Docker Dev Environment & E2E Integration — Design

## Goal

Provide a Docker Compose-based development environment with hot-reload, and make e2e tests run against it (script manages Docker lifecycle).

## Architecture

```
 Host (Ubuntu/WSL)
 ┌─────────────────────────────────────────────┐
 │  ./ (project root) ──bind mount──▶ /app     │
 │  ├── node_modules/    (shared, host-native) │
 │  ├── backend/src/     (hot-reload via tsx)  │
 │  ├── frontend/src/    (HMR via Vite)        │
 │  └── dev-data/        (SQLite, templates)   │
 │                                             │
 │  localhost:5173 ───▶ frontend container     │
 │       │                Vite proxy /api ──▶ backend:3000
 │                                             │
 │  e2e (WDIO) ───▶ localhost:5173             │
 │  run-tests.sh:                              │
 │    1. docker compose up -d --wait           │
 │    2. npx wdio run                          │
 │    3. docker compose down                   │
 └─────────────────────────────────────────────┘
```

## Files to Create/Modify

### New: `Dockerfile.dev`

- Base: `node:22-slim` (Debian glibc — compatible with host-native modules like better-sqlite3)
- `apt-get install libreoffice curl` (LibreOffice for DOCX→PDF, curl for healthchecks)
- No COPY, no RUN npm install — everything comes from host bind-mounts
- Default CMD: `sleep infinity` (overridden in compose)

### New: `docker-compose.yml`

Two services:

| Service  | Port | Command                            | Key env vars                                                          |
| -------- | ---- | ---------------------------------- | --------------------------------------------------------------------- |
| backend  | 3000 | `npm run dev --workspace=backend`  | `DATABASE_URL=file:/app/dev-data/db.sqlite`, `DATA_DIR=/app/dev-data` |
| frontend | 5173 | `npm run dev --workspace=frontend` | `VITE_API_TARGET=http://backend:3000`                                 |

Both:

- `build: { context: ., dockerfile: Dockerfile.dev }`
- `volumes: [.:/app]` — entire project, including node_modules
- Healthchecks: `curl -f http://localhost:<port>/...`
- frontend `depends_on: backend`

Named volume: none. Database persists in `./dev-data/` on host.

### New: `.dockerignore`

```
.git
node_modules/.cache
dev-data
e2e/.browser-cache
```

### Modified: `e2e/wdio.conf.ts`

- Replace hardcoded URLs with env vars:
  ```ts
  const BACKEND_URL = process.env.E2E_BACKEND_URL ?? 'http://localhost:3000';
  const FRONTEND_URL = process.env.E2E_FRONTEND_URL ?? 'http://localhost:5173';
  ```
- Everything else unchanged.

### Modified: `e2e/run-tests.sh`

Replace the current script (which manually starts servers, writes .env, runs migrations) with:

```bash
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
```

## Key Design Decisions

1. **node:22-slim (not Alpine):** better-sqlite3 is a native module compiled on the host (glibc). Using Alpine (musl) would cause binary incompatibility. slim matches host glibc.

2. **Bind-mount everything (including node_modules):** Adding a dependency is just `npm install` on the host — instantly visible in containers. No rebuild needed.

3. **No named volumes for node_modules:** Avoids the "works on host, doesn't work in container" problem where host and container have different node_modules.

4. **E2E script manages Docker lifecycle:** `docker compose up -d --wait` starts services and waits for healthchecks. `docker compose down` always runs (even on test failure, via `EXIT_CODE`).

5. **Database in ./dev-data/:** Persists across container restarts. Not tracked in git (.gitignore already covers it via existing patterns).

## What Does NOT Change

- Frontend Vite config — already supports `VITE_API_TARGET` env var
- Backend config — already supports `DATABASE_URL`, `DATA_DIR`, `PORT` env vars
- Prisma schema, migrations, init logic
- E2E test specs
- WDIO Chrome/ChromeDriver download logic (still runs on host)
- Production Dockerfile
