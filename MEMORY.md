# mv-dashboard — Project Memory Bank

## Overview

A dashboard with multiple applications sharing one backend and one frontend, code-separated by feature module.

## Initial Sections

- **Spenden Quittungs Erstellung** — donation receipt generation
- **Rechnungs Erstellung** — invoice generation

## Tech Stack

| Layer           | Technology                     |
| --------------- | ------------------------------ |
| Frontend        | Vue 3 + TypeScript + Vite      |
| State           | Pinia                          |
| Routing         | Vue Router 4                   |
| Styling         | Tailwind CSS v4                |
| Backend         | Node.js + Express + TypeScript |
| Database        | SQLite via Prisma              |
| Package manager | npm workspaces                 |

## Architecture Decisions

### Monorepo Structure

Single repo with three npm workspace packages:

- `frontend/` — Vue 3 app
- `backend/` — Express API
- `shared/` — shared TypeScript types/interfaces (DTOs)

### Each Dashboard Section

- One Vue Router route
- One view component in `frontend/src/views/`
- One route file in `backend/src/routes/`
- Section functionality is deferred — stubs only for now

### Dev vs Production

- **Dev**: Vite dev server on port 5173, proxies `/api/*` → `http://localhost:3000`
- **Production**: Express on port 3000 serves `frontend/dist` as static files and handles `/api/*`

### Deployment

- Single Docker container via Docker Compose
- Express serves the built Vue frontend
- SQLite database file mounted as a Docker volume at `/app/data/db.sqlite`

## Authentication

None — internal/local use only.

## Future Decisions (TBD)

- PDF generation approach for receipts and invoices (deferred)
- Prisma schema models for `SpendenQuittung` and `Rechnung` (deferred)
- Specific form fields for each section (deferred)
