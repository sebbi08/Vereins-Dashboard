# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files for all workspaces
COPY package*.json ./
COPY frontend/package*.json ./frontend/
COPY backend/package*.json ./backend/
COPY shared/package*.json ./shared/

RUN npm ci

# Copy source and build
COPY . .

ARG VERSION
ENV VITE_APP_VERSION=${VERSION}
ARG PRIMEUI_LICENSE
ENV VITE_PRIMEUI_LICENSE=${PRIMEUI_LICENSE}

RUN npm run build

# Production stage
FROM node:22-alpine

# LibreOffice renders DOCX templates to PDF. Liberation (Arial, Times New Roman, Courier New)
# and Carlito (Calibri) are metric-compatible with the fonts the templates use, so line and
# page breaks match what was laid out in Word. tzdata lets TZ below take effect.
RUN apk add --no-cache libreoffice ttf-freefont font-liberation font-carlito tzdata

# Dates such as "today" on documents and the year of a new invoice number follow the club's
# local day, not UTC.
ENV TZ=Europe/Berlin
ENV NODE_ENV=production

WORKDIR /app

# Copy root/workspace manifests so npm can use the monorepo lockfile in runtime stage
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/frontend/package*.json ./frontend/
COPY --from=builder /app/backend/package*.json ./backend/
COPY --from=builder /app/shared/package*.json ./shared/

# Install runtime dependencies only (the Prisma CLI is one, for deploy-time migrations).
# Remove prepare script so husky doesn't run (not available in production)
# --ignore-scripts would also skip @prisma/client postinstall, so we target only prepare
RUN npm pkg delete scripts.prepare && npm ci --workspace=backend --omit=dev

# Copy backend build and its dependencies
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/prisma ./backend/prisma
COPY --from=builder /app/backend/prisma.config.ts ./backend/prisma.config.ts

# Copy frontend build
COPY --from=builder /app/frontend/dist ./frontend/dist

# Make frontend assets available at the path resolved by backend dist code
RUN mkdir -p /app/backend/dist \
	&& ln -s /app/frontend /app/backend/dist/frontend

# Data directory (database, templates, generated PDFs); mount a volume here
RUN mkdir -p /app/data
VOLUME /app/data

EXPOSE 3000

ENV DATABASE_URL="file:/app/data/db.sqlite"
ENV PORT=3000
ENV DATA_DIR=/app/data

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
	CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1

# Before migrating, keep a copy of the database as it was (overwritten on every start), so a
# failed migration never leaves the only copy half-migrated.
CMD ["sh", "-lc", "if [ -f /app/data/db.sqlite ]; then cp /app/data/db.sqlite /app/data/db.sqlite.before-migrate; fi && cd /app/backend && npx prisma migrate deploy && cd /app && node backend/dist/backend/src/index.js"]
