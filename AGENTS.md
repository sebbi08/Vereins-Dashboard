# Agent Customization Guide

This guide helps AI coding agents be productive in this monorepo and understand critical workflows.

## Project Structure

- **Frontend**: Vue 3 + TypeScript + Vite + PrimeVue 5 (Aura theme) + Pinia + Vue Router (in `frontend/`)
- **Backend**: Node.js 22 + Express 5 + TypeScript, SQLite via Prisma 7 (in `backend/`)
- **Shared**: Shared types, calculations and validation (in `shared/`), used by both
- **E2E**: WebdriverIO end-to-end tests (in `e2e/`)

Root `package.json` uses npm workspaces to coordinate builds, tests, and linting.

The app covers donation receipts (Zuwendungsbestätigungen), invoices with revisions and drafts,
and instructor rent. Documents are filled from uploaded templates (docxtemplater / pdf-lib) and
rendered to PDF with LibreOffice. The UI is English; numbers and dates use German formats.

### Dev vs Production

- **Dev**: Vite dev server on port 5173 proxies `/api/*` to the backend on port 3000
  (`docker-compose.yml`, the local test stack — not production).
- **Production**: the image built from `Dockerfile` runs Express on port 3000, serving
  `frontend/dist` and `/api/*`. Data (SQLite database, templates, generated PDFs) lives in the
  `/app/data` volume. It runs on its own server behind a reverse proxy with authentication.

## After Every Code Change: Run Verification

**Always run this after making code changes:**

```bash
npm run lint && npm run test:unit && npm run test:integration
```

This is non-negotiable. The three steps are:

1. **`npm run lint`** — ESLint + TypeScript strict mode
   - Runs across all workspaces
   - Enforces `--max-warnings=0` (zero warnings allowed)
   - Includes `npm run typecheck` automatically (backend tests are typechecked too)
   - Use `npm run lint:fix` to auto-fix style issues first

2. **`npm run test:unit`** — Unit tests for backend + frontend
   - Backend: Vitest with mocked nodemailer, Prisma, file system
   - Frontend: Vitest with jsdom and Vue Test Utils; `src/__tests__/setup.ts` installs a
     monotonic `Date.now` (WSL2 clock steps would otherwise swallow triggered events)

3. **`npm run test:integration`** — Backend integration tests only
   - Real SQLite database, real routes, real Prisma queries
   - Every run gets its own temp database and data dir, so parallel runs (worktrees) are safe
   - Slower than unit tests but critical for correctness

### When Specific Verification is Needed

- **Typecheck only**: `npm run typecheck` — Run when only types changed
- **Linting only**: `npm run lint` — Run when format/style might be wrong
- **Unit tests only**: `npm run test:unit` — Run after isolated function changes
- **End-to-end**: see "E2E tests" below — never via `npm test` against a stack you care about

## Code Patterns

### Backend

- **Routes**: Express routers in `backend/src/routes/`
- **Services**: Business logic in `backend/src/services/` (email, PDF, numbers, request parsing)
- **Request bodies**: parse them into typed values (`services/requestParsing.ts`,
  `services/instructorRent.ts`) before any rule or write; never cast `req.body`
- **Errors**: Express 5 forwards thrown errors to `errorHandler.ts` (Prisma not-found → 404)
- **Database**: Prisma ORM, schema in `backend/prisma/schema.prisma`; migrations must be safe for
  an existing production database (`prisma migrate deploy` runs at container start)
- **Tests**: Mirrored to `backend/src/__tests__/{unit,integration}/`

Key convention: Integration tests update the linked recipient/donor record when saving new revisions (not creating a new one).

### Frontend

- **Views**: Route pages in `frontend/src/views/`
- **Components**: Reusable UI in `frontend/src/components/`
- **Stores**: Pinia state in `frontend/src/stores/`
- **Requests**: use `utils/requestJson.ts` for form submits (tells server errors from network errors)
- **Forms**: guard unsaved changes with `composables/useUnsavedChangesGuard.ts`
- **Styling**: PrimeVue components + `assets/layout.css` helpers + scoped CSS; no Tailwind
- **Tests**: In `frontend/src/__tests__/`

Key convention: Recipient/donor fields on the revision form are editable (not read-only), and edits update the linked record in place.

### Email Behavior

**Critical**: Test emails must never update invoice/receipt status. The backend enforces this via a `forceTestAddress` mode in the email service that skips the status update.

**See detailed guides:**

- [Recipient Management Workflow](docs/RECIPIENT_MANAGEMENT.md) — How revisions work, in-place updates, and test patterns
- [Email Service Architecture](docs/EMAIL_SERVICE.md) — Two-endpoint pattern, forceTestAddress design, and validation rules

## Common Workflows

### Creating a New Feature

1. Write tests first (unit or integration depending on scope)
2. Implement the feature
3. Run `npm run lint && npm run test:unit && npm run test:integration`
4. Do not commit until all pass

### Fixing a Bug

1. Write a failing test that reproduces the bug
2. Fix the code
3. Run verification: `npm run lint && npm run test:unit && npm run test:integration`
4. Confirm the test now passes

### Adding a New Endpoint

1. Write integration test for the endpoint (in `backend/src/__tests__/integration/`)
2. Implement the route and service layer
3. Run `npm run lint && npm run test:unit && npm run test:integration`
4. Verify the test passes and related tests don't regress

### Modifying Invoice/Receipt Logic

- Check for both unit tests (mocks) and integration tests (real database)
- Email service changes must have tests proving test-send doesn't update status
- Revision creation must update the linked recipient/donor record in place
- Canceled invoices cannot be sent by email (enforced at service layer)
- Receipts require tax office, tax number and exemption date

## E2E Tests

Every spec file POSTs `/api/e2e/reset` first, which **deletes all data and generated files** of
the backend it talks to. The endpoint only exists when the backend runs with
`E2E_RESET_ENABLED=true` (ignored in production).

- `npm test` / `npm run test:e2e` run `e2e/run-tests.sh`, which starts the local
  `docker-compose.yml` stack, wipes its `dev-data` and runs `docker compose down` afterwards.
  Only use it when that is intended.
- Otherwise run the suite against throwaway servers with their own ports and data dir, as the
  CI `e2e` job does, and point wdio at them with `E2E_BACKEND_URL` / `E2E_FRONTEND_URL`.
- Run backends that render PDFs inside a Docker container (Dockerfile.dev); LibreOffice on the
  host is slow and differs from the images.
- Stop only the processes or containers you started.

## Environment & Setup

- **Dev DB**: SQLite at `./dev-data/db.sqlite`
- **Docker dev**: `docker-compose.yml` with Dockerfile.dev (LibreOffice and the template fonts)
- **Node version**: 22+, see `Dockerfile.dev` and root `package.json`

## Quick Reference

| Command                    | When               | What                                                    |
| -------------------------- | ------------------ | ------------------------------------------------------- |
| `npm run dev`              | Local development  | Start backend + frontend with hot reload                |
| `npm run lint`             | After code changes | ESLint + typecheck (must pass before commit)            |
| `npm run lint:fix`         | Fix style issues   | Auto-fix ESLint violations                              |
| `npm run typecheck`        | Type-only changes  | TypeScript check only                                   |
| `npm run test:unit`        | After code changes | Unit tests only                                         |
| `npm run test:integration` | Backend changes    | Integration tests (slower)                              |
| `npm run build`            | Before shipping    | Build all workspaces                                    |
| `npm run test`             | Rarely             | Unit + integration + e2e — wipes the local compose data |

---

**TL;DR**: After every code change, run `npm run lint && npm run test:unit && npm run test:integration`. Do not skip this step.
