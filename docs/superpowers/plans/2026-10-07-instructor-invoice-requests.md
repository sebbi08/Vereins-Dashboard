# Instructor Invoice Requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A manual matrix on the Instructor Rent page (instructors × the 12 months of one calendar year) where the user ticks each month whose invoice they have already requested.

**Architecture:** One new table `InstructorInvoiceRequest`, with one row per requested instructor-month (`"YYYY-MM"`) and a cascade delete from `Instructor`. Three routes on the existing `instructorRouter`: GET a year, and PUT/DELETE a single cell (both repeatable). A new card component `InstructorInvoiceRequests.vue` loads a year, toggles cells optimistically and reverts on failure. `InstructorView` mounts it below the instructors table and passes it the already-loaded instructor list.

**Tech Stack:** Prisma 7 + SQLite (better-sqlite3 adapter), Express 4, shared TS module, Vue 3 + PrimeVue 5 (Card, Button, Message), Vitest (+ supertest, @vue/test-utils), WebdriverIO 8.

**Spec:** `docs/superpowers/specs/2026-10-07-instructor-invoice-requests-design.md`

## Global Constraints

- **States:** a month is either requested or not requested. Store no amounts, dates, notes or invoice links.
- **Completely manual:** nothing is marked automatically.
- **Months:** a month is the string `YYYY-MM`. It is valid only with month 01–12 and year 2000–2100.
- **UI language:** all UI text is English. The month headers are exactly `Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec`.
- **Exact UI copy:**
  - card title `Invoice requests`
  - year buttons `Previous year` / `Next year` (aria-label)
  - cell label `"<Name>, <English month name> <year>: requested"` / `"… not requested"`
  - toast `Could not save the invoice request`
  - load error `Invoice requests could not be loaded.`
  - empty state `No instructors yet.`
- **Express 4:** async handlers must catch their own errors. Use the existing `sendError(res, err)` in `backend/src/routes/instructor.ts`.
- **No Tailwind:** `frontend/src/__tests__/noTailwind.test.ts` enforces it. Use PrimeVue components, the `layout.css` helpers (`.stack .row .row--between .gap-* .muted .section-title`) and scoped CSS with PrimeVue theme variables.
- **Shared imports in the backend:** use relative paths with `.js` (`'../../../shared/src/<module>.js'`). The frontend imports from `'shared'`.
- **Commits:** subject lines are lower-case conventional commits, body lines ≤ 100 characters, and every commit ends with:
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
- **Checks after every task:** run from the repo root: `npm run lint && npm run test:unit && npm run test:integration`.
- **Off-limits commands:**
  - Never run `npm test`, `npm run test:e2e` or `e2e/run-tests.sh`; they drive docker compose.
  - Never touch anything on ports 3000/5173; that is the user's app.
  - Never point e2e at port 3000, because `/api/e2e/reset` wipes data.

## Review Focus

1. **Clicks while a year is loading:** a click during a load would be overwritten by the GET. All cells are disabled until the year has loaded. Test in Task 4: "disables every cell while the year is loading".
2. **Year switcher at the edges:** the backend rejects years outside 2000–2100. "Previous year" is disabled at 2000 and "Next year" at 2100. Test in Task 4: "stops the year switcher at …".
3. **Leaving and returning to a year while a save is in flight:** the reloaded GET can predate the save. A cell with a pending save keeps the state being saved. Test in Task 4: "keeps a cell that is still saving when its year is shown again".
4. **Malformed `year` query:** `2026.5`, `02026`, a repeated `year=…&year=…`, or an empty value all give 400 and never a 500. Test in Task 3: the GET `it.each` of bad queries.
5. **German names:** rows are sorted with `localeCompare(…, 'de')`, so `Özge` sorts next to `O`, not after `Z`. Test in Task 4: "sorts rows by name the German way".

---

## File Structure

| File                                                                                                  | Responsibility                                               |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `shared/src/instructorInvoiceRequests.ts` (new)                                                       | DTO, year/month validation, `requestMonth(year, monthIndex)` |
| `shared/src/index.ts`                                                                                 | re-export the new module                                     |
| `backend/prisma/schema.prisma`                                                                        | `InstructorInvoiceRequest` model + back-relation             |
| `backend/prisma/migrations/<timestamp>_add_instructor_invoice_request/migration.sql` (new, generated) | table + unique index + cascade FK                            |
| `backend/src/routes/instructor.ts`                                                                    | GET/PUT/DELETE routes                                        |
| `backend/src/routes/index.ts`                                                                         | e2e reset also clears requests                               |
| `backend/src/__tests__/integration/helpers.ts`                                                        | `cleanDatabase` also clears requests                         |
| `backend/src/__tests__/unit/instructorInvoiceRequests.test.ts` (new)                                  | shared validation tests                                      |
| `backend/src/__tests__/integration/instructorInvoiceRequests.test.ts` (new)                           | model + API tests                                            |
| `frontend/src/components/InstructorInvoiceRequests.vue` (new)                                         | the matrix card                                              |
| `frontend/src/__tests__/InstructorInvoiceRequests.test.ts` (new)                                      | component tests                                              |
| `frontend/src/views/InstructorView.vue`                                                               | mount the card below the table                               |
| `frontend/src/__tests__/InstructorView.test.ts`                                                       | card presence/placement                                      |
| `e2e/tests/instructor-invoice-requests.spec.ts` (new)                                                 | tick → reload → still ticked                                 |

---

### Task 1: Shared DTO and month validation

**Files:**

- Create: `shared/src/instructorInvoiceRequests.ts`
- Modify: `shared/src/index.ts` (next to `export * from './instructorInvoiceText.js';`, line ~196)
- Test: `backend/src/__tests__/unit/instructorInvoiceRequests.test.ts`

**Interfaces:**

- Produces:
  - `interface InstructorInvoiceRequestDto { instructorId: number; month: string }`
  - `MIN_REQUEST_YEAR = 2000` and `MAX_REQUEST_YEAR = 2100`
  - `isValidRequestYear(year: number): boolean`
  - `isValidRequestMonth(value: string): boolean`
  - `requestMonth(year: number, monthIndex: number): string`, with `monthIndex` 0–11, e.g. `requestMonth(2026, 9) === '2026-10'`
  - All of these are exported from `'shared'`.

- [ ] **Step 1: Write the failing test** at `backend/src/__tests__/unit/instructorInvoiceRequests.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import {
  isValidRequestMonth,
  isValidRequestYear,
  MAX_REQUEST_YEAR,
  MIN_REQUEST_YEAR,
  requestMonth,
} from '../../../../shared/src/instructorInvoiceRequests';

describe('isValidRequestYear', () => {
  it.each([2000, 2026, 2100])('accepts %i', (year) => {
    expect(isValidRequestYear(year)).toBe(true);
  });

  it.each([1999, 2101, 2026.5, Number.NaN])('rejects %s', (year) => {
    expect(isValidRequestYear(year)).toBe(false);
  });

  it('exposes the supported range', () => {
    expect([MIN_REQUEST_YEAR, MAX_REQUEST_YEAR]).toEqual([2000, 2100]);
  });
});

describe('isValidRequestMonth', () => {
  it.each(['2026-01', '2026-10', '2026-12', '2000-01', '2100-12'])('accepts %s', (value) => {
    expect(isValidRequestMonth(value)).toBe(true);
  });

  it.each(['2026-00', '2026-13', '26-01', '1999-12', '2101-01', '2026-1', '2026-010', '', 'abc'])(
    'rejects %j',
    (value) => {
      expect(isValidRequestMonth(value)).toBe(false);
    },
  );
});

describe('requestMonth', () => {
  it('builds a zero-padded YYYY-MM from a 0-based month index', () => {
    expect(requestMonth(2026, 0)).toBe('2026-01');
    expect(requestMonth(2026, 9)).toBe('2026-10');
    expect(requestMonth(2026, 11)).toBe('2026-12');
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run --config vitest.config.ts src/__tests__/unit/instructorInvoiceRequests.test.ts` (in `backend/`)
Expected: FAIL. The import cannot be resolved (`instructorInvoiceRequests` does not exist).

- [ ] **Step 3: Implement** `shared/src/instructorInvoiceRequests.ts`

```ts
/** One month whose invoice has been requested from an instructor. `month` is "YYYY-MM". */
export interface InstructorInvoiceRequestDto {
  instructorId: number;
  month: string;
}

export const MIN_REQUEST_YEAR = 2000;
export const MAX_REQUEST_YEAR = 2100;

export function isValidRequestYear(year: number): boolean {
  return Number.isInteger(year) && year >= MIN_REQUEST_YEAR && year <= MAX_REQUEST_YEAR;
}

/** True for "YYYY-MM" with month 01–12 and a year in the supported range. */
export function isValidRequestMonth(value: string): boolean {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return false;
  const month = Number(match[2]);
  return isValidRequestYear(Number(match[1])) && month >= 1 && month <= 12;
}

/** "YYYY-MM" for a 0-based month index (0 = January). */
export function requestMonth(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}
```

In `shared/src/index.ts`, add this line after `export * from './instructorInvoiceText.js';`:

```ts
export * from './instructorInvoiceRequests.js';
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run --config vitest.config.ts src/__tests__/unit/instructorInvoiceRequests.test.ts` (in `backend/`)
Expected: PASS.

- [ ] **Step 5: Run the checks and commit**

```bash
npm run lint && npm run test:unit && npm run test:integration
git add shared/src/instructorInvoiceRequests.ts shared/src/index.ts \
  backend/src/__tests__/unit/instructorInvoiceRequests.test.ts
git commit -m "feat: add shared invoice request month helpers" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Prisma model, migration and cleanup

**Files:**

- Modify: `backend/prisma/schema.prisma` (model `Instructor` at line ~161, plus the new model)
- Create (generated): `backend/prisma/migrations/<timestamp>_add_instructor_invoice_request/migration.sql`
- Modify: `backend/src/__tests__/integration/helpers.ts` (`cleanDatabase`)
- Modify: `backend/src/routes/index.ts` (the `/e2e/reset` handler, line ~35)
- Test: `backend/src/__tests__/integration/instructorInvoiceRequests.test.ts` (new)

**Interfaces:**

- Consumes: nothing from Task 1.
- Produces:
  - Prisma delegate `prisma.instructorInvoiceRequest`, with fields `id`, `instructorId`, `month`, `createdAt`.
  - Compound unique key `instructorId_month` (used in `upsert({ where: { instructorId_month: { instructorId, month } } })`).
  - The test file and its helper `createInstructor(name)`, which Task 3 extends.

- [ ] **Step 1: Write the failing test.** Create `backend/src/__tests__/integration/instructorInvoiceRequests.test.ts`:

```ts
import supertest from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { initializeApp } from '../../init';
import { prisma } from '../../prismaClient';
import { cleanDatabase, useCleanDatabase } from './helpers';

let request: ReturnType<typeof supertest>;

beforeAll(async () => {
  await initializeApp();
  request = supertest(createApp());
});

useCleanDatabase();

async function createInstructor(name: string) {
  const recipient = await prisma.invoiceRecipient.create({
    data: { name, street: 'Hauptstr. 1', city: '12345 Berlin', email: null, salutation: null },
  });
  return prisma.instructor.create({
    data: { recipientId: recipient.id, hourlyRateCents: 1200, months: 6, timeBlocks: '[]' },
  });
}

describe('InstructorInvoiceRequest model', () => {
  it('stores one row per instructor and month', async () => {
    const instructor = await createInstructor('Anna Alt');
    const data = { instructorId: instructor.id, month: '2026-10' };
    await prisma.instructorInvoiceRequest.create({ data });
    await expect(prisma.instructorInvoiceRequest.create({ data })).rejects.toThrow();
  });

  it('is deleted together with its instructor', async () => {
    const instructor = await createInstructor('Anna Alt');
    await prisma.instructorInvoiceRequest.create({
      data: { instructorId: instructor.id, month: '2026-10' },
    });

    await prisma.instructor.delete({ where: { id: instructor.id } });

    expect(await prisma.instructorInvoiceRequest.count()).toBe(0);
  });

  it('is removed by cleanDatabase', async () => {
    const instructor = await createInstructor('Anna Alt');
    await prisma.instructorInvoiceRequest.create({
      data: { instructorId: instructor.id, month: '2026-10' },
    });

    await cleanDatabase();

    expect(await prisma.instructorInvoiceRequest.count()).toBe(0);
    expect(await prisma.instructor.count()).toBe(0);
  });

  it('is removed by POST /api/e2e/reset', async () => {
    const instructor = await createInstructor('Anna Alt');
    await prisma.instructorInvoiceRequest.create({
      data: { instructorId: instructor.id, month: '2026-10' },
    });

    const res = await request.post('/api/e2e/reset');

    expect(res.status).toBe(200);
    expect(await prisma.instructorInvoiceRequest.count()).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run --config vitest.integration.config.ts src/__tests__/integration/instructorInvoiceRequests.test.ts` (in `backend/`)
Expected: FAIL with a TypeScript/runtime error, because `prisma.instructorInvoiceRequest` is undefined.

- [ ] **Step 3: Add the model.** In `backend/prisma/schema.prisma`, add the back-relation to `model Instructor`, below `timeBlocks`:

```prisma
  invoiceRequests InstructorInvoiceRequest[]
```

Add the new model directly after `model Instructor { … }`:

```prisma
/// A month whose invoice has been requested from the instructor (manual mark).
model InstructorInvoiceRequest {
  id           Int        @id @default(autoincrement())
  instructorId Int
  instructor   Instructor @relation(fields: [instructorId], references: [id], onDelete: Cascade)
  month        String // "YYYY-MM"
  createdAt    DateTime   @default(now())

  @@unique([instructorId, month])
}
```

- [ ] **Step 4: Generate the migration against a scratch database** (never the real `data/` DB):

```bash
cd backend
SCRATCH=$(mktemp -d)
DATABASE_URL="file:$SCRATCH/migrate.sqlite" npx prisma migrate deploy
DATABASE_URL="file:$SCRATCH/migrate.sqlite" npx prisma migrate dev --create-only --name add_instructor_invoice_request
npx prisma generate
```

The new `migration.sql` must be equivalent to the following. If it differs in substance, the schema edit is wrong.

```sql
-- CreateTable
CREATE TABLE "InstructorInvoiceRequest" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "instructorId" INTEGER NOT NULL,
    "month" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InstructorInvoiceRequest_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "Instructor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "InstructorInvoiceRequest_instructorId_month_key" ON "InstructorInvoiceRequest"("instructorId", "month");
```

Then confirm the schema and migrations are in sync. Run `DATABASE_URL="file:$SCRATCH/migrate.sqlite" npx prisma migrate deploy` and then `DATABASE_URL="file:$SCRATCH/migrate.sqlite" npx prisma migrate dev --create-only --name check`. The second command must report that no schema change was found and must create no `check` migration; if it created one, delete that folder. Finally run `rm -rf "$SCRATCH"`.

- [ ] **Step 5: Clear requests in the test cleanup and the e2e reset.** They cascade, but every other table is listed explicitly, so list this one too.

In `backend/src/__tests__/integration/helpers.ts`, add this as the first line of `cleanDatabase()`:

```ts
await prisma.instructorInvoiceRequest.deleteMany();
```

In `backend/src/routes/index.ts`, add this as the first line inside the `/e2e/reset` `try`, before `await prisma.instructor.deleteMany();`:

```ts
await prisma.instructorInvoiceRequest.deleteMany();
```

- [ ] **Step 6: Run the test and confirm it passes**

Run: `npx vitest run --config vitest.integration.config.ts src/__tests__/integration/instructorInvoiceRequests.test.ts` (in `backend/`)
Expected: PASS, all 4 tests.

If "is deleted together with its instructor" fails, SQLite foreign-key enforcement is off. Do not work around it in the route. Report it as BLOCKED with the error.

- [ ] **Step 7: Run the checks and commit**

```bash
npm run lint && npm run test:unit && npm run test:integration
git add backend/prisma/schema.prisma backend/prisma/migrations \
  backend/src/__tests__/integration/helpers.ts backend/src/routes/index.ts \
  backend/src/__tests__/integration/instructorInvoiceRequests.test.ts
git commit -m "feat: add instructor invoice request table" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Invoice request API routes

**Files:**

- Modify: `backend/src/routes/instructor.ts`
- Test: `backend/src/__tests__/integration/instructorInvoiceRequests.test.ts` (append)

**Interfaces:**

- Consumes:
  - `isValidRequestMonth` and `isValidRequestYear` from `'../../../shared/src/instructorInvoiceRequests.js'` (Task 1)
  - `prisma.instructorInvoiceRequest` and the unique key `instructorId_month` (Task 2)
  - the helper `createInstructor` in the test file (Task 2)
- Produces (the frontend in Task 4 calls these exact URLs):
  - `GET /api/instructor/invoice-requests?year=YYYY` → `200 InstructorInvoiceRequestDto[]`, ordered by `instructorId`, then `month`; `400 { error: 'Invalid year' }`
  - `PUT /api/instructor/:id/invoice-requests/:month` → `204`; `404 { error: 'Instructor not found' }`; `400 { error: 'Invalid instructor id or month' }`
  - `DELETE /api/instructor/:id/invoice-requests/:month` → the same status codes

- [ ] **Step 1: Write the failing tests.** In `backend/src/__tests__/integration/instructorInvoiceRequests.test.ts`, add this helper directly below `createInstructor`:

```ts
function requestsOf(instructorId: number) {
  return prisma.instructorInvoiceRequest.findMany({
    where: { instructorId },
    select: { month: true },
    orderBy: { month: 'asc' },
  });
}
```

Then append:

```ts
describe('GET /api/instructor/invoice-requests', () => {
  it('returns the requests of one year ordered by instructor and month', async () => {
    const anna = await createInstructor('Anna Alt');
    const bernd = await createInstructor('Bernd Bach');
    await prisma.instructorInvoiceRequest.createMany({
      data: [
        { instructorId: bernd.id, month: '2026-02' },
        { instructorId: anna.id, month: '2026-12' },
        { instructorId: anna.id, month: '2025-12' },
        { instructorId: bernd.id, month: '2027-01' },
        { instructorId: anna.id, month: '2026-01' },
      ],
    });

    const res = await request.get('/api/instructor/invoice-requests?year=2026');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { instructorId: anna.id, month: '2026-01' },
      { instructorId: anna.id, month: '2026-12' },
      { instructorId: bernd.id, month: '2026-02' },
    ]);
  });

  it('returns an empty list for a year without requests', async () => {
    const res = await request.get('/api/instructor/invoice-requests?year=2026');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it.each([
    '',
    '?year=',
    '?year=abc',
    '?year=1999',
    '?year=2101',
    '?year=2026.5',
    '?year=02026',
    '?year=2026&year=2027',
  ])('returns 400 for the query %j', async (query) => {
    const res = await request.get(`/api/instructor/invoice-requests${query}`);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid year' });
  });
});

describe.each(['put', 'delete'] as const)(
  '%s /api/instructor/:id/invoice-requests/:month',
  (method) => {
    it('returns 404 for an unknown instructor', async () => {
      const res = await request[method]('/api/instructor/999999/invoice-requests/2026-10');
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Instructor not found' });
    });

    it.each(['abc', '0', '-1', '1.5'])('returns 400 for the instructor id %j', async (id) => {
      const res = await request[method](`/api/instructor/${id}/invoice-requests/2026-10`);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Invalid instructor id or month' });
    });

    it.each(['2026-13', '2026-00', '2026-1', '26-01', '1999-12', 'abc'])(
      'returns 400 for the month %j',
      async (month) => {
        const instructor = await createInstructor('Anna Alt');
        const res = await request[method](
          `/api/instructor/${instructor.id}/invoice-requests/${month}`,
        );
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'Invalid instructor id or month' });
      },
    );
  },
);

describe('PUT /api/instructor/:id/invoice-requests/:month', () => {
  it('marks the month as requested and can be repeated', async () => {
    const instructor = await createInstructor('Anna Alt');
    const url = `/api/instructor/${instructor.id}/invoice-requests/2026-10`;

    expect((await request.put(url)).status).toBe(204);
    expect((await request.put(url)).status).toBe(204);

    expect(await requestsOf(instructor.id)).toEqual([{ month: '2026-10' }]);
  });
});

describe('DELETE /api/instructor/:id/invoice-requests/:month', () => {
  it('removes the mark and can be repeated', async () => {
    const instructor = await createInstructor('Anna Alt');
    await prisma.instructorInvoiceRequest.createMany({
      data: [
        { instructorId: instructor.id, month: '2026-10' },
        { instructorId: instructor.id, month: '2026-11' },
      ],
    });
    const url = `/api/instructor/${instructor.id}/invoice-requests/2026-10`;

    expect((await request.delete(url)).status).toBe(204);
    expect((await request.delete(url)).status).toBe(204);

    expect(await requestsOf(instructor.id)).toEqual([{ month: '2026-11' }]);
  });
});

describe('DELETE /api/instructor/:id', () => {
  it('also deletes the instructor’s invoice requests', async () => {
    const instructor = await createInstructor('Anna Alt');
    await request.put(`/api/instructor/${instructor.id}/invoice-requests/2026-10`);

    const res = await request.delete(`/api/instructor/${instructor.id}`);

    expect(res.status).toBe(204);
    expect(await prisma.instructorInvoiceRequest.count()).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run --config vitest.integration.config.ts src/__tests__/integration/instructorInvoiceRequests.test.ts` (in `backend/`)
Expected: the new tests FAIL. For example, the GET returns 404 (`invoice-requests` is parsed as an `:id`) and PUT returns 404 (no route). The 4 model tests from Task 2 still pass.

- [ ] **Step 3: Implement the routes** in `backend/src/routes/instructor.ts`.

Change the express import on line 1 to include `Request`:

```ts
import { Router, type Request, type Response } from 'express';
```

Add after the `validateInstructorRent` import (line 4):

```ts
import {
  isValidRequestMonth,
  isValidRequestYear,
} from '../../../shared/src/instructorInvoiceRequests.js';
```

Add the following block **after** the `sendError` function and **before** `// GET /api/instructor` (`instructorRouter.get('/', …)`). The GET route must be registered before `instructorRouter.get('/:id', …)`, so that `invoice-requests` is never treated as an id.

```ts
// ── Invoice requests (manual "invoice requested" marks per month) ──

// GET /api/instructor/invoice-requests?year=2026
instructorRouter.get('/invoice-requests', async (req, res) => {
  const raw = req.query.year;
  const year = typeof raw === 'string' && /^\d{4}$/.test(raw) ? Number(raw) : Number.NaN;
  if (!isValidRequestYear(year)) {
    res.status(400).json({ error: 'Invalid year' });
    return;
  }
  try {
    const rows = await prisma.instructorInvoiceRequest.findMany({
      where: { month: { startsWith: `${year}-` } },
      select: { instructorId: true, month: true },
      orderBy: [{ instructorId: 'asc' }, { month: 'asc' }],
    });
    res.json(rows);
  } catch (err) {
    sendError(res, err);
  }
});

/** Validates `:id` and `:month`; on failure sends 400/404 and returns null. */
async function invoiceRequestTarget(
  req: Request,
  res: Response,
): Promise<{ instructorId: number; month: string } | null> {
  const instructorId = parseId(req.params.id);
  const { month } = req.params;
  if (instructorId === null || !isValidRequestMonth(month)) {
    res.status(400).json({ error: 'Invalid instructor id or month' });
    return null;
  }
  const instructor = await prisma.instructor.findUnique({
    where: { id: instructorId },
    select: { id: true },
  });
  if (!instructor) {
    res.status(404).json({ error: 'Instructor not found' });
    return null;
  }
  return { instructorId, month };
}

// PUT /api/instructor/:id/invoice-requests/:month
instructorRouter.put('/:id/invoice-requests/:month', async (req, res) => {
  try {
    const target = await invoiceRequestTarget(req, res);
    if (!target) return;
    await prisma.instructorInvoiceRequest.upsert({
      where: { instructorId_month: target },
      update: {},
      create: target,
    });
    res.status(204).end();
  } catch (err) {
    sendError(res, err);
  }
});

// DELETE /api/instructor/:id/invoice-requests/:month
instructorRouter.delete('/:id/invoice-requests/:month', async (req, res) => {
  try {
    const target = await invoiceRequestTarget(req, res);
    if (!target) return;
    await prisma.instructorInvoiceRequest.deleteMany({ where: target });
    res.status(204).end();
  } catch (err) {
    sendError(res, err);
  }
});
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run --config vitest.integration.config.ts src/__tests__/integration/instructorInvoiceRequests.test.ts src/__tests__/integration/instructor.test.ts` (in `backend/`)
Expected: PASS. The existing instructor tests still pass, including `GET /api/instructor/:id`.

- [ ] **Step 5: Run the checks and commit**

```bash
npm run lint && npm run test:unit && npm run test:integration
git add backend/src/routes/instructor.ts \
  backend/src/__tests__/integration/instructorInvoiceRequests.test.ts
git commit -m "feat: add instructor invoice request api" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `InstructorInvoiceRequests.vue` matrix card

**Files:**

- Create: `frontend/src/components/InstructorInvoiceRequests.vue`
- Test: `frontend/src/__tests__/InstructorInvoiceRequests.test.ts`

**Interfaces:**

- Consumes:
  - From `'shared'` (Task 1): `InstructorInvoiceRequestDto`, `MIN_REQUEST_YEAR`, `MAX_REQUEST_YEAR`, `requestMonth`
  - The API URLs from Task 3
  - `InstructorListItemDto` from `'shared'` (existing)
- Produces: component `InstructorInvoiceRequests`.
  - Prop: `instructors: Pick<InstructorListItemDto, 'id' | 'name'>[]`.
  - Test ids used by Task 5 and Task 6:
    - the root card: `invoice-requests`
    - each body row: `invoice-request-row`
    - each cell button: `request-<instructorId>-<YYYY-MM>`
    - the year buttons and year text: `previous-year`, `next-year`, `request-year`
    - the load error: `invoice-requests-load-error`
    - the empty state: `invoice-requests-empty`

- [ ] **Step 1: Write the failing tests** at `frontend/src/__tests__/InstructorInvoiceRequests.test.ts`:

```ts
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import type { InstructorInvoiceRequestDto } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import InstructorInvoiceRequests from '../components/InstructorInvoiceRequests.vue';
import { withPrimeVue } from './helpers/primeVue';

const { notify } = vi.hoisted(() => ({
  notify: { success: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../composables/useNotify', () => ({ useNotify: () => notify }));

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const instructors = [
  { id: 2, name: 'Bernd Bach' },
  { id: 1, name: 'Anna Alt' },
];

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: () => Promise.resolve(body) } as Response;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;
let fetchMock: ReturnType<typeof vi.fn>;
let requestsByYear: Record<string, InstructorInvoiceRequestDto[]>;

const LIST_URL = /^\/api\/instructor\/invoice-requests\?year=(\d+)$/;

const defaultFetch: FetchImpl = (url, init) => {
  const list = LIST_URL.exec(url);
  if (list && !init?.method) return Promise.resolve(jsonResponse(requestsByYear[list[1]] ?? []));
  if (init?.method === 'PUT' || init?.method === 'DELETE') {
    return Promise.resolve({ ok: true, status: 204 } as Response);
  }
  return Promise.resolve(jsonResponse({}, false));
};

async function mountCard(list = instructors) {
  const wrapper = mount(InstructorInvoiceRequests, {
    props: { instructors: list },
    attachTo: document.body,
    global: withPrimeVue(),
  });
  await flushPromises();
  return wrapper;
}

function cell(wrapper: VueWrapper, instructorId: number, month: string) {
  return wrapper.find(`[data-testid="request-${instructorId}-${month}"]`);
}

function cellButtons(wrapper: VueWrapper) {
  return wrapper.findAll('[data-testid^="request-"]').filter((b) => b.element.tagName === 'BUTTON');
}

async function click(wrapper: VueWrapper, testId: string) {
  await wrapper.find(`[data-testid="${testId}"]`).trigger('click');
  await flushPromises();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 7)); // 7 October 2026
  requestsByYear = { '2026': [{ instructorId: 1, month: '2026-03' }] };
  fetchMock = vi.fn(defaultFetch);
  vi.stubGlobal('fetch', fetchMock);
  Object.values(notify).forEach((fn) => fn.mockReset());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('InstructorInvoiceRequests', () => {
  it('shows one row per instructor sorted by name and the 12 months of the current year', async () => {
    const wrapper = await mountCard();

    expect(fetchMock).toHaveBeenCalledWith('/api/instructor/invoice-requests?year=2026');
    expect(wrapper.find('[data-testid="request-year"]').text()).toBe('2026');
    expect(wrapper.findAll('thead th').map((th) => th.text())).toEqual(['Instructor', ...MONTHS]);
    const rows = wrapper.findAll('[data-testid="invoice-request-row"]');
    expect(rows.map((row) => row.find('th').text())).toEqual(['Anna Alt', 'Bernd Bach']);
    expect(cellButtons(wrapper)).toHaveLength(24);
  });

  it('sorts rows by name the German way', async () => {
    const wrapper = await mountCard([
      { id: 1, name: 'Zoe Zander' },
      { id: 2, name: 'Özge Öz' },
      { id: 3, name: 'Paul Pohl' },
    ]);
    const rows = wrapper.findAll('[data-testid="invoice-request-row"]');
    expect(rows.map((row) => row.find('th').text())).toEqual([
      'Özge Öz',
      'Paul Pohl',
      'Zoe Zander',
    ]);
  });

  it('ticks the months returned by the server', async () => {
    const wrapper = await mountCard();

    const ticked = cell(wrapper, 1, '2026-03');
    expect(ticked.attributes('aria-pressed')).toBe('true');
    expect(ticked.attributes('aria-label')).toBe('Anna Alt, March 2026: requested');
    expect(ticked.find('.pi-check').exists()).toBe(true);

    const open = cell(wrapper, 1, '2026-04');
    expect(open.attributes('aria-pressed')).toBe('false');
    expect(open.attributes('aria-label')).toBe('Anna Alt, April 2026: not requested');
    expect(open.find('.pi-check').exists()).toBe(false);
  });

  it('marks a month with PUT and unmarks it with DELETE', async () => {
    const wrapper = await mountCard();

    await cell(wrapper, 2, '2026-10').trigger('click');
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledWith('/api/instructor/2/invoice-requests/2026-10', {
      method: 'PUT',
    });
    expect(cell(wrapper, 2, '2026-10').attributes('aria-pressed')).toBe('true');
    expect(cell(wrapper, 2, '2026-10').attributes('aria-label')).toBe(
      'Bernd Bach, October 2026: requested',
    );

    await cell(wrapper, 1, '2026-03').trigger('click');
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledWith('/api/instructor/1/invoice-requests/2026-03', {
      method: 'DELETE',
    });
    expect(cell(wrapper, 1, '2026-03').attributes('aria-pressed')).toBe('false');
    expect(notify.error).not.toHaveBeenCalled();
  });

  it('flips the cell at once and disables it until the save is done', async () => {
    const save = deferred<Response>();
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      init?.method === 'PUT' ? save.promise : defaultFetch(url, init),
    );
    const wrapper = await mountCard();

    await cell(wrapper, 2, '2026-10').trigger('click');
    expect(cell(wrapper, 2, '2026-10').attributes('aria-pressed')).toBe('true');
    expect(cell(wrapper, 2, '2026-10').attributes('disabled')).toBeDefined();

    save.resolve({ ok: true, status: 204 } as Response);
    await flushPromises();
    expect(cell(wrapper, 2, '2026-10').attributes('aria-pressed')).toBe('true');
    expect(cell(wrapper, 2, '2026-10').attributes('disabled')).toBeUndefined();
  });

  it.each([
    ['responds with an error', () => Promise.resolve(jsonResponse({ error: 'x' }, false))],
    ['is unreachable', () => Promise.reject(new Error('offline'))],
  ])('reverts the cell and toasts when the save %s', async (_label, reply) => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      init?.method ? reply() : defaultFetch(url, init),
    );
    const wrapper = await mountCard();

    await cell(wrapper, 2, '2026-10').trigger('click');
    await flushPromises();
    expect(cell(wrapper, 2, '2026-10').attributes('aria-pressed')).toBe('false');

    await cell(wrapper, 1, '2026-03').trigger('click');
    await flushPromises();
    expect(cell(wrapper, 1, '2026-03').attributes('aria-pressed')).toBe('true');

    expect(notify.error).toHaveBeenCalledTimes(2);
    expect(notify.error).toHaveBeenCalledWith('Could not save the invoice request');
  });

  it('loads another year with the year switcher', async () => {
    requestsByYear['2027'] = [{ instructorId: 2, month: '2027-01' }];
    const wrapper = await mountCard();

    await click(wrapper, 'next-year');
    expect(fetchMock).toHaveBeenCalledWith('/api/instructor/invoice-requests?year=2027');
    expect(wrapper.find('[data-testid="request-year"]').text()).toBe('2027');
    expect(cell(wrapper, 2, '2027-01').attributes('aria-pressed')).toBe('true');
    expect(cell(wrapper, 2, '2027-01').attributes('aria-label')).toBe(
      'Bernd Bach, January 2027: requested',
    );
    expect(cell(wrapper, 1, '2026-03').exists()).toBe(false);

    await click(wrapper, 'previous-year');
    await click(wrapper, 'previous-year');
    expect(fetchMock).toHaveBeenCalledWith('/api/instructor/invoice-requests?year=2025');
    expect(wrapper.find('[data-testid="request-year"]').text()).toBe('2025');
  });

  it.each([
    [
      'succeeds',
      (d: ReturnType<typeof deferred<Response>>) =>
        d.resolve(jsonResponse([{ instructorId: 1, month: '2026-03' }])),
    ],
    ['fails', (d: ReturnType<typeof deferred<Response>>) => d.reject(new Error('offline'))],
  ])('ignores a late response for a year no longer shown when it %s', async (_label, settle) => {
    const stale = deferred<Response>();
    requestsByYear['2027'] = [{ instructorId: 1, month: '2027-01' }];
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      url.endsWith('year=2026') ? stale.promise : defaultFetch(url, init),
    );
    const wrapper = await mountCard();

    await click(wrapper, 'next-year');
    settle(stale);
    await flushPromises();

    expect(cell(wrapper, 1, '2027-01').attributes('aria-pressed')).toBe('true');
    expect(cell(wrapper, 1, '2027-01').attributes('disabled')).toBeUndefined();
    expect(wrapper.find('[data-testid="invoice-requests-load-error"]').exists()).toBe(false);
  });

  it('highlights the current month only in the current year', async () => {
    const wrapper = await mountCard();

    const headers = wrapper.findAll('thead th');
    expect(headers.filter((th) => th.classes('current')).map((th) => th.text())).toEqual(['Oct']);
    expect(cell(wrapper, 1, '2026-10').element.closest('td')?.classList.contains('current')).toBe(
      true,
    );

    await click(wrapper, 'next-year');
    expect(wrapper.findAll('thead th').some((th) => th.classes('current'))).toBe(false);
  });

  it.each([
    ['responds with an error', () => Promise.resolve(jsonResponse({}, false))],
    ['is unreachable', () => Promise.reject(new Error('offline'))],
  ])('shows an error and disables every cell when loading %s', async (_label, reply) => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      LIST_URL.test(url) ? reply() : defaultFetch(url, init),
    );
    const wrapper = await mountCard();

    expect(wrapper.find('[data-testid="invoice-requests-load-error"]').text()).toBe(
      'Invoice requests could not be loaded.',
    );
    expect(cellButtons(wrapper).every((b) => b.attributes('disabled') !== undefined)).toBe(true);

    await cell(wrapper, 1, '2026-10').trigger('click');
    await flushPromises();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method)).toBe(false);
  });

  it('disables every cell while the year is loading', async () => {
    const list = deferred<Response>();
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      LIST_URL.test(url) ? list.promise : defaultFetch(url, init),
    );
    const wrapper = await mountCard();
    expect(cellButtons(wrapper).every((b) => b.attributes('disabled') !== undefined)).toBe(true);

    list.resolve(jsonResponse([]));
    await flushPromises();
    expect(cellButtons(wrapper).every((b) => b.attributes('disabled') === undefined)).toBe(true);
  });

  it('keeps a cell that is still saving when its year is shown again', async () => {
    const save = deferred<Response>();
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      init?.method === 'PUT' ? save.promise : defaultFetch(url, init),
    );
    const wrapper = await mountCard();

    await cell(wrapper, 2, '2026-10').trigger('click');
    await click(wrapper, 'next-year');
    await click(wrapper, 'previous-year');
    expect(cell(wrapper, 2, '2026-10').attributes('aria-pressed')).toBe('true');

    save.resolve({ ok: true, status: 204 } as Response);
    await flushPromises();
    expect(cell(wrapper, 2, '2026-10').attributes('aria-pressed')).toBe('true');
    expect(cell(wrapper, 2, '2026-10').attributes('disabled')).toBeUndefined();
  });

  it.each([
    [new Date(2000, 0, 15), 'previous-year', 'next-year'],
    [new Date(2100, 11, 15), 'next-year', 'previous-year'],
  ])('stops the year switcher at the supported range (%s)', async (today, stopped, open) => {
    vi.setSystemTime(today);
    const wrapper = await mountCard();
    expect(wrapper.find(`[data-testid="${stopped}"]`).attributes('disabled')).toBeDefined();
    expect(wrapper.find(`[data-testid="${open}"]`).attributes('disabled')).toBeUndefined();
  });

  it('shows the empty state without instructors', async () => {
    const wrapper = await mountCard([]);
    expect(wrapper.find('[data-testid="invoice-requests-empty"]').text()).toBe(
      'No instructors yet.',
    );
    expect(wrapper.find('table').exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run --config vitest.config.ts src/__tests__/InstructorInvoiceRequests.test.ts` (in `frontend/`)
Expected: FAIL. `../components/InstructorInvoiceRequests.vue` cannot be resolved.

- [ ] **Step 3: Implement** `frontend/src/components/InstructorInvoiceRequests.vue`:

```vue
<script setup lang="ts">
import Button from 'primevue/button';
import Card from 'primevue/card';
import Message from 'primevue/message';
import {
  type InstructorInvoiceRequestDto,
  type InstructorListItemDto,
  MAX_REQUEST_YEAR,
  MIN_REQUEST_YEAR,
  requestMonth,
} from 'shared';
import { computed, ref, watch } from 'vue';
import { useNotify } from '../composables/useNotify';

type InstructorRow = Pick<InstructorListItemDto, 'id' | 'name'>;

const props = defineProps<{
  instructors: InstructorRow[];
}>();

const notify = useNotify();

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const MONTHS = MONTH_NAMES.map((name, index) => ({ index, name, short: name.slice(0, 3) }));

const today = new Date();
const currentYear = today.getFullYear();
const currentMonthIndex = today.getMonth();

const year = ref(currentYear);
/** "<instructorId>:<YYYY-MM>" of every requested month. */
const requested = ref(new Set<string>());
/** Cells with a save in flight, mapped to the state being saved. */
const pending = ref(new Map<string, boolean>());
const loading = ref(false);
const loadFailed = ref(false);
let loadSequence = 0;

const rows = computed(() =>
  [...props.instructors].sort((a, b) => a.name.localeCompare(b.name, 'de')),
);

function cellKey(instructorId: number, monthIndex: number): string {
  return `${instructorId}:${requestMonth(year.value, monthIndex)}`;
}

function setRequested(key: string, value: boolean) {
  if (value) requested.value.add(key);
  else requested.value.delete(key);
}

function isRequested(instructorId: number, monthIndex: number): boolean {
  return requested.value.has(cellKey(instructorId, monthIndex));
}

function isCurrentMonth(monthIndex: number): boolean {
  return year.value === currentYear && monthIndex === currentMonthIndex;
}

function isCellDisabled(instructorId: number, monthIndex: number): boolean {
  return loading.value || loadFailed.value || pending.value.has(cellKey(instructorId, monthIndex));
}

function cellLabel(instructor: InstructorRow, monthIndex: number): string {
  const state = isRequested(instructor.id, monthIndex) ? 'requested' : 'not requested';
  return `${instructor.name}, ${MONTH_NAMES[monthIndex]} ${year.value}: ${state}`;
}

async function load() {
  const sequence = ++loadSequence;
  loading.value = true;
  loadFailed.value = false;
  try {
    const res = await fetch(`/api/instructor/invoice-requests?year=${year.value}`);
    if (!res.ok) throw new Error('load failed');
    const body = (await res.json()) as InstructorInvoiceRequestDto[];
    if (sequence !== loadSequence) return;
    const next = new Set(body.map((r) => `${r.instructorId}:${r.month}`));
    // A save still in flight wins over a response that may predate it.
    for (const [key, value] of pending.value) {
      if (value) next.add(key);
      else next.delete(key);
    }
    requested.value = next;
  } catch {
    if (sequence !== loadSequence) return;
    requested.value = new Set();
    loadFailed.value = true;
  } finally {
    if (sequence === loadSequence) loading.value = false;
  }
}

async function toggle(instructorId: number, monthIndex: number) {
  if (isCellDisabled(instructorId, monthIndex)) return;
  const month = requestMonth(year.value, monthIndex);
  const key = cellKey(instructorId, monthIndex);
  const value = !requested.value.has(key);
  setRequested(key, value);
  pending.value.set(key, value);
  try {
    const res = await fetch(`/api/instructor/${instructorId}/invoice-requests/${month}`, {
      method: value ? 'PUT' : 'DELETE',
    });
    if (!res.ok) throw new Error('save failed');
  } catch {
    setRequested(key, !value);
    notify.error('Could not save the invoice request');
  } finally {
    pending.value.delete(key);
  }
}

watch(year, load, { immediate: true });
</script>

<template>
  <Card data-testid="invoice-requests">
    <template #title>
      <div class="row row--between">
        <h3 class="section-title">Invoice requests</h3>
        <div class="row gap-xs">
          <Button
            icon="pi pi-chevron-left"
            text
            rounded
            aria-label="Previous year"
            data-testid="previous-year"
            :disabled="year <= MIN_REQUEST_YEAR"
            @click="year--"
          />
          <span class="year" data-testid="request-year">{{ year }}</span>
          <Button
            icon="pi pi-chevron-right"
            text
            rounded
            aria-label="Next year"
            data-testid="next-year"
            :disabled="year >= MAX_REQUEST_YEAR"
            @click="year++"
          />
        </div>
      </div>
    </template>
    <template #content>
      <p v-if="rows.length === 0" class="muted" data-testid="invoice-requests-empty">
        No instructors yet.
      </p>
      <div v-else class="stack gap-sm">
        <Message
          v-if="loadFailed"
          severity="error"
          size="small"
          data-testid="invoice-requests-load-error"
        >
          Invoice requests could not be loaded.
        </Message>
        <div class="matrix-scroll">
          <table class="matrix">
            <thead>
              <tr>
                <th scope="col" class="name-col">Instructor</th>
                <th
                  v-for="month in MONTHS"
                  :key="month.index"
                  scope="col"
                  :title="month.name"
                  :class="{ current: isCurrentMonth(month.index) }"
                >
                  {{ month.short }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="instructor in rows" :key="instructor.id" data-testid="invoice-request-row">
                <th scope="row" class="name-col">{{ instructor.name }}</th>
                <td
                  v-for="month in MONTHS"
                  :key="month.index"
                  :class="{ current: isCurrentMonth(month.index) }"
                >
                  <button
                    type="button"
                    class="cell"
                    :class="{ requested: isRequested(instructor.id, month.index) }"
                    :aria-pressed="isRequested(instructor.id, month.index)"
                    :aria-label="cellLabel(instructor, month.index)"
                    :disabled="isCellDisabled(instructor.id, month.index)"
                    :data-testid="`request-${instructor.id}-${requestMonth(year, month.index)}`"
                    @click="toggle(instructor.id, month.index)"
                  >
                    <i
                      v-if="isRequested(instructor.id, month.index)"
                      class="pi pi-check"
                      aria-hidden="true"
                    />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </Card>
</template>

<style scoped>
.year {
  min-width: 3rem;
  text-align: center;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.matrix-scroll {
  overflow-x: auto;
}

.matrix {
  width: 100%;
  min-width: 44rem;
  border-collapse: separate;
  border-spacing: 0;
}

.matrix th,
.matrix td {
  padding: 0.25rem;
  text-align: center;
  border-bottom: 1px solid var(--p-content-border-color);
}

.matrix thead th {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
}

.matrix .name-col {
  position: sticky;
  left: 0;
  z-index: 1;
  padding-right: 1rem;
  text-align: left;
  white-space: nowrap;
  font-weight: 500;
  color: var(--p-text-color);
  background: var(--p-content-background);
}

.matrix .current {
  background: color-mix(in srgb, var(--p-primary-color) 10%, transparent);
}

.matrix thead th.current {
  color: var(--p-primary-color);
}

.cell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: var(--p-content-border-radius);
  background: transparent;
  cursor: pointer;
}

.cell:hover:not(:disabled) {
  border-color: var(--p-primary-color);
}

.cell:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}

.cell.requested {
  border-color: var(--p-primary-color);
  background: var(--p-primary-color);
  color: var(--p-primary-contrast-color);
}

.cell:disabled {
  cursor: default;
  opacity: 0.6;
}
</style>
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run --config vitest.config.ts src/__tests__/InstructorInvoiceRequests.test.ts src/__tests__/noTailwind.test.ts` (in `frontend/`)
Expected: PASS.

- [ ] **Step 5: Run the checks and commit**

```bash
npm run lint && npm run test:unit && npm run test:integration
git add frontend/src/components/InstructorInvoiceRequests.vue \
  frontend/src/__tests__/InstructorInvoiceRequests.test.ts
git commit -m "feat: add instructor invoice requests matrix" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Show the card on the Instructor Rent page

**Files:**

- Modify: `frontend/src/views/InstructorView.vue`
  - imports: lines 22–32
  - instructors state: lines 39–43
  - `loadInstructors`: lines 67–80
  - template: after `</DataTable>` at line 333
- Test: `frontend/src/__tests__/InstructorView.test.ts`

**Interfaces:**

- Consumes: `InstructorInvoiceRequests` with its prop `instructors` and its test ids `invoice-requests` and `invoice-request-row` (Task 4).
- Produces: nothing new.

- [ ] **Step 1: Write the failing tests** in `frontend/src/__tests__/InstructorView.test.ts`.

In `defaultFetch`, add this as the first line of the function body:

```ts
if (url.startsWith('/api/instructor/invoice-requests')) return Promise.resolve(jsonResponse([]));
```

Add these tests inside `describe('InstructorView', …)`, after `'opens the instructor on row click'`:

```ts
it('shows the invoice requests card below the table with every instructor', async () => {
  const wrapper = await mountView();
  const card = wrapper.find('[data-testid="invoice-requests"]');
  expect(card.exists()).toBe(true);
  expect(card.findAll('[data-testid="invoice-request-row"]')).toHaveLength(2);

  const table = wrapper.find('.p-datatable').element;
  expect(table.compareDocumentPosition(card.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
    Node.DOCUMENT_POSITION_FOLLOWING,
  );
});

it('keeps every instructor in the invoice requests card when the table is filtered', async () => {
  const wrapper = await mountView();
  await wrapper.find('[data-testid="global-search"]').setValue('bach');
  await flushPromises();

  expect(rows(wrapper)).toHaveLength(1);
  expect(wrapper.findAll('[data-testid="invoice-request-row"]')).toHaveLength(2);
});
```

At the end of the existing test `'reports a load error'`, add:

```ts
expect(wrapper.find('[data-testid="invoice-requests"]').exists()).toBe(false);
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run --config vitest.config.ts src/__tests__/InstructorView.test.ts` (in `frontend/`)
Expected: the two new tests FAIL, because the card is missing. `'reports a load error'` still passes.

- [ ] **Step 3: Implement** in `frontend/src/views/InstructorView.vue`.

Add this import after `import InvoiceTextSettings from '../components/InvoiceTextSettings.vue';`:

```ts
import InstructorInvoiceRequests from '../components/InstructorInvoiceRequests.vue';
```

Below `const loadFailed = ref(false);`, add:

```ts
/** The card waits for the first successful load, so it never flashes its empty state. */
const instructorsLoaded = ref(false);
```

In `loadInstructors`, set the flag after a successful load:

```ts
instructors.value = await res.json();
instructorsLoaded.value = true;
```

In the template, add this directly after `</DataTable>`, inside the `.stack` div:

```html
<InstructorInvoiceRequests v-if="instructorsLoaded" :instructors="instructors" />
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run --config vitest.config.ts src/__tests__/InstructorView.test.ts` (in `frontend/`)
Expected: PASS, all tests.

- [ ] **Step 5: Run the checks and commit**

```bash
npm run lint && npm run test:unit && npm run test:integration
git add frontend/src/views/InstructorView.vue frontend/src/__tests__/InstructorView.test.ts
git commit -m "feat: show invoice requests on the instructor rent page" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: E2E smoke test and browser check

**Files:**

- Create: `e2e/tests/instructor-invoice-requests.spec.ts`

**Interfaces:**

- Consumes:
  - `BACKEND_URL` from `e2e/tests/helpers.ts`
  - `POST /api/instructor`, with body `{ recipientData: { name, street, city, email, salutation }, hourlyRateCents, months, timeBlocks }` and response `201 { id }`
  - The cell test id `request-<id>-<YYYY-MM>` (Task 4)
  - `GET /api/instructor/invoice-requests?year=…` (Task 3)

- [ ] **Step 1: Write the spec** at `e2e/tests/instructor-invoice-requests.spec.ts`:

```ts
import { BACKEND_URL } from './helpers';

async function createInstructor(name: string): Promise<number> {
  const res = await fetch(`${BACKEND_URL}/api/instructor`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipientData: {
        name,
        street: 'Hauptstr. 1',
        city: '12345 Berlin',
        email: null,
        salutation: null,
      },
      hourlyRateCents: 1200,
      months: 6,
      timeBlocks: [],
    }),
  });
  if (!res.ok) throw new Error(`Creating the instructor failed (${res.status})`);
  return ((await res.json()) as { id: number }).id;
}

async function requestedMonths(year: number, instructorId: number): Promise<string[]> {
  const res = await fetch(`${BACKEND_URL}/api/instructor/invoice-requests?year=${year}`);
  const rows = (await res.json()) as { instructorId: number; month: string }[];
  return rows.filter((r) => r.instructorId === instructorId).map((r) => r.month);
}

describe('Instructor invoice requests', () => {
  it('keeps a ticked month after reloading the page', async () => {
    const id = await createInstructor('Erika E2E');
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const selector = `[data-testid="request-${id}-${month}"]`;

    await browser.url('/instructor');
    const cell = await $(selector);
    await expect(cell).toBeClickable();
    await expect(cell).toHaveAttribute('aria-pressed', 'false');

    await cell.click();
    await expect(cell).toHaveAttribute('aria-pressed', 'true');
    await browser.waitUntil(
      async () => (await requestedMonths(now.getFullYear(), id)).includes(month),
      { timeout: 5000, timeoutMsg: 'the invoice request was not saved' },
    );

    await browser.refresh();
    await expect($(selector)).toHaveAttribute('aria-pressed', 'true');
  });
});
```

- [ ] **Step 2: Run the spec against throwaway servers on the scratch ports.** This mirrors the CI `e2e` job; never use ports 3000/5173. Start the servers from the repo root with `setsid`, so each can be stopped as a group:

```bash
TMP=$(mktemp -d)
npm run build --workspace=shared && npm run build --workspace=frontend
PORT=3996 DATABASE_URL="file:$TMP/e2e.sqlite" DATA_DIR="$TMP/e2e-data" \
  setsid nohup npm run dev --workspace=backend > "$TMP/backend.log" 2>&1 &
echo "backend pgid $!"
VITE_API_TARGET=http://localhost:3996 \
  setsid nohup npx --workspace=frontend vite preview --port 5179 --strictPort > "$TMP/frontend.log" 2>&1 &
echo "frontend pgid $!"
```

Then run the spec:

```bash
cd e2e && E2E_BACKEND_URL=http://localhost:3996 E2E_FRONTEND_URL=http://localhost:5179 \
  npx wdio run wdio.conf.ts --spec tests/instructor-invoice-requests.spec.ts
```

Expected: 1 passing.

- [ ] **Step 3: Check it in a real browser** while the servers are still up. Use the Playwright MCP, or report the step skipped if it is not available. Navigate to `http://localhost:5179/instructor` and confirm:
  - the card sits below the table;
  - the current month column is highlighted;
  - ticking a cell shows the check;
  - the year switcher works;
  - at a 390 px wide viewport the matrix scrolls inside the card while the name column stays put;
  - the browser console shows no errors.

- [ ] **Step 4: Stop the servers** with `kill -- -<pgid>` for both process groups. Confirm nothing listens on 3996 or 5179 (`ss -ltnp | grep -E ':(3996|5179)'` prints nothing), then run `rm -rf "$TMP"`.

- [ ] **Step 5: Run the checks and commit**

```bash
npm run lint && npm run test:unit && npm run test:integration
git add e2e/tests/instructor-invoice-requests.spec.ts
git commit -m "test: add e2e smoke test for instructor invoice requests" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
