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
RUN npm run build

# Production stage
FROM node:22-alpine

# Install LibreOffice for DOCX → PDF conversion
RUN apk add --no-cache libreoffice ttf-freefont

WORKDIR /app

# Copy backend build and its dependencies
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/prisma ./backend/prisma
COPY --from=builder /app/backend/package*.json ./backend/

# Copy frontend build
COPY --from=builder /app/frontend/dist ./frontend/dist

# Copy default templates
COPY --from=builder /app/context ./context

# Install production dependencies only
WORKDIR /app/backend
RUN npm ci --omit=dev && npx prisma generate

# Create data directories
RUN mkdir -p /app/data/vorlagen /app/data/quittungen

WORKDIR /app

EXPOSE 3000

ENV NODE_ENV=production
ENV DATABASE_URL="file:/app/data/db.sqlite"
ENV PORT=3000
ENV DATA_DIR=/app/data
ENV CONTEXT_DIR=/app/context

CMD ["node", "backend/dist/index.js"]
