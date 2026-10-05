# Invoice Drafts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users save invoices as drafts (no number, no revision, no PDF, not sendable) and activate them later, at which point they become normal invoices dated at the moment of activation.

**Architecture:** A separate `InvoiceDraft` Prisma model and `/api/invoice-draft` router hold drafts, so no existing invoice code path can ever see one. Invoice creation (number + `Invoice` + revision 1) and recipient create/update-in-place are extracted from `POST /api/invoice` into `services/invoiceCreation.ts` and reused by draft activation. The frontend reuses `InvoiceFormView` with a draft mode and adds a "Drafts" section above the invoice list.

**Tech Stack:** Express 4 + Prisma 7 (SQLite, better-sqlite3 adapter), Vue 3 `<script setup>` + Pinia, Vitest (+ supertest for backend integration, Vue Test Utils + jsdom for frontend).

**Spec:** `docs/superpowers/specs/2026-10-05-invoice-drafts-design.md`

## Global Constraints

- After every task run: `npm run lint && npm run test:unit && npm run test:integration` (from repo root). All must pass with zero warnings.
- Commit messages follow Conventional Commits (commitlint is enforced by a husky hook). End each commit message with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Formatting: Prettier (`singleQuote`, `trailingComma: all`, `printWidth: 100`, semicolons). Run `npm run lint:fix` if lint fails on formatting.
- A draft never creates an `Invoice`, an `InvoiceRevision`, an invoice number, or a PDF.
- Invoice number is assigned on activation only. Invoice date on activation is `new Date()` on the server; any `invoiceDate` sent to draft endpoints is ignored.
- Every draft save (POST/PUT) creates or updates the linked `InvoiceRecipient` in place.
- Draft save requires only `name`. Full `validateRequiredFields` runs on activation.
- Drafts can be edited, activated, or hard-deleted. No cancel.
- UI copy is English (matches the existing UI).
- Express 4 does not catch rejected promises from async handlers: every expected error must be turned into a response explicitly, never thrown out of a handler.

## Review Focus

1. **Enter key in a draft form** — pressing Enter in any input submits the `<form>`; in draft mode this must save the draft, never call `POST /api/invoice` (which would issue a real invoice). Test: Task 5, "form submit in draft mode saves the draft".
2. **Double-click / concurrent activation** — two activate requests for the same draft must produce exactly one invoice; the other gets 404, not a crash or a hanging request. Test: Task 3, "concurrent activation creates exactly one invoice".
3. **Draft created last year, activated this year** — the invoice must get this year's number sequence and today's date, not anything derived from the draft's `createdAt`. Test: Task 3, "draft created in a previous year gets current-year number and today's date".
4. **Drafts must not leak into invoice selection** — "select all" / batch download in the invoice list must only cover invoices, never draft ids. Test: Task 4, "select all ignores drafts".
5. **Opening a draft URL that no longer exists** (deleted or already activated, e.g. via browser back) — the form must show "Draft not found" instead of an empty form that could be saved as a new draft or invoice. Test: Task 5, "shows an error when the draft does not exist".

---

## File Map

| File | Change | Responsibility |
|------|--------|----------------|
| `backend/src/services/invoiceCreation.ts` | Create | `validateRequiredFields`, `calculateGross`, `saveRecipient`, `createInvoiceWithFirstRevision`, `RecipientError` |
| `backend/src/services/invoicePdf.ts` | Create | `attemptInvoicePdfGeneration` (moved from `routes/invoice.ts`) |
| `backend/src/services/invoiceNumber.ts` | Modify | accept a transaction client |
| `backend/src/routes/invoice.ts` | Modify | use the extracted services |
| `backend/src/routes/invoiceDraft.ts` | Create | draft CRUD + activate |
| `backend/src/routes/index.ts` | Modify | mount router; e2e reset deletes drafts |
| `backend/prisma/schema.prisma` + new migration | Modify/Create | `InvoiceDraft` model |
| `shared/src/index.ts` | Modify | `InvoiceContent`, `InvoiceDraftDto`, `InvoiceDraftListItem` |
| `backend/src/__tests__/integration/helpers.ts` | Modify | clean `invoiceDraft` table |
| `backend/src/__tests__/integration/invoice.test.ts` | Modify | POST success/recipient tests |
| `backend/src/__tests__/integration/invoiceDraft.test.ts` | Create | draft endpoint tests |
| `backend/src/__tests__/unit/invoiceCreation.test.ts` | Create | validation/gross unit tests |
| `frontend/src/views/InvoiceView.vue` | Modify | Drafts section |
| `frontend/src/__tests__/InvoiceView.test.ts` | Modify | Drafts section tests |
| `frontend/src/views/InvoiceFormView.vue` | Modify | draft mode, Save as draft |
| `frontend/src/router/index.ts` | Modify | `/invoice/draft/:draftId` route |
| `frontend/src/__tests__/InvoiceFormView.test.ts` | Create | draft mode tests |

---

### Task 1: Extract invoice creation into services

Pure refactor of `POST /api/invoice` plus a bug fix: an unknown `recipientId` currently throws inside the transaction and leaves the request hanging; it must return 400.

**Files:**
- Create: `backend/src/services/invoiceCreation.ts`
- Create: `backend/src/services/invoicePdf.ts`
- Modify: `backend/src/services/invoiceNumber.ts`
- Modify: `backend/src/routes/invoice.ts`
- Modify: `shared/src/index.ts`
- Test: `backend/src/__tests__/integration/invoice.test.ts`, `backend/src/__tests__/unit/invoiceCreation.test.ts` (create)

**Interfaces:**
- Consumes: nothing new.
- Produces (used by Tasks 2 and 3):
  - `shared`: `export type InvoiceContent = Omit<InvoiceInputs, 'invoiceDate'>;`
  - `services/invoiceCreation.ts`:
    - `class RecipientError extends Error`
    - `interface RecipientData { name: string; street: string; city: string; email?: string; salutation?: string }`
    - `interface RecipientSelection { recipientId?: number; recipientData?: RecipientData }`
    - `validateRequiredFields(inputs: InvoiceContent): string | null`
    - `calculateGross(positionsJson: string, vat: number): number`
    - `saveRecipient(tx: Prisma.TransactionClient, selection: RecipientSelection, inputs: InvoiceContent): Promise<number>` — returns recipient id; throws `RecipientError('Recipient not found' | 'No recipient specified')`
    - `createInvoiceWithFirstRevision(tx: Prisma.TransactionClient, params: { recipientId: number; inputs: InvoiceContent; invoiceDate: Date; templateId: number }): Promise<{ invoice: Invoice; revision: InvoiceRevision }>`
  - `services/invoicePdf.ts`: `attemptInvoicePdfGeneration(revisionId: number): Promise<{ pdfStatus: 'OK' | 'FAILED'; pdfError: string | null; pdfTechError: string | null; filePath: string | null }>`
  - `services/invoiceNumber.ts`: `generateInvoiceNumber(prisma: Prisma.TransactionClient)`

- [ ] **Step 1: Write the failing integration tests for `POST /api/invoice`**

In `backend/src/__tests__/integration/invoice.test.ts`, add these tests inside the existing `describe('POST /api/invoice', ...)` block, after `'returns 400 with empty line items'`:

```ts
  it('creates an invoice with a new recipient, number and revision 1', async () => {
    await seedTemplate();
    const year = new Date().getFullYear();

    const res = await request.post('/api/invoice').send({
      recipientData: { name: 'Neue Firma', street: 'Weg 1', city: 'Stadt', email: 'n@example.com' },
      inputs: { ...gInputs, name: 'Neue Firma', street: 'Weg 1', city: 'Stadt' },
    });

    expect(res.status).toBe(201);
    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: res.body.invoiceId },
      include: { revisions: true, recipient: true },
    });
    expect(invoice.number).toBe(`1 / ${year}`);
    expect(invoice.recipient.name).toBe('Neue Firma');
    expect(invoice.revisions).toHaveLength(1);
    expect(invoice.revisions[0]).toMatchObject({
      revisionNumber: 1,
      title: 'Test Rechnung',
      name: 'Neue Firma',
    });
  });

  it('updates an existing recipient in place when recipientId is given', async () => {
    await seedTemplate();
    const recipient = await prisma.invoiceRecipient.create({
      data: { name: 'Alt', street: 'Alt 1', city: 'Altstadt' },
    });

    const res = await request.post('/api/invoice').send({
      recipientId: recipient.id,
      inputs: { ...gInputs, name: 'Neu', street: 'Neu 2', city: 'Neustadt' },
    });

    expect(res.status).toBe(201);
    expect(await prisma.invoiceRecipient.count()).toBe(1);
    const updated = await prisma.invoiceRecipient.findUniqueOrThrow({
      where: { id: recipient.id },
    });
    expect(updated).toMatchObject({ name: 'Neu', street: 'Neu 2', city: 'Neustadt' });
  });

  it('returns 400 for an unknown recipientId', async () => {
    await seedTemplate();
    const res = await request.post('/api/invoice').send({ recipientId: 99999, inputs: gInputs });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Recipient not found');
    expect(await prisma.invoice.count()).toBe(0);
  });
```

- [ ] **Step 2: Write the failing unit tests**

Create `backend/src/__tests__/unit/invoiceCreation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { calculateGross, validateRequiredFields } from '../../services/invoiceCreation';

const valid = {
  salutation: '',
  name: 'Firma',
  street: 'Weg 1',
  city: 'Stadt',
  title: 'Titel',
  lineItems: [{ text: 'Pos', priceInCents: 1000 }],
  vat: 19,
  directDebit: false,
  email: '',
  emailSalutation: '',
};

describe('validateRequiredFields', () => {
  it('accepts complete inputs', () => {
    expect(validateRequiredFields(valid)).toBeNull();
  });

  it('requires a street', () => {
    expect(validateRequiredFields({ ...valid, street: ' ' })).toBe('Street is required');
  });

  it('requires a positive price per line item', () => {
    expect(
      validateRequiredFields({ ...valid, lineItems: [{ text: 'Pos', priceInCents: 0 }] }),
    ).toBe('Line item 1: Price must be greater than 0');
  });

  it('only allows 7% or 19% VAT', () => {
    expect(validateRequiredFields({ ...valid, vat: 16 })).toBe('VAT must be 7% or 19%');
  });
});

describe('calculateGross', () => {
  it('adds rounded VAT to the net sum', () => {
    const positions = JSON.stringify([
      { text: 'A', priceInCents: 1000 },
      { text: 'B', priceInCents: 2000 },
    ]);
    expect(calculateGross(positions, 19)).toBe(3570);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test:unit --workspace=backend -- invoiceCreation`
Expected: FAIL — cannot resolve `../../services/invoiceCreation`.

Run: `npm run test:integration --workspace=backend -- invoice.test`
Expected: the two "creates"/"updates" tests PASS already (existing behavior); `'returns 400 for an unknown recipientId'` FAILS (times out after 30s because the handler's promise rejects and Express 4 never responds).

- [ ] **Step 4: Add `InvoiceContent` to shared types**

In `shared/src/index.ts`, directly after the `InvoiceInputs` interface, add:

```ts
/** Invoice fields without the invoice date (drafts get their date on activation). */
export type InvoiceContent = Omit<InvoiceInputs, 'invoiceDate'>;
```

- [ ] **Step 5: Let `generateInvoiceNumber` run inside a transaction**

Replace the whole of `backend/src/services/invoiceNumber.ts` with:

```ts
import type { Prisma } from '../../prisma/generated/client.js';

export async function generateInvoiceNumber(
  prisma: Prisma.TransactionClient,
): Promise<{ number: string; year: number; runningNumber: number }> {
  const year = new Date().getFullYear();

  const lastInvoice = await prisma.invoice.findFirst({
    where: { year },
    orderBy: { runningNumber: 'desc' },
  });

  const runningNumber = lastInvoice ? lastInvoice.runningNumber + 1 : 1;
  const number = `${runningNumber} / ${year}`;

  return { number, year, runningNumber };
}
```

- [ ] **Step 6: Create `backend/src/services/invoiceCreation.ts`**

```ts
import type { InvoiceContent, InvoiceLineItem } from 'shared';
import type { Prisma } from '../../prisma/generated/client.js';
import { generateInvoiceNumber } from './invoiceNumber.js';

export class RecipientError extends Error {}

export interface RecipientData {
  name: string;
  street: string;
  city: string;
  email?: string;
  salutation?: string;
}

export interface RecipientSelection {
  recipientId?: number;
  recipientData?: RecipientData;
}

export function validateRequiredFields(inputs: InvoiceContent): string | null {
  if (!inputs.name.trim()) return 'Name is required';
  if (!inputs.street.trim()) return 'Street is required';
  if (!inputs.city.trim()) return 'City is required';
  if (!inputs.title.trim()) return 'Title is required';
  if (!inputs.lineItems || inputs.lineItems.length === 0) {
    return 'At least one line item is required';
  }
  for (let i = 0; i < inputs.lineItems.length; i++) {
    if (!inputs.lineItems[i].text.trim()) {
      return `Line item ${i + 1}: Text is required`;
    }
    if (inputs.lineItems[i].priceInCents <= 0) {
      return `Line item ${i + 1}: Price must be greater than 0`;
    }
  }
  if (inputs.vat !== 7 && inputs.vat !== 19) {
    return 'VAT must be 7% or 19%';
  }
  return null;
}

export function calculateGross(positionsJson: string, vat: number): number {
  const lineItems: InvoiceLineItem[] = JSON.parse(positionsJson);
  const net = lineItems.reduce((sum, p) => sum + p.priceInCents, 0);
  const tax = Math.round(net * (vat / 100));
  return net + tax;
}

/**
 * Updates the selected recipient in place from the form inputs, or creates a
 * new one from recipientData. Returns the recipient id.
 */
export async function saveRecipient(
  tx: Prisma.TransactionClient,
  selection: RecipientSelection,
  inputs: InvoiceContent,
): Promise<number> {
  if (selection.recipientId) {
    const existing = await tx.invoiceRecipient.findUnique({
      where: { id: selection.recipientId },
    });
    if (!existing) {
      throw new RecipientError('Recipient not found');
    }

    await tx.invoiceRecipient.update({
      where: { id: selection.recipientId },
      data: {
        name: inputs.name,
        street: inputs.street,
        city: inputs.city,
        email: inputs.email || null,
        salutation: inputs.salutation || null,
      },
    });
    return selection.recipientId;
  }

  if (!selection.recipientData) {
    throw new RecipientError('No recipient specified');
  }

  const created = await tx.invoiceRecipient.create({
    data: {
      name: selection.recipientData.name,
      street: selection.recipientData.street,
      city: selection.recipientData.city,
      email: selection.recipientData.email || null,
      salutation: selection.recipientData.salutation || null,
    },
  });
  return created.id;
}

export async function createInvoiceWithFirstRevision(
  tx: Prisma.TransactionClient,
  params: { recipientId: number; inputs: InvoiceContent; invoiceDate: Date; templateId: number },
) {
  const { recipientId, inputs, invoiceDate, templateId } = params;
  const { number, year, runningNumber } = await generateInvoiceNumber(tx);

  const invoice = await tx.invoice.create({
    data: { number, year, runningNumber, recipientId, invoiceDate },
  });

  const revision = await tx.invoiceRevision.create({
    data: {
      invoiceId: invoice.id,
      revisionNumber: 1,
      salutation: inputs.salutation,
      name: inputs.name,
      street: inputs.street,
      city: inputs.city,
      invoiceDate,
      title: inputs.title,
      positions: JSON.stringify(inputs.lineItems),
      vat: inputs.vat,
      directDebit: inputs.directDebit,
      email: inputs.email,
      emailSalutation: inputs.emailSalutation,
      templateId,
      pdfStatus: 'PENDING',
    },
  });

  return { invoice, revision };
}
```

- [ ] **Step 7: Create `backend/src/services/invoicePdf.ts`**

Move `PDF_ERROR_MESSAGE`, `updateRevisionPdfStatus`, `serializeTechnicalError` and `attemptPdfGeneration` out of `backend/src/routes/invoice.ts` into this file, renaming the exported function:

```ts
import type { PdfStatus } from 'shared';
import { prisma } from '../prismaClient.js';
import { generateInvoicePdf } from './pdfGeneration.js';

const PDF_ERROR_MESSAGE = 'PDF could not be generated. Please try retry.';

async function updateRevisionPdfStatus(
  revisionId: number,
  update: {
    pdfStatus: PdfStatus;
    filePath?: string | null;
    pdfError?: string | null;
    pdfTechError?: string | null;
  },
) {
  await prisma.invoiceRevision.update({
    where: { id: revisionId },
    data: {
      pdfStatus: update.pdfStatus,
      ...(update.filePath !== undefined && { filePath: update.filePath }),
      ...(update.pdfError !== undefined && { pdfError: update.pdfError }),
      ...(update.pdfTechError !== undefined && { pdfTechError: update.pdfTechError }),
    },
  });
}

function serializeTechnicalError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack || `${error.name}: ${error.message}`;
  }
  return String(error);
}

export async function attemptInvoicePdfGeneration(revisionId: number) {
  try {
    const filePath = await generateInvoicePdf(prisma, revisionId);
    await updateRevisionPdfStatus(revisionId, {
      pdfStatus: 'OK',
      filePath,
      pdfError: null,
      pdfTechError: null,
    });
    return {
      pdfStatus: 'OK' as const,
      pdfError: null,
      pdfTechError: null,
      filePath,
    };
  } catch (error) {
    await updateRevisionPdfStatus(revisionId, {
      pdfStatus: 'FAILED',
      filePath: null,
      pdfError: PDF_ERROR_MESSAGE,
      pdfTechError: serializeTechnicalError(error),
    });

    const failed = await prisma.invoiceRevision.findUniqueOrThrow({
      where: { id: revisionId },
      select: { pdfError: true, pdfTechError: true },
    });

    return {
      pdfStatus: 'FAILED' as const,
      pdfError: failed.pdfError,
      pdfTechError: failed.pdfTechError,
      filePath: null,
    };
  }
}
```

- [ ] **Step 8: Rewire `backend/src/routes/invoice.ts`**

1. Delete from `routes/invoice.ts`: `PDF_ERROR_MESSAGE`, `validateRequiredFields`, `calculateGross`, `updateRevisionPdfStatus`, `serializeTechnicalError`, `attemptPdfGeneration`. Keep `runningRetries` and `revisionToDto`.
2. Replace the imports of `generateInvoiceNumber` and `generateInvoicePdf` with:

```ts
import {
  calculateGross,
  createInvoiceWithFirstRevision,
  RecipientError,
  saveRecipient,
  validateRequiredFields,
  type RecipientSelection,
} from '../services/invoiceCreation.js';
import { attemptInvoicePdfGeneration } from '../services/invoicePdf.js';
```

   Remove `PdfStatus` from the `shared` import if it becomes unused (it is still used by `revisionToDto` — keep it if so; `npm run lint` tells you).
3. Replace every remaining call `attemptPdfGeneration(` with `attemptInvoicePdfGeneration(` (retry-pdf route and `POST /:id/revision`).
4. Replace the whole `POST /api/invoice` handler (the `invoiceRouter.post('/', ...)` block that ends right before `// POST /api/invoice/:id/revision`) with:

```ts
// POST /api/invoice
invoiceRouter.post('/', async (req, res) => {
  const body = req.body as RecipientSelection & { inputs: InvoiceInputs };

  const validationError = validateRequiredFields(body.inputs);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  const invoiceTemplate = await prisma.template.findFirst({
    where: { type: 'RECHNUNG', active: true },
  });
  if (!invoiceTemplate) {
    res.status(400).json({ error: 'No active invoice template found' });
    return;
  }

  const invoiceDate = body.inputs.invoiceDate ? new Date(body.inputs.invoiceDate) : new Date();

  const result = await prisma
    .$transaction(async (tx: Prisma.TransactionClient) => {
      const recipientId = await saveRecipient(tx, body, body.inputs);
      const { invoice, revision } = await createInvoiceWithFirstRevision(tx, {
        recipientId,
        inputs: body.inputs,
        invoiceDate,
        templateId: invoiceTemplate.id,
      });
      const recipient = await tx.invoiceRecipient.findUniqueOrThrow({
        where: { id: recipientId },
      });
      return { invoice, revision, recipient };
    })
    .catch((err: unknown) => {
      if (err instanceof RecipientError) return err;
      throw err;
    });
  if (result instanceof RecipientError) {
    res.status(400).json({ error: result.message });
    return;
  }

  // Start PDF generation in background – do NOT await, as libreoffice can be slow
  attemptInvoicePdfGeneration(result.revision.id).catch(() => {
    // PDF generation errors are already persisted to the DB inside attemptInvoicePdfGeneration
  });

  res.status(201).json({
    invoiceId: result.invoice.id,
    revisionId: result.revision.id,
    recipient: result.recipient,
    recipientUpdated: true,
    pdfStatus: 'PENDING' as const,
    pdfError: null,
    pdfTechError: null,
    filePath: null,
  });
});
```

   Check the original handler's leading comment line (e.g. `// POST /api/invoice`) so you don't duplicate it.

- [ ] **Step 9: Run tests to verify they pass**

Run: `npm run test:unit --workspace=backend && npm run test:integration --workspace=backend`
Expected: all PASS, including the three new `POST /api/invoice` tests and the new unit tests. `invoiceNumber.test.ts` still passes (it passes a mock `as never`).

- [ ] **Step 10: Full verification**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: all PASS, zero warnings.

- [ ] **Step 11: Commit**

```bash
git add shared/src/index.ts backend/src/services/invoiceCreation.ts backend/src/services/invoicePdf.ts backend/src/services/invoiceNumber.ts backend/src/routes/invoice.ts backend/src/__tests__/integration/invoice.test.ts backend/src/__tests__/unit/invoiceCreation.test.ts
git commit -m "refactor: extract invoice creation and PDF generation into services

Also return 400 instead of hanging for an unknown recipientId.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: InvoiceDraft model and CRUD endpoints

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<timestamp>_add_invoice_draft/migration.sql` (generated)
- Modify: `shared/src/index.ts`
- Create: `backend/src/routes/invoiceDraft.ts`
- Modify: `backend/src/routes/index.ts`
- Modify: `backend/src/__tests__/integration/helpers.ts`
- Test: `backend/src/__tests__/integration/invoiceDraft.test.ts` (create)

**Interfaces:**
- Consumes (Task 1): `InvoiceContent`, `RecipientSelection`, `RecipientError`, `saveRecipient`, `calculateGross` from `services/invoiceCreation.ts`.
- Produces:
  - Prisma model `InvoiceDraft` (`prisma.invoiceDraft`)
  - `shared`: `InvoiceDraftDto`, `InvoiceDraftListItem` (below)
  - `routes/invoiceDraft.ts`: `export const invoiceDraftRouter`, and module-local helpers `parseId(raw: string): number | null` and `draftToContent(draft: InvoiceDraft): InvoiceContent` that Task 3 uses in the same file.
  - HTTP: `GET /api/invoice-draft` → `InvoiceDraftListItem[]`; `GET /api/invoice-draft/:id` → `InvoiceDraftDto`; `POST /api/invoice-draft` → `201 { draftId: number }`; `PUT /api/invoice-draft/:id` → `200 { draftId: number }`; `DELETE /api/invoice-draft/:id` → `204`. Errors: `400 { error: 'Invalid ID' | 'Name is required' | 'Recipient not found' | 'No recipient specified' }`, `404 { error: 'Draft not found' }`.

- [ ] **Step 1: Add the Prisma model**

In `backend/prisma/schema.prisma`, add `invoiceDrafts InvoiceDraft[]` to `model InvoiceRecipient` (below `invoices  Invoice[]`), and add after `model InvoiceRevision`:

```prisma
model InvoiceDraft {
  id              Int              @id @default(autoincrement())
  recipientId     Int
  recipient       InvoiceRecipient @relation(fields: [recipientId], references: [id])
  salutation      String
  name            String
  street          String
  city            String
  title           String
  positions       String
  vat             Int
  directDebit     Boolean
  email           String
  emailSalutation String
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt
}
```

- [ ] **Step 2: Generate the migration against a scratch database**

Run (from `backend/`, so the dev DB is not touched):

```bash
cd backend && DATABASE_URL=file:./prisma/migrate-scratch.sqlite npx prisma migrate dev --name add_invoice_draft --config prisma.test.config.ts && rm -f prisma/migrate-scratch.sqlite prisma/migrate-scratch.sqlite-journal && cd ..
```

Expected: a new folder `backend/prisma/migrations/<timestamp>_add_invoice_draft/` whose `migration.sql` contains `CREATE TABLE "InvoiceDraft"` with a `"recipientId" INTEGER NOT NULL` column, `"updatedAt" DATETIME NOT NULL`, and `CONSTRAINT "InvoiceDraft_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "InvoiceRecipient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE`. It must not alter any other table. `git status` must show no `.sqlite` files.

- [ ] **Step 3: Add shared types**

In `shared/src/index.ts`, after `InvoiceDto`, add:

```ts
export interface InvoiceDraftDto {
  id: number;
  recipient: InvoiceRecipientDto;
  inputs: InvoiceContent;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceDraftListItem {
  id: number;
  recipientName: string;
  title: string;
  amountCents: number;
  updatedAt: string;
}
```

- [ ] **Step 4: Clean the draft table between integration tests and in the e2e reset**

In `backend/src/__tests__/integration/helpers.ts`, add `await prisma.invoiceDraft.deleteMany();` as the **first** line of `cleanDatabase()` (it must run before `invoiceRecipient.deleteMany()` because of the foreign key).

In `backend/src/routes/index.ts`, inside `router.post('/e2e/reset', ...)`, add `await prisma.invoiceDraft.deleteMany();` directly before `await prisma.invoiceRecipient.deleteMany();`.

- [ ] **Step 5: Write the failing integration tests**

Create `backend/src/__tests__/integration/invoiceDraft.test.ts`:

```ts
import supertest from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { initializeApp } from '../../init';
import { prisma } from '../../prismaClient';
import { useCleanDatabase } from './helpers';

let request: ReturnType<typeof supertest>;

beforeAll(async () => {
  await initializeApp();
  request = supertest(createApp());
});

useCleanDatabase();

async function seedTemplate() {
  return prisma.template.create({
    data: {
      type: 'RECHNUNG',
      version: 1,
      fileName: 'template.docx',
      filePath: 'templates/template.docx',
      active: true,
    },
  });
}

const completeInputs = {
  salutation: 'Herr',
  name: 'Draft Firma',
  street: 'Draftweg 1',
  city: 'Draftstadt',
  invoiceDate: '2020-01-01',
  title: 'Draft Rechnung',
  lineItems: [
    { text: 'Pos A', priceInCents: 1000 },
    { text: 'Pos B', priceInCents: 2000 },
  ],
  vat: 19,
  directDebit: false,
  email: 'draft@example.com',
  emailSalutation: 'Sehr geehrter Herr',
};

const nameOnlyInputs = {
  salutation: '',
  name: 'Nur Name',
  street: '',
  city: '',
  invoiceDate: '',
  title: '',
  lineItems: [{ text: '', priceInCents: 0 }],
  vat: 19,
  directDebit: false,
  email: '',
  emailSalutation: '',
};

async function createDraft(inputs = completeInputs) {
  const res = await request.post('/api/invoice-draft').send({
    recipientData: {
      name: inputs.name,
      street: inputs.street,
      city: inputs.city,
      email: inputs.email,
      salutation: inputs.salutation,
    },
    inputs,
  });
  expect(res.status).toBe(201);
  return res.body.draftId as number;
}

describe('POST /api/invoice-draft', () => {
  it('creates a draft and a new recipient from recipientData', async () => {
    const draftId = await createDraft();

    const draft = await prisma.invoiceDraft.findUniqueOrThrow({
      where: { id: draftId },
      include: { recipient: true },
    });
    expect(draft).toMatchObject({
      name: 'Draft Firma',
      title: 'Draft Rechnung',
      vat: 19,
      email: 'draft@example.com',
    });
    expect(JSON.parse(draft.positions)).toEqual(completeInputs.lineItems);
    expect(draft.recipient).toMatchObject({
      name: 'Draft Firma',
      street: 'Draftweg 1',
      city: 'Draftstadt',
    });
  });

  it('accepts an incomplete draft with only a name', async () => {
    const draftId = await createDraft(nameOnlyInputs);
    const draft = await prisma.invoiceDraft.findUniqueOrThrow({ where: { id: draftId } });
    expect(draft.name).toBe('Nur Name');
    expect(draft.street).toBe('');
  });

  it('updates an existing recipient in place when recipientId is given', async () => {
    const recipient = await prisma.invoiceRecipient.create({
      data: { name: 'Alt', street: 'Alt 1', city: 'Altstadt' },
    });

    const res = await request
      .post('/api/invoice-draft')
      .send({ recipientId: recipient.id, inputs: completeInputs });

    expect(res.status).toBe(201);
    expect(await prisma.invoiceRecipient.count()).toBe(1);
    const updated = await prisma.invoiceRecipient.findUniqueOrThrow({
      where: { id: recipient.id },
    });
    expect(updated).toMatchObject({
      name: 'Draft Firma',
      street: 'Draftweg 1',
      city: 'Draftstadt',
      email: 'draft@example.com',
      salutation: 'Herr',
    });
  });

  it('returns 400 without a name', async () => {
    const res = await request.post('/api/invoice-draft').send({
      recipientData: { name: ' ', street: '', city: '' },
      inputs: { ...nameOnlyInputs, name: ' ' },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Name is required');
    expect(await prisma.invoiceDraft.count()).toBe(0);
  });

  it('returns 400 for an unknown recipientId', async () => {
    const res = await request
      .post('/api/invoice-draft')
      .send({ recipientId: 99999, inputs: completeInputs });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Recipient not found');
    expect(await prisma.invoiceDraft.count()).toBe(0);
  });

  it('creates no invoice, no revision and does not consume an invoice number', async () => {
    await seedTemplate();
    await createDraft();

    expect(await prisma.invoice.count()).toBe(0);
    expect(await prisma.invoiceRevision.count()).toBe(0);

    const res = await request.post('/api/invoice').send({
      recipientData: { name: 'X', street: 'Y', city: 'Z' },
      inputs: { ...completeInputs, name: 'X', street: 'Y', city: 'Z' },
    });
    expect(res.status).toBe(201);
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: res.body.invoiceId } });
    expect(invoice.number).toBe(`1 / ${new Date().getFullYear()}`);
  });
});

describe('GET /api/invoice-draft', () => {
  it('returns an empty list when there are no drafts', async () => {
    const res = await request.get('/api/invoice-draft');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('lists drafts newest-edited first with gross amount', async () => {
    const first = await createDraft();
    const second = await createDraft({ ...completeInputs, title: 'Zweiter' });
    await prisma.invoiceDraft.update({
      where: { id: first },
      data: { updatedAt: new Date(Date.now() + 60_000) },
    });

    const res = await request.get('/api/invoice-draft');
    expect(res.status).toBe(200);
    expect(res.body.map((d: { id: number }) => d.id)).toEqual([first, second]);
    expect(res.body[0]).toMatchObject({
      id: first,
      recipientName: 'Draft Firma',
      title: 'Draft Rechnung',
      amountCents: 3570,
    });
    expect(typeof res.body[0].updatedAt).toBe('string');
  });
});

describe('GET /api/invoice-draft/:id', () => {
  it('returns the draft with recipient and inputs without invoiceDate', async () => {
    const draftId = await createDraft();
    const res = await request.get(`/api/invoice-draft/${draftId}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(draftId);
    expect(res.body.recipient).toMatchObject({ name: 'Draft Firma', street: 'Draftweg 1' });
    expect(res.body.inputs).toEqual({
      salutation: 'Herr',
      name: 'Draft Firma',
      street: 'Draftweg 1',
      city: 'Draftstadt',
      title: 'Draft Rechnung',
      lineItems: completeInputs.lineItems,
      vat: 19,
      directDebit: false,
      email: 'draft@example.com',
      emailSalutation: 'Sehr geehrter Herr',
    });
  });

  it('returns 404 for a missing draft', async () => {
    const res = await request.get('/api/invoice-draft/99999');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Draft not found');
  });

  it('returns 400 for an invalid id', async () => {
    const res = await request.get('/api/invoice-draft/abc');
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/invoice-draft/:id', () => {
  it('updates the draft and the linked recipient in place', async () => {
    const draftId = await createDraft();
    const draft = await prisma.invoiceDraft.findUniqueOrThrow({ where: { id: draftId } });

    const res = await request.put(`/api/invoice-draft/${draftId}`).send({
      recipientId: draft.recipientId,
      inputs: { ...completeInputs, name: 'Umbenannt', title: 'Neuer Titel' },
    });

    expect(res.status).toBe(200);
    expect(res.body.draftId).toBe(draftId);
    const updated = await prisma.invoiceDraft.findUniqueOrThrow({ where: { id: draftId } });
    expect(updated).toMatchObject({ name: 'Umbenannt', title: 'Neuer Titel' });
    const recipient = await prisma.invoiceRecipient.findUniqueOrThrow({
      where: { id: draft.recipientId },
    });
    expect(recipient.name).toBe('Umbenannt');
    expect(await prisma.invoiceRecipient.count()).toBe(1);
  });

  it('returns 404 for a missing draft', async () => {
    const recipient = await prisma.invoiceRecipient.create({
      data: { name: 'R', street: 'S', city: 'C' },
    });
    const res = await request
      .put('/api/invoice-draft/99999')
      .send({ recipientId: recipient.id, inputs: completeInputs });
    expect(res.status).toBe(404);
  });

  it('returns 400 without a name', async () => {
    const draftId = await createDraft();
    const draft = await prisma.invoiceDraft.findUniqueOrThrow({ where: { id: draftId } });
    const res = await request
      .put(`/api/invoice-draft/${draftId}`)
      .send({ recipientId: draft.recipientId, inputs: { ...completeInputs, name: '' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Name is required');
  });
});

describe('DELETE /api/invoice-draft/:id', () => {
  it('deletes the draft and keeps the recipient', async () => {
    const draftId = await createDraft();

    const res = await request.delete(`/api/invoice-draft/${draftId}`);

    expect(res.status).toBe(204);
    expect(await prisma.invoiceDraft.count()).toBe(0);
    expect(await prisma.invoiceRecipient.count()).toBe(1);
  });

  it('returns 404 for a missing draft', async () => {
    const res = await request.delete('/api/invoice-draft/99999');
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npm run test:integration --workspace=backend -- invoiceDraft`
Expected: FAIL — requests to `/api/invoice-draft` return 404 (router not mounted).

- [ ] **Step 7: Implement the router**

Create `backend/src/routes/invoiceDraft.ts`:

```ts
import { Router } from 'express';
import type {
  InvoiceContent,
  InvoiceDraftDto,
  InvoiceDraftListItem,
  InvoiceLineItem,
} from 'shared';
import type { InvoiceDraft, Prisma } from '../../prisma/generated/client.js';
import { prisma } from '../prismaClient.js';
import {
  calculateGross,
  RecipientError,
  saveRecipient,
  type RecipientSelection,
} from '../services/invoiceCreation.js';

export const invoiceDraftRouter = Router();

type DraftBody = RecipientSelection & { inputs: InvoiceContent };

function parseId(raw: string): number | null {
  const id = parseInt(raw);
  return isNaN(id) ? null : id;
}

function draftToContent(draft: InvoiceDraft): InvoiceContent {
  return {
    salutation: draft.salutation,
    name: draft.name,
    street: draft.street,
    city: draft.city,
    title: draft.title,
    lineItems: JSON.parse(draft.positions) as InvoiceLineItem[],
    vat: draft.vat,
    directDebit: draft.directDebit,
    email: draft.email,
    emailSalutation: draft.emailSalutation,
  };
}

function contentToDraftData(inputs: InvoiceContent) {
  return {
    salutation: inputs.salutation,
    name: inputs.name,
    street: inputs.street,
    city: inputs.city,
    title: inputs.title,
    positions: JSON.stringify(inputs.lineItems),
    vat: inputs.vat,
    directDebit: inputs.directDebit,
    email: inputs.email,
    emailSalutation: inputs.emailSalutation,
  };
}

// GET /api/invoice-draft
invoiceDraftRouter.get('/', async (_req, res) => {
  const drafts = await prisma.invoiceDraft.findMany({ orderBy: { updatedAt: 'desc' } });
  const items: InvoiceDraftListItem[] = drafts.map((d) => ({
    id: d.id,
    recipientName: d.name,
    title: d.title,
    amountCents: calculateGross(d.positions, d.vat),
    updatedAt: d.updatedAt.toISOString(),
  }));
  res.json(items);
});

// GET /api/invoice-draft/:id
invoiceDraftRouter.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: 'Invalid ID' });
    return;
  }

  const draft = await prisma.invoiceDraft.findUnique({
    where: { id },
    include: { recipient: true },
  });
  if (!draft) {
    res.status(404).json({ error: 'Draft not found' });
    return;
  }

  const dto: InvoiceDraftDto = {
    id: draft.id,
    recipient: {
      id: draft.recipient.id,
      name: draft.recipient.name,
      street: draft.recipient.street,
      city: draft.recipient.city,
      email: draft.recipient.email,
      salutation: draft.recipient.salutation,
    },
    inputs: draftToContent(draft),
    createdAt: draft.createdAt.toISOString(),
    updatedAt: draft.updatedAt.toISOString(),
  };
  res.json(dto);
});

// POST /api/invoice-draft
invoiceDraftRouter.post('/', async (req, res) => {
  const body = req.body as DraftBody;
  if (!body.inputs?.name?.trim()) {
    res.status(400).json({ error: 'Name is required' });
    return;
  }

  const result = await prisma
    .$transaction(async (tx: Prisma.TransactionClient) => {
      const recipientId = await saveRecipient(tx, body, body.inputs);
      return tx.invoiceDraft.create({
        data: { recipientId, ...contentToDraftData(body.inputs) },
      });
    })
    .catch((err: unknown) => {
      if (err instanceof RecipientError) return err;
      throw err;
    });
  if (result instanceof RecipientError) {
    res.status(400).json({ error: result.message });
    return;
  }
  res.status(201).json({ draftId: result.id });
});

// PUT /api/invoice-draft/:id
invoiceDraftRouter.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: 'Invalid ID' });
    return;
  }

  const body = req.body as DraftBody;
  if (!body.inputs?.name?.trim()) {
    res.status(400).json({ error: 'Name is required' });
    return;
  }

  const existing = await prisma.invoiceDraft.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: 'Draft not found' });
    return;
  }

  const result = await prisma
    .$transaction(async (tx: Prisma.TransactionClient) => {
      const recipientId = await saveRecipient(tx, body, body.inputs);
      return tx.invoiceDraft.update({
        where: { id },
        data: { recipientId, ...contentToDraftData(body.inputs) },
      });
    })
    .catch((err: unknown) => {
      if (err instanceof RecipientError) return err;
      throw err;
    });
  if (result instanceof RecipientError) {
    res.status(400).json({ error: result.message });
    return;
  }
  res.json({ draftId: id });
});

// DELETE /api/invoice-draft/:id
invoiceDraftRouter.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: 'Invalid ID' });
    return;
  }

  const existing = await prisma.invoiceDraft.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: 'Draft not found' });
    return;
  }

  await prisma.invoiceDraft.delete({ where: { id } });
  res.status(204).end();
});
```

`InvoiceDraft` is exported by the generated client after `prisma generate` (it follows the existing `export type Donor = Prisma.DonorModel` pattern); `npm run typecheck` runs `prisma generate` first.

In `backend/src/routes/index.ts`, add `import { invoiceDraftRouter } from './invoiceDraft.js';` with the other router imports and `router.use('/invoice-draft', invoiceDraftRouter);` directly after `router.use('/invoice', invoiceRouter);`.

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm run test:integration --workspace=backend`
Expected: all PASS (new `invoiceDraft.test.ts` and all existing suites).

- [ ] **Step 9: Full verification**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: all PASS, zero warnings.

- [ ] **Step 10: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations shared/src/index.ts backend/src/routes/invoiceDraft.ts backend/src/routes/index.ts backend/src/__tests__/integration/helpers.ts backend/src/__tests__/integration/invoiceDraft.test.ts
git commit -m "feat: add invoice draft model and CRUD endpoints

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Draft activation endpoint

**Files:**
- Modify: `backend/src/routes/invoiceDraft.ts`
- Test: `backend/src/__tests__/integration/invoiceDraft.test.ts`

**Interfaces:**
- Consumes (Task 1): `validateRequiredFields`, `createInvoiceWithFirstRevision` from `services/invoiceCreation.ts`; `attemptInvoicePdfGeneration` from `services/invoicePdf.ts`. (Task 2): `parseId`, `draftToContent` in the same file.
- Produces: `POST /api/invoice-draft/:id/activate` → `201 { invoiceId: number; revisionId: number; recipient: InvoiceRecipient; recipientUpdated: false; pdfStatus: 'PENDING'; pdfError: null; pdfTechError: null; filePath: null }`. Errors: `400 { error: 'Invalid ID' | <validateRequiredFields message> | 'No active invoice template found' }`, `404 { error: 'Draft not found' }`. Task 5's frontend reads `invoiceId` and `error`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/src/__tests__/integration/invoiceDraft.test.ts`:

```ts
describe('POST /api/invoice-draft/:id/activate', () => {
  it('creates an invoice with the next number, today as date, and revision 1', async () => {
    const template = await seedTemplate();
    const year = new Date().getFullYear();
    const existingRecipient = await prisma.invoiceRecipient.create({
      data: { name: 'Vorher', street: 'S', city: 'C' },
    });
    await prisma.invoice.create({
      data: {
        number: `1 / ${year}`,
        year,
        runningNumber: 1,
        recipientId: existingRecipient.id,
        invoiceDate: new Date(),
      },
    });
    const draftId = await createDraft();
    const draft = await prisma.invoiceDraft.findUniqueOrThrow({ where: { id: draftId } });

    const before = Date.now();
    const res = await request.post(`/api/invoice-draft/${draftId}/activate`);
    const after = Date.now();

    expect(res.status).toBe(201);
    expect(res.body.pdfStatus).toBe('PENDING');
    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: res.body.invoiceId },
      include: { revisions: true },
    });
    expect(invoice.number).toBe(`2 / ${year}`);
    expect(invoice.status).toBe('AKTIV');
    expect(invoice.recipientId).toBe(draft.recipientId);
    expect(invoice.invoiceDate.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(invoice.invoiceDate.getTime()).toBeLessThanOrEqual(after + 1000);
    // the draft's sent invoiceDate (2020-01-01) is ignored
    expect(invoice.invoiceDate.getFullYear()).toBe(year);

    expect(invoice.revisions).toHaveLength(1);
    expect(invoice.revisions[0]).toMatchObject({
      id: res.body.revisionId,
      revisionNumber: 1,
      status: 'AKTIV',
      salutation: 'Herr',
      name: 'Draft Firma',
      street: 'Draftweg 1',
      city: 'Draftstadt',
      title: 'Draft Rechnung',
      vat: 19,
      directDebit: false,
      email: 'draft@example.com',
      emailSalutation: 'Sehr geehrter Herr',
      templateId: template.id,
    });
    expect(JSON.parse(invoice.revisions[0].positions)).toEqual(completeInputs.lineItems);
    expect(invoice.revisions[0].invoiceDate.getTime()).toBe(invoice.invoiceDate.getTime());

    expect(await prisma.invoiceDraft.count()).toBe(0);
  });

  it('draft created in a previous year gets current-year number and today\'s date', async () => {
    await seedTemplate();
    const draftId = await createDraft();
    await prisma.invoiceDraft.update({
      where: { id: draftId },
      data: { createdAt: new Date('2020-12-31T12:00:00Z') },
    });
    const year = new Date().getFullYear();

    const res = await request.post(`/api/invoice-draft/${draftId}/activate`);

    expect(res.status).toBe(201);
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: res.body.invoiceId } });
    expect(invoice.year).toBe(year);
    expect(invoice.number).toBe(`1 / ${year}`);
    expect(invoice.invoiceDate.getFullYear()).toBe(year);
  });

  it('returns 400 for an incomplete draft and keeps it without consuming a number', async () => {
    await seedTemplate();
    const draftId = await createDraft(nameOnlyInputs);

    const res = await request.post(`/api/invoice-draft/${draftId}/activate`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Street is required');
    expect(await prisma.invoice.count()).toBe(0);
    expect(await prisma.invoiceDraft.count()).toBe(1);
  });

  it('returns 400 without an active invoice template and keeps the draft', async () => {
    const draftId = await createDraft();

    const res = await request.post(`/api/invoice-draft/${draftId}/activate`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('No active invoice template found');
    expect(await prisma.invoice.count()).toBe(0);
    expect(await prisma.invoiceDraft.count()).toBe(1);
  });

  it('returns 404 when activating the same draft a second time', async () => {
    await seedTemplate();
    const draftId = await createDraft();

    const first = await request.post(`/api/invoice-draft/${draftId}/activate`);
    const second = await request.post(`/api/invoice-draft/${draftId}/activate`);

    expect(first.status).toBe(201);
    expect(second.status).toBe(404);
    expect(await prisma.invoice.count()).toBe(1);
  });

  it('concurrent activation creates exactly one invoice', async () => {
    await seedTemplate();
    const draftId = await createDraft();

    const [a, b] = await Promise.all([
      request.post(`/api/invoice-draft/${draftId}/activate`),
      request.post(`/api/invoice-draft/${draftId}/activate`),
    ]);

    expect([a.status, b.status].sort()).toEqual([201, 404]);
    expect(await prisma.invoice.count()).toBe(1);
    expect(await prisma.invoiceDraft.count()).toBe(0);
  });

  it('returns 404 for a missing draft and 400 for an invalid id', async () => {
    expect((await request.post('/api/invoice-draft/99999/activate')).status).toBe(404);
    expect((await request.post('/api/invoice-draft/abc/activate')).status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:integration --workspace=backend -- invoiceDraft`
Expected: the new `activate` tests FAIL with 404 (route does not exist); the Task 2 tests still PASS.

- [ ] **Step 3: Implement the activate route**

In `backend/src/routes/invoiceDraft.ts`, extend the `invoiceCreation.js` import with `createInvoiceWithFirstRevision` and `validateRequiredFields`, add `import { attemptInvoicePdfGeneration } from '../services/invoicePdf.js';`, and append:

```ts
function isRecordNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2025';
}

// POST /api/invoice-draft/:id/activate
invoiceDraftRouter.post('/:id/activate', async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: 'Invalid ID' });
    return;
  }

  const draft = await prisma.invoiceDraft.findUnique({ where: { id } });
  if (!draft) {
    res.status(404).json({ error: 'Draft not found' });
    return;
  }

  const inputs = draftToContent(draft);
  const validationError = validateRequiredFields(inputs);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  const invoiceTemplate = await prisma.template.findFirst({
    where: { type: 'RECHNUNG', active: true },
  });
  if (!invoiceTemplate) {
    res.status(400).json({ error: 'No active invoice template found' });
    return;
  }

  const result = await prisma
    .$transaction(async (tx: Prisma.TransactionClient) => {
      const { invoice, revision } = await createInvoiceWithFirstRevision(tx, {
        recipientId: draft.recipientId,
        inputs,
        invoiceDate: new Date(),
        templateId: invoiceTemplate.id,
      });
      // Throws P2025 if a concurrent activation already deleted the draft,
      // which rolls back the invoice created above.
      await tx.invoiceDraft.delete({ where: { id } });
      const recipient = await tx.invoiceRecipient.findUniqueOrThrow({
        where: { id: draft.recipientId },
      });
      return { invoice, revision, recipient };
    })
    .catch((err: unknown) => {
      if (isRecordNotFound(err)) return null;
      throw err;
    });
  if (result === null) {
    res.status(404).json({ error: 'Draft not found' });
    return;
  }

  // Start PDF generation in background – do NOT await, as libreoffice can be slow
  attemptInvoicePdfGeneration(result.revision.id).catch(() => {
    // PDF generation errors are already persisted to the DB inside attemptInvoicePdfGeneration
  });

  res.status(201).json({
    invoiceId: result.invoice.id,
    revisionId: result.revision.id,
    recipient: result.recipient,
    recipientUpdated: false,
    pdfStatus: 'PENDING' as const,
    pdfError: null,
    pdfTechError: null,
    filePath: null,
  });
});
```

Note: the concurrency test relies on the better-sqlite3 adapter serializing interactive transactions, so the second transaction sees the first one's committed state. If the concurrent test fails with `P2002` (unique constraint on `Invoice.number`) instead of producing a 404, also make the `.catch` return `null` for `P2002` (so it maps to `404 { error: 'Draft not found' }`) (the draft was activated by the other request) and re-run.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:integration --workspace=backend -- invoiceDraft`
Expected: all PASS. Run it three times to make sure the concurrency test is stable.

- [ ] **Step 5: Full verification**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: all PASS, zero warnings.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/invoiceDraft.ts backend/src/__tests__/integration/invoiceDraft.test.ts
git commit -m "feat: add invoice draft activation endpoint

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Drafts section in the invoice list

**Files:**
- Modify: `frontend/src/views/InvoiceView.vue`
- Test: `frontend/src/__tests__/InvoiceView.test.ts`

**Interfaces:**
- Consumes (Task 2): `GET /api/invoice-draft` → `InvoiceDraftListItem[]` (`{ id, recipientName, title, amountCents, updatedAt }`).
- Produces: navigation to `/invoice/draft/:id` (route added in Task 5). Template marker `data-testid="drafts-section"`.

- [ ] **Step 1: Make the mount helper reusable**

In `frontend/src/__tests__/InvoiceView.test.ts`, move the `mountInvoiceView()` function out of the `describe('InvoiceView — selection & download', ...)` block to module scope (directly above that `describe`). Body unchanged. Add `flushPromises` to the `@vue/test-utils` import and `InvoiceDraftListItem` to the `shared` type import:

```ts
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import type { InvoiceDraftListItem, InvoiceListItem } from 'shared';
```

- [ ] **Step 2: Write the failing tests**

Append to `frontend/src/__tests__/InvoiceView.test.ts`:

```ts
describe('InvoiceView — drafts section', () => {
  const mockDrafts: InvoiceDraftListItem[] = [
    {
      id: 7,
      recipientName: 'Draft Recipient',
      title: 'Draft Title',
      amountCents: 11900,
      updatedAt: '2026-10-01T10:00:00Z',
    },
  ];

  function stubFetch(drafts: InvoiceDraftListItem[]) {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url === '/api/invoice-draft') {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(drafts) } as Response);
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockInvoices),
        } as Response);
      }),
    );
  }

  beforeEach(() => {
    mockPush.mockClear();
    (useRouter as ReturnType<typeof vi.fn>).mockReturnValue({ push: mockPush });
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders drafts above the filter bar and the invoice table', async () => {
    stubFetch(mockDrafts);
    const wrapper = mountInvoiceView();
    await flushPromises();

    const section = wrapper.find('[data-testid="drafts-section"]');
    expect(section.exists()).toBe(true);
    expect(section.text()).toContain('Draft Recipient');
    expect(section.text()).toContain('Draft Title');
    expect(section.text()).toContain('119,00');

    const html = wrapper.html();
    const draftsAt = html.indexOf('data-testid="drafts-section"');
    expect(draftsAt).toBeLessThan(html.indexOf('Search by name or number'));
    expect(draftsAt).toBeLessThan(html.indexOf('INV-001'));
  });

  it('hides the drafts section when there are no drafts', async () => {
    stubFetch([]);
    const wrapper = mountInvoiceView();
    await flushPromises();

    expect(wrapper.find('[data-testid="drafts-section"]').exists()).toBe(false);
  });

  it('opens the draft form when a draft row is clicked', async () => {
    stubFetch(mockDrafts);
    const wrapper = mountInvoiceView();
    await flushPromises();

    await wrapper.find('[data-testid="drafts-section"] tbody tr').trigger('click');

    expect(mockPush).toHaveBeenCalledWith('/invoice/draft/7');
  });

  it('select all ignores drafts', async () => {
    stubFetch(mockDrafts);
    const wrapper = mountInvoiceView();
    await flushPromises();

    vm(wrapper).toggleSelectAll();

    expect([...vm(wrapper).selectedIds].sort()).toEqual([1, 2, 3]);
    expect(
      wrapper.find('[data-testid="drafts-section"]').findAll('input[type="checkbox"]'),
    ).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test:unit --workspace=frontend -- InvoiceView`
Expected: the four new tests FAIL because no `[data-testid="drafts-section"]` element is rendered. Existing tests PASS.

- [ ] **Step 4: Implement the Drafts section**

In `frontend/src/views/InvoiceView.vue` `<script setup>`:

1. Change the `shared` import to `import type { InvoiceDraftListItem, InvoiceListItem } from 'shared';`
2. Below `const invoices = ref<InvoiceListItem[]>([]);` add `const drafts = ref<InvoiceDraftListItem[]>([]);`
3. Below `loadData`, add:

```ts
async function loadDrafts() {
  try {
    const res = await fetch('/api/invoice-draft');
    if (res.ok) drafts.value = await res.json();
  } catch {
    error.value = 'Error loading drafts';
  }
}
```

4. Replace `onMounted(loadData);` with:

```ts
onMounted(() => {
  loadData();
  loadDrafts();
});
```

5. Below `openInvoiceDetails`, add:

```ts
function openDraft(id: number) {
  router.push(`/invoice/draft/${id}`);
}
```

In the `<template>`, insert this block directly **before** the filter card (`<div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4">` that contains the search input), i.e. after the "No invoice template uploaded" warning:

```html
    <div
      v-if="drafts.length > 0"
      data-testid="drafts-section"
      class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-4"
    >
      <h3 class="px-4 py-3 font-semibold text-gray-800 border-b border-gray-200 bg-gray-50">
        Drafts ({{ drafts.length }})
      </h3>
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-gray-200">
            <th class="text-left px-4 py-3 font-medium text-gray-600">Recipient</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Title</th>
            <th class="text-right px-4 py-3 font-medium text-gray-600">Amount</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Last edited</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="d in drafts"
            :key="d.id"
            class="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
            tabindex="0"
            role="button"
            @click="openDraft(d.id)"
            @keydown.enter.prevent="openDraft(d.id)"
            @keydown.space.prevent="openDraft(d.id)"
          >
            <td class="px-4 py-3 text-gray-700">{{ d.recipientName }}</td>
            <td class="px-4 py-3 text-gray-700">{{ d.title || '—' }}</td>
            <td class="px-4 py-3 text-right font-medium text-gray-800">
              {{ formatAmount(d.amountCents) }}
            </td>
            <td class="px-4 py-3 text-gray-600">{{ formatDate(d.updatedAt) }}</td>
            <td class="px-4 py-3">
              <span
                class="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700"
              >
                DRAFT
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
```

Placement rationale: drafts are not affected by the search/date/cancelled filters, so they sit above the filter bar rather than between filters and table.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test:unit --workspace=frontend -- InvoiceView`
Expected: all PASS (new and existing; existing mocks return no `ok`, so `drafts` stays empty for them).

- [ ] **Step 6: Full verification**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: all PASS, zero warnings.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/views/InvoiceView.vue frontend/src/__tests__/InvoiceView.test.ts
git commit -m "feat: show invoice drafts above the invoice list

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Draft mode in the invoice form

**Files:**
- Modify: `frontend/src/router/index.ts`
- Modify: `frontend/src/views/InvoiceFormView.vue`
- Test: `frontend/src/__tests__/InvoiceFormView.test.ts` (create)

**Interfaces:**
- Consumes (Tasks 2, 3): `GET/PUT/DELETE /api/invoice-draft/:id`, `POST /api/invoice-draft` → `{ draftId }`, `POST /api/invoice-draft/:id/activate` → `{ invoiceId }` or `{ error }`; `InvoiceDraftDto` from `shared`.
- Produces: route `/invoice/draft/:draftId` (name `invoice-draft`). Template markers: `data-testid="save-draft"`, `"activate-draft"`, `"delete-draft"`, `"draft-date-hint"`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/__tests__/InvoiceFormView.test.ts`:

```ts
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import type { InvoiceDraftDto, InvoiceInputs } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRoute, useRouter } from 'vue-router';
import { useAppStore } from '../stores/app';
import InvoiceFormView from '../views/InvoiceFormView.vue';

vi.mock('vue-router', () => ({
  useRoute: vi.fn(),
  useRouter: vi.fn(),
}));

const mockPush = vi.fn();
const mockReplace = vi.fn();

interface FormVM {
  inputs: InvoiceInputs;
  error: string;
  success: string;
}

function vm(wrapper: VueWrapper): FormVM {
  return wrapper.vm as unknown as FormVM;
}

type Reply = { status: number; body?: unknown };
let replies: Record<string, Reply>;

const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  const key = `${init?.method ?? 'GET'} ${url}`;
  const reply = replies[key];
  if (!reply) throw new Error(`Unexpected fetch: ${key}`);
  return {
    ok: reply.status < 400,
    status: reply.status,
    json: () => Promise.resolve(reply.body),
  } as Response;
});

function calls(): string[] {
  return fetchMock.mock.calls.map(
    ([url, init]) => `${(init as RequestInit | undefined)?.method ?? 'GET'} ${url}`,
  );
}

function bodyOf(key: string): Record<string, unknown> {
  const call = fetchMock.mock.calls.find(
    ([url, init]) => `${(init as RequestInit | undefined)?.method ?? 'GET'} ${url}` === key,
  );
  return JSON.parse(String((call?.[1] as RequestInit).body));
}

const draftDto: InvoiceDraftDto = {
  id: 42,
  recipient: {
    id: 5,
    name: 'Draft Firma',
    street: 'Weg 1',
    city: 'Stadt',
    email: 'd@example.com',
    salutation: null,
  },
  inputs: {
    salutation: '',
    name: 'Draft Firma',
    street: 'Weg 1',
    city: 'Stadt',
    title: 'Draft Titel',
    lineItems: [{ text: 'Pos', priceInCents: 5000 }],
    vat: 19,
    directDebit: false,
    email: 'd@example.com',
    emailSalutation: 'Hallo',
  },
  createdAt: '2026-10-01T10:00:00Z',
  updatedAt: '2026-10-01T10:00:00Z',
};

function setRoute(params: Record<string, string>) {
  (useRoute as ReturnType<typeof vi.fn>).mockReturnValue({ params, query: {} });
}

async function mountForm() {
  const wrapper = mount(InvoiceFormView);
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  replies = {};
  fetchMock.mockClear();
  mockPush.mockClear();
  mockReplace.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('confirm', vi.fn(() => true));
  (useRouter as ReturnType<typeof vi.fn>).mockReturnValue({
    push: mockPush,
    replace: mockReplace,
    back: vi.fn(),
  });
  setActivePinia(createPinia());
  useAppStore().invoiceTemplateAvailable = true;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('InvoiceFormView — new invoice', () => {
  beforeEach(() => setRoute({}));

  it('"Save as Draft" posts to the draft endpoint and returns to the list', async () => {
    replies['POST /api/invoice-draft'] = { status: 201, body: { draftId: 1 } };
    const wrapper = await mountForm();
    vm(wrapper).inputs.name = 'Neue Firma';

    await wrapper.find('[data-testid="save-draft"]').trigger('click');
    await flushPromises();

    expect(calls()).toEqual(['POST /api/invoice-draft']);
    expect(bodyOf('POST /api/invoice-draft').recipientData).toMatchObject({ name: 'Neue Firma' });
    expect(mockPush).toHaveBeenCalledWith('/invoice');
  });

  it('"Save as Draft" requires a name', async () => {
    const wrapper = await mountForm();

    await wrapper.find('[data-testid="save-draft"]').trigger('click');
    await flushPromises();

    expect(calls()).toEqual([]);
    expect(vm(wrapper).error).toBe('Name is required');
  });

  it('still shows the invoice date field and Create Invoice button', async () => {
    const wrapper = await mountForm();
    expect(wrapper.find('input[type="date"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Create Invoice');
    expect(wrapper.find('[data-testid="activate-draft"]').exists()).toBe(false);
  });
});

describe('InvoiceFormView — draft mode', () => {
  beforeEach(() => {
    setRoute({ draftId: '42' });
    replies['GET /api/invoice-draft/42'] = { status: 200, body: draftDto };
  });

  it('loads the draft, hides the date field and shows draft actions', async () => {
    const wrapper = await mountForm();

    expect(vm(wrapper).inputs.title).toBe('Draft Titel');
    expect(vm(wrapper).inputs.name).toBe('Draft Firma');
    expect(wrapper.find('input[type="date"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="draft-date-hint"]').text()).toContain(
      'Invoice date is set on activation',
    );
    expect(wrapper.find('[data-testid="save-draft"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="activate-draft"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="delete-draft"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('Create Invoice');
  });

  it('shows an error when the draft does not exist', async () => {
    replies['GET /api/invoice-draft/42'] = { status: 404, body: { error: 'Draft not found' } };
    const wrapper = await mountForm();

    expect(vm(wrapper).error).toBe('Draft not found');
    expect(wrapper.find('[data-testid="activate-draft"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="save-draft"]').exists()).toBe(false);
  });

  it('"Save Draft" PUTs with the linked recipient id and stays on the page', async () => {
    replies['PUT /api/invoice-draft/42'] = { status: 200, body: { draftId: 42 } };
    const wrapper = await mountForm();

    await wrapper.find('[data-testid="save-draft"]').trigger('click');
    await flushPromises();

    expect(calls()).toEqual(['GET /api/invoice-draft/42', 'PUT /api/invoice-draft/42']);
    expect(bodyOf('PUT /api/invoice-draft/42').recipientId).toBe(5);
    expect(vm(wrapper).success).toBe('Draft saved.');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('form submit in draft mode saves the draft instead of creating an invoice', async () => {
    replies['PUT /api/invoice-draft/42'] = { status: 200, body: { draftId: 42 } };
    const wrapper = await mountForm();

    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(calls()).toEqual(['GET /api/invoice-draft/42', 'PUT /api/invoice-draft/42']);
  });

  it('Activate saves first, then activates and opens the new invoice', async () => {
    replies['PUT /api/invoice-draft/42'] = { status: 200, body: { draftId: 42 } };
    replies['POST /api/invoice-draft/42/activate'] = { status: 201, body: { invoiceId: 99 } };
    const wrapper = await mountForm();
    vm(wrapper).inputs.title = 'Geändert';

    await wrapper.find('[data-testid="activate-draft"]').trigger('click');
    await flushPromises();

    expect(calls()).toEqual([
      'GET /api/invoice-draft/42',
      'PUT /api/invoice-draft/42',
      'POST /api/invoice-draft/42/activate',
    ]);
    expect((bodyOf('PUT /api/invoice-draft/42').inputs as InvoiceInputs).title).toBe('Geändert');
    expect(mockPush).toHaveBeenCalledWith('/invoice/99');
  });

  it('Activate does nothing when the confirmation is cancelled', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    const wrapper = await mountForm();

    await wrapper.find('[data-testid="activate-draft"]').trigger('click');
    await flushPromises();

    expect(calls()).toEqual(['GET /api/invoice-draft/42']);
  });

  it('Activate shows the server validation error and stays on the draft', async () => {
    replies['PUT /api/invoice-draft/42'] = { status: 200, body: { draftId: 42 } };
    replies['POST /api/invoice-draft/42/activate'] = {
      status: 400,
      body: { error: 'Street is required' },
    };
    const wrapper = await mountForm();

    await wrapper.find('[data-testid="activate-draft"]').trigger('click');
    await flushPromises();

    expect(vm(wrapper).error).toBe('Street is required');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('Delete removes the draft and returns to the list', async () => {
    replies['DELETE /api/invoice-draft/42'] = { status: 204 };
    const wrapper = await mountForm();

    await wrapper.find('[data-testid="delete-draft"]').trigger('click');
    await flushPromises();

    expect(calls()).toContain('DELETE /api/invoice-draft/42');
    expect(mockPush).toHaveBeenCalledWith('/invoice');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit --workspace=frontend -- InvoiceFormView`
Expected: FAIL — no `save-draft` / `activate-draft` elements; draft mode not loaded.

- [ ] **Step 3: Add the route**

In `frontend/src/router/index.ts`, add directly after the `invoice-new` route:

```ts
    {
      path: '/invoice/draft/:draftId',
      name: 'invoice-draft',
      component: InvoiceFormView,
    },
```

- [ ] **Step 4: Implement draft mode in the script**

In `frontend/src/views/InvoiceFormView.vue` `<script setup>`:

1. Change the shared import to `import type { InvoiceDraftDto, InvoiceInputs, InvoiceRecipientDto } from 'shared';`
2. Below `const copyFromId = ...`, add:

```ts
const draftId = route.params.draftId ? parseInt(String(route.params.draftId)) : null;
const isDraft = !!draftId;
const draftLoaded = ref(false);
```

   (`draftLoaded` must be declared with `ref` — `ref` is already imported.)
3. Below the message refs (`const success = ref('');`), add:

```ts
function clearMessages() {
  error.value = '';
  warning.value = '';
  info.value = '';
  success.value = '';
}
```

4. Below `copyFromInvoice`, add:

```ts
async function loadDraft() {
  if (!draftId) return;
  const res = await fetch(`/api/invoice-draft/${draftId}`);
  if (!res.ok) {
    error.value = 'Draft not found';
    return;
  }
  const data = (await res.json()) as InvoiceDraftDto;
  inputs.value = { ...data.inputs, invoiceDate: inputs.value.invoiceDate };
  recipient.value = data.recipient;
  recipientSearch.value = data.recipient.name;
  newRecipient.value = false;
  draftLoaded.value = true;
}
```

5. In `onMounted`, extend the branch chain:

```ts
  if (isNewRevision) {
    await ladeRevision();
  } else if (isCopy) {
    await copyFromInvoice();
  } else if (isDraft) {
    await loadDraft();
  }
```

6. Extract the recipient part of the request body from `submit()` into a function and use it in `submit()`:

```ts
function recipientRequestBody(): Record<string, unknown> {
  const body: Record<string, unknown> = { inputs: inputs.value };
  if (recipient.value && !newRecipient.value) {
    body.recipientId = recipient.value.id;
  } else {
    body.recipientData = {
      name: inputs.value.name,
      street: inputs.value.street,
      city: inputs.value.city,
      email: inputs.value.email,
      salutation: inputs.value.salutation,
    };
  }
  return body;
}
```

   In `submit()`, replace the four message resets at the top with `clearMessages();` and replace the `else { const body ... }` block's body construction with `JSON.stringify(recipientRequestBody())`:

```ts
    } else {
      res = await fetch('/api/invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(recipientRequestBody()),
      });
    }
```

7. Add the draft actions below `submit()`:

```ts
/** Creates or updates the draft. Returns the draft id, or null on error. */
async function saveDraft(): Promise<number | null> {
  clearMessages();
  if (!inputs.value.name.trim()) {
    error.value = 'Name is required';
    return null;
  }

  sending.value = true;
  try {
    const res = await fetch(isDraft ? `/api/invoice-draft/${draftId}` : '/api/invoice-draft', {
      method: isDraft ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(recipientRequestBody()),
    });
    const result = await res.json();
    if (!res.ok) {
      error.value = result.error || 'Unknown error';
      return null;
    }
    return result.draftId as number;
  } catch {
    error.value = 'Network error while saving';
    return null;
  } finally {
    sending.value = false;
  }
}

async function onSaveDraft() {
  const id = await saveDraft();
  if (id === null) return;
  if (isDraft) {
    success.value = 'Draft saved.';
  } else {
    router.push('/invoice');
  }
}

async function activateDraft() {
  const today = new Intl.DateTimeFormat('de-DE').format(new Date());
  if (!confirm(`Assigns the next invoice number and today's date (${today}). Continue?`)) {
    return;
  }

  const id = await saveDraft();
  if (id === null) return;

  sending.value = true;
  try {
    const res = await fetch(`/api/invoice-draft/${draftId}/activate`, { method: 'POST' });
    const result = await res.json();
    if (!res.ok) {
      error.value = result.error || 'Unknown error';
      return;
    }
    router.push(`/invoice/${result.invoiceId}`);
  } catch {
    error.value = 'Network error while activating';
  } finally {
    sending.value = false;
  }
}

async function deleteDraft() {
  if (!confirm('Delete this draft?')) return;
  clearMessages();
  try {
    const res = await fetch(`/api/invoice-draft/${draftId}`, { method: 'DELETE' });
    if (!res.ok) {
      const result = await res.json();
      error.value = result.error || 'Unknown error';
      return;
    }
    router.push('/invoice');
  } catch {
    error.value = 'Network error while deleting';
  }
}

function onFormSubmit() {
  if (isDraft) {
    // Enter in a draft must never create a real invoice; and never save a draft that failed to load
    if (draftLoaded.value) onSaveDraft();
  } else {
    submit();
  }
}
```

- [ ] **Step 5: Update the template**

In `InvoiceFormView.vue` `<template>`:

1. Heading: replace the `<h2>` text expression with

```html
        {{
          isDraft
            ? 'Edit Draft'
            : isNewRevision
              ? 'Create New Revision'
              : isCopy
                ? 'Duplicate Invoice'
                : 'New Invoice'
        }}
```

2. Form tag: change `@submit.prevent="submit"` to `@submit.prevent="onFormSubmit"`.
3. Invoice date: replace the `<div>` that wraps the "Invoice Date" label and `<input v-model="inputs.invoiceDate" type="date" ...>` with:

```html
          <div v-if="!isDraft">
            <label class="block text-sm font-medium text-gray-700 mb-1">Invoice Date</label>
            <input
              v-model="inputs.invoiceDate"
              type="date"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div v-else>
            <label class="block text-sm font-medium text-gray-700 mb-1">Invoice Date</label>
            <p data-testid="draft-date-hint" class="py-2 text-sm text-gray-500">
              Invoice date is set on activation
            </p>
          </div>
```

4. Replace the bottom button row (`<div class="flex justify-end gap-3">` … `</div>` just before `</form>`) with:

```html
      <div class="flex justify-end gap-3">
        <button
          v-if="isDraft && draftLoaded"
          type="button"
          data-testid="delete-draft"
          :disabled="sending"
          class="mr-auto px-4 py-2 text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
          @click="deleteDraft"
        >
          Delete Draft
        </button>
        <button
          type="button"
          class="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
          @click="router.back()"
        >
          Cancel
        </button>
        <button
          v-if="!isNewRevision && (!isDraft || draftLoaded)"
          type="button"
          data-testid="save-draft"
          :disabled="sending"
          class="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
          @click="onSaveDraft"
        >
          {{ isDraft ? 'Save Draft' : 'Save as Draft' }}
        </button>
        <button
          v-if="isDraft && draftLoaded"
          type="button"
          data-testid="activate-draft"
          :disabled="sending"
          class="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          @click="activateDraft"
        >
          {{ sending ? 'Activating…' : 'Activate' }}
        </button>
        <button
          v-if="!isDraft"
          type="submit"
          :disabled="sending"
          class="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {{
            sending
              ? isNewRevision
                ? 'Saving revision…'
                : 'Generating…'
              : isNewRevision
                ? 'Save Revision'
                : 'Create Invoice'
          }}
        </button>
      </div>
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test:unit --workspace=frontend`
Expected: all PASS (new `InvoiceFormView.test.ts` and existing suites).

- [ ] **Step 7: Full verification**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: all PASS, zero warnings.

- [ ] **Step 8: Manual check in the running app**

Run `npm run dev` and in the browser:
1. `/invoice` → "+ New Invoice" → enter only a name → "Save as Draft" → back on `/invoice`, a "Drafts (1)" section appears above the filter bar.
2. Click the draft → form shows "Edit Draft", no date input, the hint text, and Delete / Save Draft / Activate.
3. Click Activate with missing street → error "Street is required", still on the draft.
4. Fill everything → Activate → confirm → lands on `/invoice/<id>` with number `N / <year>` and today's date; the Drafts section on `/invoice` is gone.
5. Create another draft, open it, press Enter in the Title field → "Draft saved." appears, no invoice created.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/router/index.ts frontend/src/views/InvoiceFormView.vue frontend/src/__tests__/InvoiceFormView.test.ts
git commit -m "feat: add draft mode to invoice form with save, activate and delete

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
