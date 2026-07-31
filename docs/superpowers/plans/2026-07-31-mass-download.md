# Mass Download — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add checkbox-based multi-select to invoice and donation receipt list views, allowing users to download multiple PDFs as a single ZIP file via a new backend batch endpoint.

**Architecture:** Two new POST endpoints (`/api/invoice/download-batch`, `/api/donation-receipt/download-batch`) validate all IDs (active, not cancelled, PDF ready) before streaming a ZIP via `archiver`. Frontend list views gain a checkbox column and "Download selected" button.

**Tech Stack:** Express, Prisma, archiver (ZIP streaming), Vue 3 + TypeScript, Vitest + supertest

**Spec:** `docs/superpowers/specs/2026-07-31-mass-download-design.md`

## Global Constraints

- Only latest active (`AKTIV`) revision PDFs are included; cancelled or PDF-not-ready entries block the entire batch with a 400
- ZIP is piped directly to response — no temp files on disk
- Route ordering: batch endpoints MUST be defined before `/:id` param route
- `npm run lint && npm run test:unit && npm run test:integration` must pass after every task commit
- Backend archiver types: `@types/archiver` in devDependencies

---

### Task 1: Install archiver dependency

**Files:**
- Modify: `backend/package.json`

**Interfaces:**
- Produces: `archiver` (npm) and `@types/archiver` (dev) available for import

- [ ] **Step 1: Install archiver and its types**

```bash
cd /home/sebastian/code/mv-dashboard && npm install --workspace=backend archiver && npm install --save-dev --workspace=backend @types/archiver
```

- [ ] **Step 2: Verify install**

```bash
cd /home/sebastian/code/mv-dashboard && node -e "require(require('path').join('backend','node_modules','archiver'))" && echo "OK"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
cd /home/sebastian/code/mv-dashboard && git add backend/package.json backend/package-lock.json && git commit -m "chore: add archiver dependency for ZIP generation"
```

---

### Task 2: Backend — Invoice batch download endpoint

**Files:**
- Modify: `backend/src/routes/invoice.ts` (insert route before `/:id` route)
- Create: `backend/src/__tests__/integration/invoice-batch-download.test.ts`

**Interfaces:**
- Consumes: `archiver` from Task 1, `toAbsolutePath` from `../config.js`, `prisma` from `../prismaClient.js`
- Produces: `POST /api/invoice/download-batch` — accepts `{ ids: number[] }`, returns `application/zip` stream or `400 { error: string, ids: number[] }`

- [ ] **Step 1: Write the integration test file**

Create `backend/src/__tests__/integration/invoice-batch-download.test.ts`:

```typescript
import archiver from 'archiver';
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

async function seedRecipientAndInvoice(overrides?: { pdfStatus?: string; filePath?: string | null; status?: string }) {
  const template = await prisma.template.create({
    data: { type: 'RECHNUNG', version: 1, fileName: 'test.docx', filePath: 'templates/test.docx', active: true },
  });
  const recipient = await prisma.invoiceRecipient.create({
    data: { name: 'Test GmbH', street: 'Teststr. 1', city: 'Berlin', email: 'test@test.de' },
  });
  const invoice = await prisma.invoice.create({
    data: {
      number: `RE-2026-${Math.floor(Math.random() * 9000) + 1000}`,
      year: 2026,
      runningNumber: 1,
      recipientId: recipient.id,
      invoiceDate: new Date('2026-01-15'),
      status: overrides?.status || 'AKTIV',
    },
  });
  const revision = await prisma.invoiceRevision.create({
    data: {
      invoiceId: invoice.id,
      revisionNumber: 1,
      status: 'AKTIV',
      salutation: 'Herr',
      name: 'Test GmbH',
      street: 'Teststr. 1',
      city: 'Berlin',
      invoiceDate: new Date('2026-01-15'),
      title: 'Consulting',
      positions: JSON.stringify([{ text: 'Item 1', priceInCents: 10000 }]),
      vat: 19,
      directDebit: false,
      email: 'test@test.de',
      emailSalutation: 'Sehr geehrte Damen und Herren',
      templateId: template.id,
      pdfStatus: overrides?.pdfStatus || 'OK',
      filePath: overrides?.filePath === undefined ? 'invoices/99/r1/test.pdf' : (overrides?.filePath ?? null),
    },
  });
  return { template, recipient, invoice, revision };
}

describe('POST /api/invoice/download-batch', () => {
  it('returns ZIP with correct content type and filename for valid IDs', async () => {
    const { invoice } = await seedRecipientAndInvoice();

    const res = await request
      .post('/api/invoice/download-batch')
      .send({ ids: [invoice.id] });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="rechnungen-/);
  });

  it('returns 400 when IDs array is empty', async () => {
    const res = await request
      .post('/api/invoice/download-batch')
      .send({ ids: [] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('MISSING_IDS');
  });

  it('returns 400 when IDs array is missing', async () => {
    const res = await request
      .post('/api/invoice/download-batch')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('MISSING_IDS');
  });

  it('returns 400 when an ID is not found', async () => {
    const res = await request
      .post('/api/invoice/download-batch')
      .send({ ids: [99999] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('NOT_FOUND');
    expect(res.body.ids).toEqual([99999]);
  });

  it('returns 400 when an invoice is cancelled', async () => {
    const { invoice } = await seedRecipientAndInvoice({ status: 'STORNIERT' });

    const res = await request
      .post('/api/invoice/download-batch')
      .send({ ids: [invoice.id] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('CANCELLED');
    expect(res.body.ids).toContain(invoice.id);
  });

  it('returns 400 when PDF is not ready (PENDING)', async () => {
    const { invoice } = await seedRecipientAndInvoice({ pdfStatus: 'PENDING', filePath: null });

    const res = await request
      .post('/api/invoice/download-batch')
      .send({ ids: [invoice.id] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('PDF_NOT_READY');
    expect(res.body.ids).toContain(invoice.id);
  });

  it('returns 400 when PDF is FAILED', async () => {
    const { invoice } = await seedRecipientAndInvoice({ pdfStatus: 'FAILED', filePath: null });

    const res = await request
      .post('/api/invoice/download-batch')
      .send({ ids: [invoice.id] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('PDF_NOT_READY');
    expect(res.body.ids).toContain(invoice.id);
  });

  it('reports all problematic IDs in one response', async () => {
    const { invoice: i1 } = await seedRecipientAndInvoice({ status: 'STORNIERT' });
    const { invoice: i2 } = await seedRecipientAndInvoice({ pdfStatus: 'PENDING', filePath: null });

    const res = await request
      .post('/api/invoice/download-batch')
      .send({ ids: [i1.id, i2.id] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('CANCELLED');
    expect(res.body.ids).toContain(i1.id);
    expect(res.body.ids).toContain(i2.id);
  });

  it('works with multiple valid IDs', async () => {
    const { invoice: i1 } = await seedRecipientAndInvoice();
    const { invoice: i2 } = await seedRecipientAndInvoice();

    const res = await request
      .post('/api/invoice/download-batch')
      .send({ ids: [i1.id, i2.id] });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/sebastian/code/mv-dashboard && npx vitest run --config backend/vitest.integration.config.ts backend/src/__tests__/integration/invoice-batch-download.test.ts
```
Expected: All tests FAIL with 404 (route not found)

- [ ] **Step 3: Add the batch download route in `backend/src/routes/invoice.ts`**

Insert the following block AFTER the `invoiceRouter.get('/', ...)` route handler and BEFORE `invoiceRouter.get('/revision/:revisionId/download', ...)`. Add the `archiver` import at the top with the other imports:

```typescript
import archiver from 'archiver';
```

Insert the route:

```typescript
// POST /api/invoice/download-batch
// NOTE: This route MUST come before /:id to avoid matching "download-batch" as an id
invoiceRouter.post('/download-batch', async (req, res) => {
  const ids: unknown = req.body?.ids;
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id: unknown) => typeof id === 'number' && Number.isFinite(id))) {
    res.status(400).json({ error: 'MISSING_IDS', ids: [] });
    return;
  }

  // Validate all IDs first — collect problems
  const notFound: number[] = [];
  const cancelled: number[] = [];
  const notReady: number[] = [];
  const validEntries: { number: string; revisionNumber: number; filePath: string }[] = [];

  for (const id of ids) {
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        revisions: {
          where: { status: 'AKTIV' },
          orderBy: { revisionNumber: 'desc' },
          take: 1,
        },
      },
    });

    if (!invoice) {
      notFound.push(id);
      continue;
    }

    if (invoice.status === 'STORNIERT') {
      cancelled.push(id);
      continue;
    }

    const rev = invoice.revisions[0];
    if (!rev || !rev.filePath || rev.pdfStatus !== 'OK') {
      notReady.push(id);
      continue;
    }

    validEntries.push({
      number: invoice.number,
      revisionNumber: rev.revisionNumber,
      filePath: rev.filePath,
    });
  }

  if (notFound.length > 0) {
    res.status(400).json({ error: 'NOT_FOUND', ids: notFound });
    return;
  }
  if (cancelled.length > 0) {
    res.status(400).json({ error: 'CANCELLED', ids: cancelled });
    return;
  }
  if (notReady.length > 0) {
    res.status(400).json({ error: 'PDF_NOT_READY', ids: notReady });
    return;
  }

  // All valid — build ZIP
  const dateStr = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="rechnungen-${dateStr}.zip"`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => {
    // If headers not yet sent, send error; otherwise the stream is already broken
    if (!res.headersSent) {
      res.status(500).json({ error: 'Server error during ZIP creation' });
    }
  });

  archive.pipe(res);

  for (const entry of validEntries) {
    const safeNum = entry.number.replace(/\s*\/\s*/g, '-');
    const name = `${safeNum}-R${entry.revisionNumber}.pdf`;
    archive.file(toAbsolutePath(entry.filePath), { name });
  }

  await archive.finalize();
});
```

- [ ] **Step 4: Run integration tests to verify they pass**

```bash
cd /home/sebastian/code/mv-dashboard && npx vitest run --config backend/vitest.integration.config.ts backend/src/__tests__/integration/invoice-batch-download.test.ts
```
Expected: ALL tests PASS

- [ ] **Step 5: Run full lint and verify**

```bash
cd /home/sebastian/code/mv-dashboard && npm run lint
```
Expected: PASS with zero warnings

- [ ] **Step 6: Run existing integration tests to verify no regressions**

```bash
cd /home/sebastian/code/mv-dashboard && npm run test:integration
```
Expected: ALL existing integration tests still PASS

- [ ] **Step 7: Commit**

```bash
cd /home/sebastian/code/mv-dashboard && git add backend/src/routes/invoice.ts backend/src/__tests__/integration/invoice-batch-download.test.ts && git commit -m "feat: add batch download endpoint for invoices"
```

---

### Task 3: Backend — Donation receipt batch download endpoint

**Files:**
- Modify: `backend/src/routes/donationReceipt.ts` (insert route before `/:id` route)
- Create: `backend/src/__tests__/integration/donation-receipt-batch-download.test.ts`

**Interfaces:**
- Consumes: `archiver` from Task 1, `toAbsolutePath` from `../config.js`, `prisma` from `../prismaClient.js`
- Produces: `POST /api/donation-receipt/download-batch` — accepts `{ ids: number[] }`, returns `application/zip` stream or `400 { error: string, ids: number[] }`

- [ ] **Step 1: Write the integration test file**

Create `backend/src/__tests__/integration/donation-receipt-batch-download.test.ts`:

```typescript
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

async function seedDonorAndReceipt(overrides?: { pdfStatus?: string; filePath?: string | null; status?: string }) {
  const donor = await prisma.donor.create({
    data: { name: 'Max Mustermann', street: 'Teststr. 1', city: 'Berlin', letterSalutation: 'Sehr geehrte Damen und Herren' },
  });
  const template = await prisma.template.create({
    data: { type: 'QUITTUNG', version: 1, fileName: 'test.pdf', filePath: 'templates/test.pdf', active: true },
  });
  const receipt = await prisma.donationReceipt.create({
    data: {
      number: `Q-2026-${Math.floor(Math.random() * 9000) + 1000}`,
      year: 2026,
      runningNumber: 1,
      donorId: donor.id,
      donationDate: new Date('2026-01-15'),
      status: overrides?.status || 'AKTIV',
    },
  });
  const revision = await prisma.donationReceiptRevision.create({
    data: {
      donationReceiptId: receipt.id,
      revisionNumber: 1,
      status: 'AKTIV',
      name: 'Max Mustermann',
      street: 'Teststr. 1',
      city: 'Berlin',
      letterSalutation: 'Sehr geehrte Damen und Herren',
      addressSalutation: null,
      donationAmountCents: 50000,
      donationDate: new Date('2026-01-15'),
      withCoverLetter: false,
      treasurer: 'Treasurer Name',
      charitablePurpose: 'Purpose',
      taxOfficeName: 'Tax Office',
      taxNumber: '123/456',
      exemptionDate: '2025-01-01',
      assessmentPeriod: '2024-2026',
      receiptTemplateId: template.id,
      pdfStatus: overrides?.pdfStatus || 'OK',
      filePath: overrides?.filePath === undefined ? 'receipts/99/r1/test.pdf' : (overrides?.filePath ?? null),
    },
  });
  return { donor, receipt, revision, template };
}

describe('POST /api/donation-receipt/download-batch', () => {
  it('returns ZIP with correct content type and filename for valid IDs', async () => {
    const { receipt } = await seedDonorAndReceipt();

    const res = await request
      .post('/api/donation-receipt/download-batch')
      .send({ ids: [receipt.id] });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="quittungen-/);
  });

  it('returns 400 when IDs array is empty', async () => {
    const res = await request
      .post('/api/donation-receipt/download-batch')
      .send({ ids: [] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('MISSING_IDS');
  });

  it('returns 400 when IDs array is missing', async () => {
    const res = await request
      .post('/api/donation-receipt/download-batch')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('MISSING_IDS');
  });

  it('returns 400 when an ID is not found', async () => {
    const res = await request
      .post('/api/donation-receipt/download-batch')
      .send({ ids: [99999] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('NOT_FOUND');
    expect(res.body.ids).toEqual([99999]);
  });

  it('returns 400 when a receipt is cancelled', async () => {
    const { receipt } = await seedDonorAndReceipt({ status: 'STORNIERT' });

    const res = await request
      .post('/api/donation-receipt/download-batch')
      .send({ ids: [receipt.id] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('CANCELLED');
    expect(res.body.ids).toContain(receipt.id);
  });

  it('returns 400 when PDF is not ready (PENDING)', async () => {
    const { receipt } = await seedDonorAndReceipt({ pdfStatus: 'PENDING', filePath: null });

    const res = await request
      .post('/api/donation-receipt/download-batch')
      .send({ ids: [receipt.id] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('PDF_NOT_READY');
    expect(res.body.ids).toContain(receipt.id);
  });

  it('returns 400 when PDF is FAILED', async () => {
    const { receipt } = await seedDonorAndReceipt({ pdfStatus: 'FAILED', filePath: null });

    const res = await request
      .post('/api/donation-receipt/download-batch')
      .send({ ids: [receipt.id] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('PDF_NOT_READY');
    expect(res.body.ids).toContain(receipt.id);
  });

  it('reports all problematic IDs in one response', async () => {
    const { receipt: r1 } = await seedDonorAndReceipt({ status: 'STORNIERT' });
    const { receipt: r2 } = await seedDonorAndReceipt({ pdfStatus: 'PENDING', filePath: null });

    const res = await request
      .post('/api/donation-receipt/download-batch')
      .send({ ids: [r1.id, r2.id] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('CANCELLED');
    expect(res.body.ids).toContain(r1.id);
    expect(res.body.ids).toContain(r2.id);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/sebastian/code/mv-dashboard && npx vitest run --config backend/vitest.integration.config.ts backend/src/__tests__/integration/donation-receipt-batch-download.test.ts
```
Expected: All tests FAIL with 404 (route not found)

- [ ] **Step 3: Add the batch download route in `backend/src/routes/donationReceipt.ts`**

Add the `archiver` import at the top:

```typescript
import archiver from 'archiver';
```

Insert the route AFTER `donationReceiptRouter.get('/', ...)` and BEFORE `donationReceiptRouter.get('/revision/:revisionId/download', ...)`:

```typescript
// POST /api/donation-receipt/download-batch
// NOTE: This route MUST come before /:id to avoid matching "download-batch" as an id
donationReceiptRouter.post('/download-batch', async (req, res) => {
  const ids: unknown = req.body?.ids;
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id: unknown) => typeof id === 'number' && Number.isFinite(id))) {
    res.status(400).json({ error: 'MISSING_IDS', ids: [] });
    return;
  }

  // Validate all IDs first — collect problems
  const notFound: number[] = [];
  const cancelled: number[] = [];
  const notReady: number[] = [];
  const validEntries: { number: string; revisionNumber: number; filePath: string }[] = [];

  for (const id of ids) {
    const receipt = await prisma.donationReceipt.findUnique({
      where: { id },
      include: {
        revisions: {
          where: { status: 'AKTIV' },
          orderBy: { revisionNumber: 'desc' },
          take: 1,
        },
      },
    });

    if (!receipt) {
      notFound.push(id);
      continue;
    }

    if (receipt.status === 'STORNIERT') {
      cancelled.push(id);
      continue;
    }

    const rev = receipt.revisions[0];
    if (!rev || !rev.filePath || rev.pdfStatus !== 'OK') {
      notReady.push(id);
      continue;
    }

    validEntries.push({
      number: receipt.number,
      revisionNumber: rev.revisionNumber,
      filePath: rev.filePath,
    });
  }

  if (notFound.length > 0) {
    res.status(400).json({ error: 'NOT_FOUND', ids: notFound });
    return;
  }
  if (cancelled.length > 0) {
    res.status(400).json({ error: 'CANCELLED', ids: cancelled });
    return;
  }
  if (notReady.length > 0) {
    res.status(400).json({ error: 'PDF_NOT_READY', ids: notReady });
    return;
  }

  // All valid — build ZIP
  const dateStr = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="quittungen-${dateStr}.zip"`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', () => {
    if (!res.headersSent) {
      res.status(500).json({ error: 'Server error during ZIP creation' });
    }
  });

  archive.pipe(res);

  for (const entry of validEntries) {
    const name = `${entry.number}-R${entry.revisionNumber}.pdf`;
    archive.file(toAbsolutePath(entry.filePath), { name });
  }

  await archive.finalize();
});
```

- [ ] **Step 4: Run integration tests to verify they pass**

```bash
cd /home/sebastian/code/mv-dashboard && npx vitest run --config backend/vitest.integration.config.ts backend/src/__tests__/integration/donation-receipt-batch-download.test.ts
```
Expected: ALL tests PASS

- [ ] **Step 5: Run full lint and verify**

```bash
cd /home/sebastian/code/mv-dashboard && npm run lint
```
Expected: PASS with zero warnings

- [ ] **Step 6: Run existing integration tests to verify no regressions**

```bash
cd /home/sebastian/code/mv-dashboard && npm run test:integration
```
Expected: ALL existing integration tests still PASS

- [ ] **Step 7: Commit**

```bash
cd /home/sebastian/code/mv-dashboard && git add backend/src/routes/donationReceipt.ts backend/src/__tests__/integration/donation-receipt-batch-download.test.ts && git commit -m "feat: add batch download endpoint for donation receipts"
```

---

### Task 4: Frontend — InvoiceView checkbox selection & download

**Files:**
- Modify: `frontend/src/views/InvoiceView.vue`
- Modify: `frontend/src/__tests__/` (add tests for new selection/download behavior)

**Interfaces:**
- Consumes: `POST /api/invoice/download-batch` from Task 2
- Produces: Checkbox column, "Download selected" button, download trigger logic

- [ ] **Step 1: Add checkbox selection and download button to InvoiceView.vue**

Modify `frontend/src/views/InvoiceView.vue` — add to the `<script setup>` section, right after the existing state declarations (after `const withCancelled = ref(false)`):

```typescript
const selectedIds = ref<Set<number>>(new Set());

function toggleSelectAll() {
  if (selectedIds.value.size === invoices.value.length) {
    selectedIds.value = new Set();
  } else {
    selectedIds.value = new Set(invoices.value.map((i) => i.id));
  }
}

function toggleSelect(id: number) {
  const next = new Set(selectedIds.value);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  selectedIds.value = next;
}

const allSelected = computed(() => invoices.value.length > 0 && selectedIds.value.size === invoices.value.length);

async function downloadSelected() {
  const ids = [...selectedIds.value];
  if (ids.length === 0) return;

  try {
    const res = await fetch('/api/invoice/download-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });

    if (!res.ok) {
      const body = await res.json();
      if (body.ids && Array.isArray(body.ids)) {
        const problemSet = new Set(body.ids as number[]);
        const next = new Set(selectedIds.value);
        for (const id of problemSet) next.delete(id);
        selectedIds.value = next;

        const label =
          body.error === 'CANCELLED' ? 'cancelled' :
          body.error === 'PDF_NOT_READY' ? 'PDF not ready' :
          body.error === 'NOT_FOUND' ? 'not found' : 'invalid';
        const count = body.ids.length;
        alert(`${count} invoice${count > 1 ? 's' : ''} cannot be downloaded: ${label}. The ${count > 1 ? 'se' : ''}${count > 1 ? ' have' : ' has'} been deselected.`);
      } else {
        alert('Download failed. Please try again.');
      }
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="(.+)"/);
    a.href = url;
    a.download = match ? match[1] : 'rechnungen.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch {
    alert('Download failed. Please try again.');
  }
}
```

Modify the template — add the "Download selected" button in the header, next to the existing "Settings" and "+ New Invoice" buttons. Replace the header div:

```html
    <div class="flex items-center justify-between mb-6 gap-3">
      <h2 class="text-2xl font-bold text-gray-800">Invoices</h2>
      <div class="flex items-center gap-2">
        <button
          :disabled="selectedIds.size === 0"
          class="border border-blue-300 text-blue-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          @click="downloadSelected"
        >
          Download selected ({{ selectedIds.size }})
        </button>
        <button
          class="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
          @click="router.push('/invoice/settings')"
        >
          Settings
        </button>
        <button
          :disabled="!store.invoiceTemplateAvailable"
          :title="
            !store.invoiceTemplateAvailable
              ? 'Please upload an invoice template in Settings first'
              : undefined
          "
          class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          @click="router.push('/invoice/new')"
        >
          + New Invoice
        </button>
      </div>
    </div>
```

Modify the table `<thead>` to add a checkbox column (first `<th>`):

```html
        <thead>
          <tr class="border-b border-gray-200 bg-gray-50">
            <th class="text-center px-4 py-3 w-10">
              <input
                type="checkbox"
                :checked="allSelected"
                class="rounded"
                @click.stop="toggleSelectAll"
              />
            </th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Number</th>
            <!-- ... rest of headers unchanged ... -->
```

Modify each `<tr>` in `<tbody>` to add a checkbox cell (first `<td>`), and stop row-click from toggling the checkbox:

```html
          <tr
            v-for="r in invoices"
            :key="r.id"
            class="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
            tabindex="0"
            role="button"
            @click="openInvoiceDetails(r.id)"
            @keydown.enter.prevent="openInvoiceDetails(r.id)"
            @keydown.space.prevent="openInvoiceDetails(r.id)"
          >
            <td class="px-4 py-3 text-center" @click.stop>
              <input
                type="checkbox"
                :checked="selectedIds.has(r.id)"
                class="rounded"
                @change="toggleSelect(r.id)"
              />
            </td>
            <td class="px-4 py-3 font-mono text-xs font-medium text-gray-800">{{ r.number }}</td>
            <!-- ... rest of row unchanged ... -->
```

- [ ] **Step 2: Run lint and unit tests**

```bash
cd /home/sebastian/code/mv-dashboard && npm run lint && npm run test:unit
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
cd /home/sebastian/code/mv-dashboard && git add frontend/src/views/InvoiceView.vue && git commit -m "feat: add checkbox selection and batch download to invoice list"
```

---

### Task 5: Frontend — DonationReceiptView checkbox selection & download

**Files:**
- Modify: `frontend/src/views/DonationReceiptView.vue`

**Interfaces:**
- Consumes: `POST /api/donation-receipt/download-batch` from Task 3
- Produces: Checkbox column, "Download selected" button, download trigger logic

- [ ] **Step 1: Add checkbox selection and download button to DonationReceiptView.vue**

Add to `<script setup>`, after `const withCancelled = ref(false)`:

```typescript
const selectedIds = ref<Set<number>>(new Set());

function toggleSelectAll() {
  if (selectedIds.value.size === receipts.value.length) {
    selectedIds.value = new Set();
  } else {
    selectedIds.value = new Set(receipts.value.map((r) => r.id));
  }
}

function toggleSelect(id: number) {
  const next = new Set(selectedIds.value);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  selectedIds.value = next;
}

const allSelected = computed(() => receipts.value.length > 0 && selectedIds.value.size === receipts.value.length);

async function downloadSelected() {
  const ids = [...selectedIds.value];
  if (ids.length === 0) return;

  try {
    const res = await fetch('/api/donation-receipt/download-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });

    if (!res.ok) {
      const body = await res.json();
      if (body.ids && Array.isArray(body.ids)) {
        const problemSet = new Set(body.ids as number[]);
        const next = new Set(selectedIds.value);
        for (const id of problemSet) next.delete(id);
        selectedIds.value = next;

        const label =
          body.error === 'CANCELLED' ? 'cancelled' :
          body.error === 'PDF_NOT_READY' ? 'PDF not ready' :
          body.error === 'NOT_FOUND' ? 'not found' : 'invalid';
        const count = body.ids.length;
        alert(`${count} receipt${count > 1 ? 's' : ''} cannot be downloaded: ${label}. The ${count > 1 ? 'se' : ''}${count > 1 ? ' have' : ' has'} been deselected.`);
      } else {
        alert('Download failed. Please try again.');
      }
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="(.+)"/);
    a.href = url;
    a.download = match ? match[1] : 'quittungen.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch {
    alert('Download failed. Please try again.');
  }
}
```

Modify the header — add "Download selected" button before "Settings":

```html
    <div class="flex items-center justify-between mb-6 gap-3">
      <h2 class="text-2xl font-bold text-gray-800">Donation Receipts</h2>
      <div class="flex items-center gap-2">
        <button
          :disabled="selectedIds.size === 0"
          class="border border-blue-300 text-blue-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          @click="downloadSelected"
        >
          Download selected ({{ selectedIds.size }})
        </button>
        <button
          class="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
          @click="router.push('/donation-receipt/settings')"
        >
          Settings
        </button>
        <button
          :disabled="!store.receiptTemplateAvailable"
          :title="
            !store.receiptTemplateAvailable
              ? 'Please upload a template in Settings first'
              : undefined
          "
          class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          @click="router.push('/donation-receipt/new')"
        >
          + New Receipt
        </button>
      </div>
    </div>
```

Add checkbox column to `<thead>` (first `<th>`):

```html
            <th class="text-center px-4 py-3 w-10">
              <input
                type="checkbox"
                :checked="allSelected"
                class="rounded"
                @click.stop="toggleSelectAll"
              />
            </th>
```

Add checkbox cell to each `<tr>` (first `<td>`, with `@click.stop`):

```html
            <td class="px-4 py-3 text-center" @click.stop>
              <input
                type="checkbox"
                :checked="selectedIds.has(q.id)"
                class="rounded"
                @change="toggleSelect(q.id)"
              />
            </td>
```

- [ ] **Step 2: Run lint and unit tests**

```bash
cd /home/sebastian/code/mv-dashboard && npm run lint && npm run test:unit
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
cd /home/sebastian/code/mv-dashboard && git add frontend/src/views/DonationReceiptView.vue && git commit -m "feat: add checkbox selection and batch download to donation receipt list"
```

---

### Task 6: Final verification

**Files:** (none — verification only)

- [ ] **Step 1: Run full verification**

```bash
cd /home/sebastian/code/mv-dashboard && npm run lint && npm run test:unit && npm run test:integration
```
Expected: ALL pass with zero warnings

- [ ] **Step 2: Manual smoke test checklist**

- Start dev server: `npm run dev`
- Navigate to `/invoice` — verify checkbox column appears, "Download selected (0)" is disabled
- Select some invoices — verify button updates with count, becomes enabled
- Click "Download selected" — verify ZIP downloads with correct filename
- Navigate to `/donation-receipt` — verify same behavior
- "Select all" checkbox works correctly (toggles all rows on current page)
- After download, checkbox state is preserved (selection not cleared)

- [ ] **Step 3: Run full test suite one final time**

```bash
cd /home/sebastian/code/mv-dashboard && npm run lint && npm run test:unit && npm run test:integration
```
Expected: ALL pass
