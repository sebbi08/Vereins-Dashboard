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

RUN npm run build

# Production stage
FROM node:22-alpine

# Install LibreOffice for DOCX → PDF conversion
RUN apk add --no-cache libreoffice ttf-freefont

WORKDIR /app

# Copy root/workspace manifests so npm can use the monorepo lockfile in runtime stage
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/frontend/package*.json ./frontend/
COPY --from=builder /app/backend/package*.json ./backend/
COPY --from=builder /app/shared/package*.json ./shared/

# Install runtime dependencies (including Prisma CLI for deploy-time migrations)
RUN npm ci --workspace=backend

# Copy backend build and its dependencies
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/prisma ./backend/prisma
COPY --from=builder /app/backend/prisma.config.ts ./backend/prisma.config.ts

# Copy frontend build
COPY --from=builder /app/frontend/dist ./frontend/dist

# Make frontend assets available at the path resolved by backend dist code
RUN mkdir -p /app/backend/dist \
	&& ln -s /app/frontend /app/backend/dist/frontend

# Create data directories
RUN mkdir -p /app/data/vorlagen /app/data/quittungen

WORKDIR /app

EXPOSE 3000

ENV NODE_ENV=production
ENV DATABASE_URL="file:/app/data/db.sqlite"
ENV PORT=3000
ENV DATA_DIR=/app/data

CMD ["sh", "-lc", "cd /app/backend && npx prisma migrate deploy && cd /app && node backend/dist/backend/src/index.js"]
