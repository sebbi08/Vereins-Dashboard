# Invoice Payments and Bank Booking Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Invoices can be marked paid/unpaid by hand, and a bank export CSV can be matched against
open invoices so the user confirms booking ↔ invoice pairs to mark them paid.

**Architecture:** A `paid` column on `Invoice` with a PATCH endpoint. The CSV is decoded and parsed
in the browser (`utils/bookingCsv.ts`); only positive bookings go to a pure backend matcher
(`services/paymentMatching.ts`) behind `POST /api/invoice-payment/match`; the user's selection is
saved atomically by `POST /api/invoice-payment/confirm`. Import settings (encoding, delimiter,
column names) are one JSON `SystemSetting` row behind `/api/settings/booking-import`.

**Tech Stack:** Express 5, Prisma 7 (SQLite), Vue 3 + PrimeVue 5, Vitest, WebdriverIO.

**Spec:** `docs/superpowers/specs/2026-10-09-invoice-payments-design.md`

## Global Constraints

- After every task: `npm run lint && npm run test:unit && npm run test:integration` must pass.
- Request bodies are parsed in `backend/src/services/requestParsing.ts`; never cast `req.body`.
- The backend imports runtime values from `shared` by relative path
  (`../../../shared/src/<file>.js`); type-only imports use `'shared'`.
- Frontend requests for the import page use `utils/requestJson.ts`.
- UI text is English; amounts via `formatCents`, dates via `formatDate` (German formats).
- No new dependencies. No Tailwind.
- The real CSV in `context/` is git-ignored and may hold real data: never read it into tests,
  fixtures or commits. Tests use synthetic data only.
- Never run `npm test`, `npm run test:e2e` or `e2e/run-tests.sh` (they wipe the user's local
  stack). E2E runs only against scratch servers (see Task 8).
- Commits: conventional, lower-case subject, body lines ≤ 100 characters, ending with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Migrations must be safe on the existing production database.

## Review Focus

1. A date in the purpose text (`DATUM 22.03.2025`) or a time (`12.21 UHR`) must not be read as
   invoice number `3 / 2025` or `12 / 2021` → pinned in Task 3 (`findInvoiceNumber` no-match cases).
2. Two bookings proposing the same invoice must never both be preselected or both selectable →
   pinned in Task 6 (`initialRows`, `canSelect`) and Task 7 (view test).
3. A file with a BOM must decode correctly even when another encoding is stored → Task 5
   (`decodeBookingFile`) and Task 7 (encoding shown follows the BOM).
4. Confirm must not half-apply when one id is cancelled or unknown → Task 4 (atomic confirm tests).
5. A year of bookings (> 100 kB JSON) must reach `/match` → Task 4 (large body accepted, 2 MB
   rejected with 413).

## File Structure

| File                                                                      | Responsibility                                                                      |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `backend/prisma/schema.prisma`                                            | `Invoice.paid`                                                                      |
| `backend/prisma/migrations/20261009120000_add_invoice_paid/migration.sql` | add column                                                                          |
| `shared/src/index.ts`                                                     | `paid` on `InvoiceListItem`, `InvoiceDto`; re-export payments                       |
| `shared/src/invoicePayments.ts`                                           | import settings, booking and match types + constants                                |
| `backend/src/services/requestParsing.ts`                                  | `parsePaidBody`, `parseBookingImportSettings`, `parseMatchBody`, `parseConfirmBody` |
| `backend/src/services/paymentMatching.ts`                                 | pure matcher                                                                        |
| `backend/src/routes/invoice.ts`                                           | `paid` in list/detail, `PATCH /:id/paid`                                            |
| `backend/src/routes/settings.ts`                                          | `GET/PUT /booking-import`                                                           |
| `backend/src/routes/invoicePayment.ts`                                    | `POST /match`, `POST /confirm`                                                      |
| `backend/src/routes/index.ts`, `backend/src/app.ts`                       | mount router, 2 MB JSON limit for `/match`                                          |
| `frontend/src/utils/statusTags.ts`                                        | payment tag, match level tag, filter options, reason labels                         |
| `frontend/src/utils/bookingCsv.ts`                                        | decode, CSV parse, German amount/date, rows → bookings                              |
| `frontend/src/utils/paymentSelection.ts`                                  | result rows, preselection, one-invoice-per-row rule                                 |
| `frontend/src/views/InvoiceDetailView.vue`                                | payment tag, mark paid/unpaid                                                       |
| `frontend/src/views/InvoiceView.vue`                                      | payment column + filter, "Import bank bookings" button                              |
| `frontend/src/views/InvoicePaymentImportView.vue`                         | import page                                                                         |
| `frontend/src/router/index.ts`                                            | `/invoice/payment-import`                                                           |
| `e2e/tests/invoice-payments.spec.ts`                                      | end-to-end import and undo                                                          |

---

### Task 1: Paid flag in the backend

**Files:**

- Modify: `backend/prisma/schema.prisma` (model `Invoice`)
- Create: `backend/prisma/migrations/20261009120000_add_invoice_paid/migration.sql`
- Modify: `shared/src/index.ts` (`InvoiceListItem`, `InvoiceDto`)
- Modify: `backend/src/services/requestParsing.ts`
- Modify: `backend/src/routes/invoice.ts`
- Modify (fixtures only, `paid: false`): `frontend/src/__tests__/InvoiceView.test.ts`,
  `frontend/src/__tests__/InvoiceDetailView.test.ts`, `frontend/src/__tests__/InvoiceFormView.test.ts`
- Test: `backend/src/__tests__/integration/invoice.test.ts`

**Interfaces:**

- Produces: `Invoice.paid: boolean` (Prisma); `InvoiceListItem.paid: boolean`;
  `InvoiceDto.paid: boolean`; `parsePaidBody(raw: unknown): Parsed<boolean>`;
  `PATCH /api/invoice/:id/paid` → `{ id: number; paid: boolean }`.

- [ ] **Step 1: Write the failing integration tests**

Append to `backend/src/__tests__/integration/invoice.test.ts` (it already has `request`,
`prisma` and `seedRecipientAndInvoice()`):

```ts
describe('PATCH /api/invoice/:id/paid', () => {
  it('marks an active invoice as paid and back as unpaid', async () => {
    const { invoice } = await seedRecipientAndInvoice();

    const paid = await request.patch(`/api/invoice/${invoice.id}/paid`).send({ paid: true });
    expect(paid.status).toBe(200);
    expect(paid.body).toEqual({ id: invoice.id, paid: true });
    expect((await prisma.invoice.findUnique({ where: { id: invoice.id } }))?.paid).toBe(true);

    const unpaid = await request.patch(`/api/invoice/${invoice.id}/paid`).send({ paid: false });
    expect(unpaid.status).toBe(200);
    expect(unpaid.body).toEqual({ id: invoice.id, paid: false });
  });

  it('refuses to mark a cancelled invoice as paid', async () => {
    const { invoice } = await seedRecipientAndInvoice();
    await prisma.invoice.update({ where: { id: invoice.id }, data: { status: 'STORNIERT' } });

    const res = await request.patch(`/api/invoice/${invoice.id}/paid`).send({ paid: true });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Cancelled invoices cannot be marked as paid');
    expect((await prisma.invoice.findUnique({ where: { id: invoice.id } }))?.paid).toBe(false);
  });

  it('lets a paid invoice that was cancelled later be marked unpaid', async () => {
    const { invoice } = await seedRecipientAndInvoice();
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: 'STORNIERT', paid: true },
    });

    const res = await request.patch(`/api/invoice/${invoice.id}/paid`).send({ paid: false });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: invoice.id, paid: false });
  });

  it('answers 400 for a body without a boolean paid', async () => {
    const { invoice } = await seedRecipientAndInvoice();
    const res = await request.patch(`/api/invoice/${invoice.id}/paid`).send({ paid: 'yes' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid request body');
  });

  it('answers 404 for an unknown invoice and 400 for an invalid id', async () => {
    expect((await request.patch('/api/invoice/99999/paid').send({ paid: true })).status).toBe(404);
    expect((await request.patch('/api/invoice/abc/paid').send({ paid: true })).status).toBe(400);
  });
});

describe('paid in the invoice list and detail', () => {
  it('starts new invoices as unpaid and reports a paid one', async () => {
    const { invoice } = await seedRecipientAndInvoice();
    expect((await request.get('/api/invoice')).body[0].paid).toBe(false);

    await prisma.invoice.update({ where: { id: invoice.id }, data: { paid: true } });
    expect((await request.get('/api/invoice')).body[0].paid).toBe(true);
    expect((await request.get(`/api/invoice/${invoice.id}`)).body.paid).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:integration --workspace=backend -- invoice.test.ts`
Expected: FAIL — typecheck/Prisma error on `paid` (unknown field) or 404 for the PATCH route.

- [ ] **Step 3: Add the column and the migration**

In `backend/prisma/schema.prisma`, model `Invoice`, after `invoiceDate DateTime`:

```prisma
  paid          Boolean           @default(false)
```

Create `backend/prisma/migrations/20261009120000_add_invoice_paid/migration.sql`:

```sql
-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "paid" BOOLEAN NOT NULL DEFAULT false;
```

Run `npm run generate --workspace=backend` to regenerate the Prisma client.

- [ ] **Step 4: Add `paid` to the shared DTOs**

In `shared/src/index.ts`, add `paid: boolean;` to `InvoiceListItem` (after `status`) and to
`InvoiceDto` (after `status`).

- [ ] **Step 5: Add the body parser**

Append to `backend/src/services/requestParsing.ts`:

```ts
/** PATCH /api/invoice/:id/paid: `{ paid: boolean }`. */
export function parsePaidBody(raw: unknown): Parsed<boolean> {
  return attempt(() => {
    if (!isRecord(raw)) throw new BodyError(INVALID_BODY);
    return flag(raw, 'paid');
  });
}
```

- [ ] **Step 6: Return `paid` and add the PATCH route**

In `backend/src/routes/invoice.ts`:

- add `parsePaidBody` to the `../services/requestParsing.js` import;
- in the list mapping (`const list: InvoiceListItem[] = …`) add `paid: r.paid,` after `status`;
- in `GET /:id` add `paid: invoice.paid,` after `status: invoice.status,`;
- after the `PATCH /:id/cancel` handler add:

```ts
// PATCH /api/invoice/:id/paid
invoiceRouter.patch('/:id/paid', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid ID' });
    return;
  }
  const parsed = parsePaidBody(req.body);
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) {
    res.status(404).json({ error: 'Invoice not found' });
    return;
  }
  // Unmarking is always allowed: a cancelled invoice may still have been paid
  if (parsed.value && invoice.status !== 'AKTIV') {
    res.status(400).json({ error: 'Cancelled invoices cannot be marked as paid' });
    return;
  }

  const updated = await prisma.invoice.update({ where: { id }, data: { paid: parsed.value } });
  res.json({ id: updated.id, paid: updated.paid });
});
```

- [ ] **Step 7: Fix the frontend fixtures the new required field breaks**

Run `npm run typecheck`. In `frontend/src/__tests__/InvoiceView.test.ts` (`invoice()` helper),
`InvoiceDetailView.test.ts` (`makeInvoice()`), and every `InvoiceDto`/`InvoiceListItem` literal in
`InvoiceFormView.test.ts` that typecheck reports, add `paid: false,` after `status`.

- [ ] **Step 8: Run the verification**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add backend/prisma shared/src/index.ts backend/src frontend/src/__tests__
git commit -m "feat: add a paid flag to invoices" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Paid flag in the frontend

**Files:**

- Modify: `frontend/src/utils/statusTags.ts`
- Modify: `frontend/src/views/InvoiceDetailView.vue`
- Modify: `frontend/src/views/InvoiceView.vue`
- Test: `frontend/src/__tests__/statusTags.test.ts`, `InvoiceDetailView.test.ts`, `InvoiceView.test.ts`

**Interfaces:**

- Consumes: `InvoiceDto.paid`, `InvoiceListItem.paid`, `PATCH /api/invoice/:id/paid` (Task 1).
- Produces: `paymentStatusTag(paid: boolean, status: string): StatusTag | null`;
  `PAYMENT_FILTER_OPTIONS: { label: string; value: boolean }[]`.

- [ ] **Step 1: Write the failing tests**

Append to `frontend/src/__tests__/statusTags.test.ts` (add `paymentStatusTag` to its import):

```ts
describe('paymentStatusTag', () => {
  it('shows paid invoices as Paid and active unpaid ones as Open', () => {
    expect(paymentStatusTag(true, 'AKTIV')).toEqual({ label: 'Paid', severity: 'success' });
    expect(paymentStatusTag(true, 'STORNIERT')).toEqual({ label: 'Paid', severity: 'success' });
    expect(paymentStatusTag(false, 'AKTIV')).toEqual({ label: 'Open', severity: 'secondary' });
  });

  it('shows nothing for a cancelled invoice that was never paid', () => {
    expect(paymentStatusTag(false, 'STORNIERT')).toBeNull();
  });
});
```

Append inside `describe('InvoiceDetailView', …)` in `InvoiceDetailView.test.ts`:

```ts
it('marks an open invoice as paid after confirming', async () => {
  replies['PATCH /api/invoice/1/paid'] = { status: 200, body: { id: 1, paid: true } };
  const wrapper = await mountView();
  expect(wrapper.find('[data-testid="payment-status"]').text()).toBe('Open');

  replies['GET /api/invoice/1'] = { status: 200, body: makeInvoice({ paid: true }) };
  await wrapper.find('[data-testid="mark-paid"]').trigger('click');
  await flushPromises();

  expect(confirmAction).toHaveBeenCalledWith(
    expect.objectContaining({ acceptLabel: 'Mark as paid' }),
  );
  const patch = fetchMock.mock.calls.find(([url]) => url === '/api/invoice/1/paid');
  expect(patch?.[1]?.method).toBe('PATCH');
  expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ paid: true });
  expect(notify.success).toHaveBeenCalledWith('Invoice marked as paid');
  expect(wrapper.find('[data-testid="payment-status"]').text()).toBe('Paid');
  expect(wrapper.find('[data-testid="mark-paid"]').exists()).toBe(false);
  expect(wrapper.find('[data-testid="mark-unpaid"]').exists()).toBe(true);
});

it('marks a paid invoice as unpaid after confirming', async () => {
  replies['GET /api/invoice/1'] = { status: 200, body: makeInvoice({ paid: true }) };
  replies['PATCH /api/invoice/1/paid'] = { status: 200, body: { id: 1, paid: false } };
  const wrapper = await mountView();

  await wrapper.find('[data-testid="mark-unpaid"]').trigger('click');
  await flushPromises();

  const patch = fetchMock.mock.calls.find(([url]) => url === '/api/invoice/1/paid');
  expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ paid: false });
  expect(notify.success).toHaveBeenCalledWith('Invoice marked as unpaid');
});

it('changes nothing when the confirmation is declined', async () => {
  confirmAction.mockResolvedValue(false);
  const wrapper = await mountView();
  await wrapper.find('[data-testid="mark-paid"]').trigger('click');
  await flushPromises();
  expect(calls()).not.toContain('PATCH /api/invoice/1/paid');
});

it('offers no paid button for a cancelled open invoice, but unpaid for a cancelled paid one', async () => {
  replies['GET /api/invoice/1'] = { status: 200, body: makeInvoice({ status: 'STORNIERT' }) };
  const open = await mountView();
  expect(open.find('[data-testid="mark-paid"]').exists()).toBe(false);
  expect(open.find('[data-testid="payment-status"]').text()).toBe('—');

  replies['GET /api/invoice/1'] = {
    status: 200,
    body: makeInvoice({ status: 'STORNIERT', paid: true }),
  };
  const paid = await mountView();
  expect(paid.find('[data-testid="mark-unpaid"]').exists()).toBe(true);
});
```

In `InvoiceView.test.ts`, give invoice id 2 `paid: true` in the `invoices` array, then append
inside `describe('InvoiceView', …)`:

```ts
it('shows the payment state and filters by it', async () => {
  const wrapper = await mountView();
  const bernd = rows(wrapper).find((row) => row.text().includes('Bernd Bach'));
  const anna = rows(wrapper).find((row) => row.text().includes('Anna Alt'));
  expect(bernd?.text()).toContain('Paid');
  expect(anna?.text()).toContain('Open');

  await setFilter(wrapper, 'paid', true);
  expect(rows(wrapper).map((row) => row.text())).toEqual([expect.stringContaining('Bernd Bach')]);

  await setFilter(wrapper, 'paid', false);
  expect(rows(wrapper).map((row) => row.text())).toEqual([expect.stringContaining('Anna Alt')]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit --workspace=frontend -- statusTags InvoiceDetailView InvoiceView`
Expected: FAIL — `paymentStatusTag` is not exported; `payment-status` / `mark-paid` not found;
filter `paid` unknown.

- [ ] **Step 3: Add the tag helpers**

Append to `frontend/src/utils/statusTags.ts`:

```ts
/** Paid, or Open while an active invoice is still owed; nothing for a cancelled unpaid one. */
export function paymentStatusTag(paid: boolean, status: string): StatusTag | null {
  if (paid) return { label: 'Paid', severity: 'success' };
  return status === 'AKTIV' ? { label: 'Open', severity: 'secondary' } : null;
}

/** Column filter of the invoice list; cleared means all. */
export const PAYMENT_FILTER_OPTIONS: { label: string; value: boolean }[] = [
  { label: 'Open', value: false },
  { label: 'Paid', value: true },
];
```

- [ ] **Step 4: Detail view**

In `frontend/src/views/InvoiceDetailView.vue`:

Script — add `paymentStatusTag` to the `../utils/statusTags` import, and after `cancel()`:

```ts
const paymentTag = computed(() =>
  invoice.value ? paymentStatusTag(invoice.value.paid, invoice.value.status) : null,
);

async function setPaid(paid: boolean) {
  if (!invoice.value) return;
  const confirmed = await confirmAction({
    message: paid
      ? `Mark invoice ${invoice.value.number} as paid?`
      : `Mark invoice ${invoice.value.number} as unpaid?`,
    header: paid ? 'Mark as paid' : 'Mark as unpaid',
    acceptLabel: paid ? 'Mark as paid' : 'Mark as unpaid',
  });
  if (!confirmed) return;
  const ok = await run(
    'paid',
    () =>
      fetch(`/api/invoice/${id}/paid`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paid }),
      }),
    (body) => body.error || 'Error saving the payment state',
  );
  if (ok) {
    notify.success(paid ? 'Invoice marked as paid' : 'Invoice marked as unpaid');
    await loadData();
  }
}
```

Template — in the header actions, before the "Cancel invoice" button:

```vue
<Button
  v-if="isActive && !invoice.paid"
  label="Mark as paid"
  icon="pi pi-check-circle"
  severity="success"
  outlined
  :loading="busy.paid"
  data-testid="mark-paid"
  @click="setPaid(true)"
/>
<Button
  v-if="invoice.paid"
  label="Mark as unpaid"
  icon="pi pi-undo"
  severity="secondary"
  outlined
  :loading="busy.paid"
  data-testid="mark-unpaid"
  @click="setPaid(false)"
/>
```

In the facts card, after the Status `<div>`:

```vue
<div>
              <dt>Payment</dt>
              <dd>
                <StatusTag v-if="paymentTag" :tag="paymentTag" data-testid="payment-status" />
                <span v-else data-testid="payment-status">—</span>
              </dd>
            </div>
```

- [ ] **Step 5: List view**

In `frontend/src/views/InvoiceView.vue`:

- add `PAYMENT_FILTER_OPTIONS` and `paymentStatusTag` to the `../utils/statusTags` import;
- in `defaultFilters()` add `paid: { value: null, matchMode: FilterMatchMode.EQUALS },`;
- add a column after the Email column:

```vue
<Column field="paid" header="Payment" :show-filter-menu="false" class="col-payment">
          <template #body="{ data }">
            <StatusTag
              v-if="paymentStatusTag(data.paid, data.status)"
              :tag="paymentStatusTag(data.paid, data.status)!"
            />
          </template>
          <template #filter="{ filterModel, filterCallback }">
            <Select
              v-model="filterModel.value"
              :options="PAYMENT_FILTER_OPTIONS"
              option-label="label"
              option-value="value"
              placeholder="Any"
              fluid
              show-clear
              size="small"
              aria-label="Filter by payment"
              @change="filterCallback()"
            />
          </template>
        </Column>
```

- add to the scoped styles:

```css
:deep(.col-payment) {
  width: 8rem;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test:unit --workspace=frontend -- statusTags InvoiceDetailView InvoiceView`
Expected: PASS.

- [ ] **Step 7: Run the verification**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src
git commit -m "feat: mark invoices as paid or unpaid in the app" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Shared payment types and the matcher

**Files:**

- Create: `shared/src/invoicePayments.ts`
- Modify: `shared/src/index.ts` (re-export)
- Create: `backend/src/services/paymentMatching.ts`
- Test: `backend/src/__tests__/unit/paymentMatching.test.ts`

**Interfaces:**

- Produces (shared): `BOOKING_ENCODINGS`, `BookingEncoding`, `BOOKING_DELIMITERS`,
  `BookingDelimiter`, `BOOKING_COLUMN_KEYS`, `BookingColumnKey`, `BookingColumns`,
  `BookingImportSettings`, `DEFAULT_BOOKING_IMPORT_SETTINGS`, `MAX_BOOKINGS_PER_MATCH`,
  `MAX_COLUMN_NAME_LENGTH`, `Booking`, `MatchLevel`, `MatchReason`, `MatchCandidate`,
  `BookingMatch`, `MatchResult` (exact definitions below).
- Produces (backend): `interface OpenInvoice`, `findInvoiceNumber(purpose, runningNumber, year):
'STRONG' | 'WEAK' | null`, `nameWords(name): string[]`, `nameMatches(invoiceName, payer):
boolean`, `matchBookings(bookings: Booking[], invoices: OpenInvoice[]): MatchResult`.

- [ ] **Step 1: Create the shared types**

`shared/src/invoicePayments.ts`:

```ts
/** Text encodings a bank export may use. */
export const BOOKING_ENCODINGS = ['utf-16le', 'utf-8', 'windows-1252'] as const;
export type BookingEncoding = (typeof BOOKING_ENCODINGS)[number];

export const BOOKING_DELIMITERS = [';', ',', '\t'] as const;
export type BookingDelimiter = (typeof BOOKING_DELIMITERS)[number];

/** The four columns the import needs, mapped to header names of the file. */
export const BOOKING_COLUMN_KEYS = ['date', 'payer', 'purpose', 'amount'] as const;
export type BookingColumnKey = (typeof BOOKING_COLUMN_KEYS)[number];
export type BookingColumns = Record<BookingColumnKey, string>;

export interface BookingImportSettings {
  encoding: BookingEncoding;
  delimiter: BookingDelimiter;
  /** Header names; '' when unset. */
  columns: BookingColumns;
}

/** The bank's export format; used until the user saves other values. */
export const DEFAULT_BOOKING_IMPORT_SETTINGS: BookingImportSettings = {
  encoding: 'utf-16le',
  delimiter: ';',
  columns: {
    date: 'Buchungstag',
    payer: 'Empfänger',
    purpose: 'Verwendungszweck',
    amount: 'Betrag',
  },
};

export const MAX_BOOKINGS_PER_MATCH = 10_000;
export const MAX_COLUMN_NAME_LENGTH = 200;

/** One incoming booking of the file. */
export interface Booking {
  /** 1-based data row in the file (the header is not counted). */
  row: number;
  /** YYYY-MM-DD */
  date: string;
  payer: string;
  purpose: string;
  /** Always positive: only incoming bookings are matched. */
  amountCents: number;
}

export type MatchLevel = 'CONFIDENT' | 'AMOUNT_ONLY' | 'AMOUNT_DIFFERS';
export type MatchReason = 'AMOUNT' | 'INVOICE_NUMBER' | 'NAME';

export interface MatchCandidate {
  invoiceId: number;
  invoiceNumber: string;
  recipientName: string;
  /** YYYY-MM-DD */
  invoiceDate: string;
  amountCents: number;
  reasons: MatchReason[];
  /** Booking amount minus invoice amount. */
  differenceCents: number;
}

export interface BookingMatch {
  booking: Booking;
  level: MatchLevel;
  candidates: MatchCandidate[];
}

export interface MatchResult {
  matches: BookingMatch[];
  unmatched: Booking[];
}
```

In `shared/src/index.ts`, next to the other re-exports, add:

```ts
export * from './invoicePayments.js';
```

- [ ] **Step 2: Write the failing unit tests**

`backend/src/__tests__/unit/paymentMatching.test.ts`:

```ts
import type { Booking } from 'shared';
import { describe, expect, it } from 'vitest';
import {
  findInvoiceNumber,
  matchBookings,
  nameMatches,
  nameWords,
  type OpenInvoice,
} from '../../services/paymentMatching';

function invoice(overrides: Partial<OpenInvoice> = {}): OpenInvoice {
  return {
    id: 1,
    number: '12 / 2026',
    year: 2026,
    runningNumber: 12,
    invoiceDate: '2026-03-01',
    name: 'Musikschule Klangwelt GmbH',
    amountCents: 5950,
    ...overrides,
  };
}

function booking(overrides: Partial<Booking> = {}): Booking {
  return {
    row: 1,
    date: '2026-03-10',
    payer: 'Klangwelt Musikschule',
    purpose: 'Miete Maerz',
    amountCents: 5950,
    ...overrides,
  };
}

describe('findInvoiceNumber', () => {
  it.each([
    '12/2026',
    '12 / 26',
    '12-2026',
    'RE 12 2026',
    '2026/12',
    'Nr. 012/2026',
    'ReNr. 12.26',
    'Rechnung 12_2026 Danke',
  ])('finds 12 / 2026 in %j', (purpose) => {
    expect(findInvoiceNumber(purpose, 12, 2026)).toBe('STRONG');
  });

  it.each([
    '112/2026',
    '12/2025',
    '1220 26',
    '202612',
    'DATUM 22.12.2026',
    '2026-12-05',
    'um 12.26 Uhr',
  ])('finds no number 12 / 2026 in %j', (purpose) => {
    expect(findInvoiceNumber(purpose, 12, 2026)).toBeNull();
  });

  it('does not read the date or time of a card payment as an invoice number', () => {
    const purpose = 'ReNr 1011496 DATUM 22.03.2025, 12.21 UHR';
    expect(findInvoiceNumber(purpose, 3, 2025)).toBeNull();
    expect(findInvoiceNumber(purpose, 12, 2021)).toBeNull();
  });

  it.each(['Rechnung 12', 'RE: 12', 'Rg. 12 Miete', 'Rechnungsnr. 012', 'Re-Nr 12'])(
    'reads %j as a weak hint',
    (purpose) => {
      expect(findInvoiceNumber(purpose, 12, 2026)).toBe('WEAK');
    },
  );

  it.each(['Mitgliedsnr 12', 'Rechnung 120', 'Rechnung 12/2025', 'Kurs 12'])(
    'reads no hint in %j',
    (purpose) => {
      expect(findInvoiceNumber(purpose, 12, 2026)).toBeNull();
    },
  );
});

describe('nameWords', () => {
  it('normalises umlauts, case and punctuation and drops legal forms and short words', () => {
    expect(nameWords('Müller & Söhne GmbH & Co. KG')).toEqual(['mueller', 'soehne']);
    expect(nameWords('Turnverein Groß e.V.')).toEqual(['turnverein', 'gross']);
  });
});

describe('nameMatches', () => {
  it('matches when at least half of the invoice name is in the payer', () => {
    expect(nameMatches('Musikschule Klangwelt GmbH', 'KLANGWELT MUSIKSCHULE')).toBe(true);
    expect(nameMatches('Anna Müller', 'Mueller, Anna')).toBe(true);
    expect(nameMatches('Max Mustermann Peter Huber', 'Max Huber')).toBe(true);
  });

  it('does not match other names or names without usable words', () => {
    expect(nameMatches('Anna Müller', 'Stadtwerke Nord')).toBe(false);
    expect(nameMatches('Max Mustermann Peter Huber', 'Max Meier')).toBe(false);
    expect(nameMatches('AG', 'AG Nord')).toBe(false);
  });
});

describe('matchBookings', () => {
  it('is confident when the amount and the name agree', () => {
    expect(matchBookings([booking()], [invoice()])).toEqual({
      matches: [
        {
          booking: booking(),
          level: 'CONFIDENT',
          candidates: [
            {
              invoiceId: 1,
              invoiceNumber: '12 / 2026',
              recipientName: 'Musikschule Klangwelt GmbH',
              invoiceDate: '2026-03-01',
              amountCents: 5950,
              reasons: ['AMOUNT', 'NAME'],
              differenceCents: 0,
            },
          ],
        },
      ],
      unmatched: [],
    });
  });

  it('is confident when the amount and the invoice number agree', () => {
    const result = matchBookings(
      [booking({ payer: 'Unbekannt', purpose: 'RE 12/2026' })],
      [invoice()],
    );
    expect(result.matches[0].level).toBe('CONFIDENT');
    expect(result.matches[0].candidates[0].reasons).toEqual(['AMOUNT', 'INVOICE_NUMBER']);
  });

  it('proposes an amount-only match, listing a weak number hint', () => {
    const result = matchBookings(
      [booking({ payer: 'Unbekannt', purpose: 'Rechnung 12' })],
      [invoice()],
    );
    expect(result.matches[0].level).toBe('AMOUNT_ONLY');
    expect(result.matches[0].candidates[0].reasons).toEqual(['AMOUNT', 'INVOICE_NUMBER']);
  });

  it('flags a differing amount when the invoice number is clearly given', () => {
    const result = matchBookings(
      [booking({ payer: 'Unbekannt', purpose: 'RE 12/2026', amountCents: 5850 })],
      [invoice()],
    );
    expect(result.matches[0].level).toBe('AMOUNT_DIFFERS');
    expect(result.matches[0].candidates[0]).toMatchObject({
      reasons: ['INVOICE_NUMBER'],
      differenceCents: -100,
    });
  });

  it('proposes nothing for a differing amount with only a name or a weak number', () => {
    const byName = booking({ amountCents: 5850 });
    const byWeakNumber = booking({ row: 2, payer: 'X', purpose: 'Rechnung 12', amountCents: 5850 });
    expect(matchBookings([byName, byWeakNumber], [invoice()])).toEqual({
      matches: [],
      unmatched: [byName, byWeakNumber],
    });
  });

  it('keeps only the best level of a booking', () => {
    const amountOnly = invoice({ id: 1, name: 'Ganz Anders' });
    const differs = invoice({ id: 2, number: '13 / 2026', runningNumber: 13, amountCents: 4000 });
    const result = matchBookings(
      [booking({ payer: 'Unbekannt', purpose: 'RE 13/2026' })],
      [amountOnly, differs],
    );
    expect(result.matches[0].level).toBe('AMOUNT_DIFFERS');
    expect(result.matches[0].candidates.map((c) => c.invoiceId)).toEqual([2]);

    const confident = invoice({ id: 3, number: '14 / 2026', runningNumber: 14 });
    const best = matchBookings([booking({ purpose: 'RE 13/2026' })], [differs, confident]);
    expect(best.matches[0].level).toBe('CONFIDENT');
    expect(best.matches[0].candidates.map((c) => c.invoiceId)).toEqual([3]);
  });

  it('lists every candidate of the best level, by invoice number', () => {
    const twelve = invoice({ id: 1, name: 'Erste Firma' });
    const three = invoice({ id: 2, number: '3 / 2026', runningNumber: 3, name: 'Zweite Firma' });
    const result = matchBookings([booking({ payer: 'Unbekannt' })], [twelve, three]);
    expect(result.matches[0].level).toBe('AMOUNT_ONLY');
    expect(result.matches[0].candidates.map((c) => c.invoiceId)).toEqual([2, 1]);
  });

  it('ignores invoices dated after the booking, but not on the same day', () => {
    const later = invoice({ invoiceDate: '2026-03-11' });
    expect(matchBookings([booking()], [later]).unmatched).toHaveLength(1);
    const sameDay = invoice({ invoiceDate: '2026-03-10' });
    expect(matchBookings([booking()], [sameDay]).matches).toHaveLength(1);
  });

  it('sorts confident first, then differing amounts, then amount only', () => {
    const result = matchBookings(
      [
        booking({ row: 1, payer: 'Unbekannt' }),
        booking({ row: 2 }),
        booking({ row: 3, payer: 'Unbekannt', purpose: 'RE 12/2026', amountCents: 100 }),
      ],
      [invoice()],
    );
    expect(result.matches.map((m) => m.booking.row)).toEqual([2, 3, 1]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test:unit --workspace=backend -- paymentMatching`
Expected: FAIL — cannot resolve `../../services/paymentMatching`.

- [ ] **Step 4: Implement the matcher**

`backend/src/services/paymentMatching.ts`:

```ts
import type {
  Booking,
  BookingMatch,
  MatchCandidate,
  MatchLevel,
  MatchReason,
  MatchResult,
} from 'shared';

/** An active, unpaid invoice as the matcher needs it. */
export interface OpenInvoice {
  id: number;
  /** "12 / 2026" */
  number: string;
  year: number;
  runningNumber: number;
  /** YYYY-MM-DD */
  invoiceDate: string;
  /** Name on the active revision. */
  name: string;
  /** Gross amount of the active revision. */
  amountCents: number;
}

export type NumberSignal = 'STRONG' | 'WEAK' | null;

const SEPARATOR = String.raw`[\s/\-_.]+`;
// A number chained to its neighbours by . / - belongs to a date (22.03.2025) or a longer
// reference, and a number followed by "Uhr" is a time: neither is an invoice number.
const NOT_CHAINED_BEFORE = String.raw`(?<!\d)(?<!\d[./-])`;
const NOT_CHAINED_AFTER = String.raw`(?!\d)(?![./-]\d)(?!\s*uhr)`;
const KEYWORD = String.raw`(?:rechnungs?(?:nr|nummer)?|re-?nr|re|rg|nr)`;

/** Running number and year next to each other, in either order: "12/2026", "2026-12", "12 26". */
function strongPattern(runningNumber: number, year: number): RegExp {
  const run = `0*${runningNumber}`;
  const yearText = `(?:${year}|${String(year % 100).padStart(2, '0')})`;
  return new RegExp(
    `${NOT_CHAINED_BEFORE}(?:${run}${SEPARATOR}${yearText}|${yearText}${SEPARATOR}${run})` +
      NOT_CHAINED_AFTER,
    'i',
  );
}

/** Only the running number, right after a keyword such as "Rechnung" or "RE". */
function weakPattern(runningNumber: number): RegExp {
  return new RegExp(
    String.raw`(?<![a-z])${KEYWORD}\.?\s*:?\s*0*${runningNumber}${NOT_CHAINED_AFTER}`,
    'i',
  );
}

function numberSignal(purpose: string, strong: RegExp, weak: RegExp): NumberSignal {
  if (strong.test(purpose)) return 'STRONG';
  if (weak.test(purpose)) return 'WEAK';
  return null;
}

/** How clearly the purpose text names invoice `<runningNumber> / <year>`. */
export function findInvoiceNumber(
  purpose: string,
  runningNumber: number,
  year: number,
): NumberSignal {
  return numberSignal(purpose, strongPattern(runningNumber, year), weakPattern(runningNumber));
}

// Shorter legal forms (e.V., UG, AG, KG, Co) fall out with the words below three letters.
const LEGAL_FORMS = new Set(['gmbh', 'mbh', 'ohg', 'gbr']);

/** The words of a name that can identify it: lower case, umlauts spelled out, no legal forms. */
export function nameWords(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3 && !LEGAL_FORMS.has(word));
}

function wordsMatch(invoiceWords: string[], payer: string): boolean {
  if (invoiceWords.length === 0) return false;
  const payerWords = new Set(nameWords(payer));
  const found = invoiceWords.filter((word) => payerWords.has(word)).length;
  return found * 2 >= invoiceWords.length;
}

/** At least half of the invoice name's words occur in the payer. */
export function nameMatches(invoiceName: string, payer: string): boolean {
  return wordsMatch(nameWords(invoiceName), payer);
}

const LEVEL_RANK: Record<MatchLevel, number> = { CONFIDENT: 0, AMOUNT_DIFFERS: 1, AMOUNT_ONLY: 2 };

interface PreparedInvoice {
  invoice: OpenInvoice;
  strong: RegExp;
  weak: RegExp;
  words: string[];
}

function rate(
  booking: Booking,
  prepared: PreparedInvoice,
): { level: MatchLevel; candidate: MatchCandidate } | null {
  const { invoice } = prepared;
  const amount = booking.amountCents === invoice.amountCents;
  const number = numberSignal(booking.purpose, prepared.strong, prepared.weak);
  const name = wordsMatch(prepared.words, booking.payer);

  let level: MatchLevel | null = null;
  if (amount && (number === 'STRONG' || name)) level = 'CONFIDENT';
  else if (amount) level = 'AMOUNT_ONLY';
  else if (number === 'STRONG') level = 'AMOUNT_DIFFERS';
  if (!level) return null;

  const reasons: MatchReason[] = [];
  if (amount) reasons.push('AMOUNT');
  if (number) reasons.push('INVOICE_NUMBER');
  if (name) reasons.push('NAME');

  return {
    level,
    candidate: {
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      recipientName: invoice.name,
      invoiceDate: invoice.invoiceDate,
      amountCents: invoice.amountCents,
      reasons,
      differenceCents: booking.amountCents - invoice.amountCents,
    },
  };
}

/**
 * Proposes invoices for incoming bookings. Each booking appears once, with its best level and
 * every candidate of that level; bookings without any candidate are `unmatched`.
 */
export function matchBookings(bookings: Booking[], invoices: OpenInvoice[]): MatchResult {
  const prepared: PreparedInvoice[] = [...invoices]
    .sort((a, b) => a.year - b.year || a.runningNumber - b.runningNumber)
    .map((invoice) => ({
      invoice,
      strong: strongPattern(invoice.runningNumber, invoice.year),
      weak: weakPattern(invoice.runningNumber),
      words: nameWords(invoice.name),
    }));

  const matches: BookingMatch[] = [];
  const unmatched: Booking[] = [];
  for (const booking of bookings) {
    let best: BookingMatch | null = null;
    for (const entry of prepared) {
      if (entry.invoice.invoiceDate > booking.date) continue;
      const rated = rate(booking, entry);
      if (!rated) continue;
      if (!best || LEVEL_RANK[rated.level] < LEVEL_RANK[best.level]) {
        best = { booking, level: rated.level, candidates: [rated.candidate] };
      } else if (rated.level === best.level) {
        best.candidates.push(rated.candidate);
      }
    }
    if (best) matches.push(best);
    else unmatched.push(booking);
  }

  matches.sort(
    (a, b) =>
      LEVEL_RANK[a.level] - LEVEL_RANK[b.level] ||
      a.booking.date.localeCompare(b.booking.date) ||
      a.booking.row - b.booking.row,
  );
  return { matches, unmatched };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:unit --workspace=backend -- paymentMatching`
Expected: PASS. If a spelling case fails, fix the pattern, not the test — the cases are the spec.

- [ ] **Step 6: Run the verification**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add shared/src backend/src/services/paymentMatching.ts backend/src/__tests__/unit/paymentMatching.test.ts
git commit -m "feat: match bank bookings to open invoices" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Import settings, match and confirm endpoints

**Files:**

- Modify: `backend/src/services/requestParsing.ts`
- Modify: `backend/src/routes/settings.ts`
- Create: `backend/src/routes/invoicePayment.ts`
- Modify: `backend/src/routes/index.ts`, `backend/src/app.ts`
- Test: `backend/src/__tests__/integration/settings.test.ts` (append),
  `backend/src/__tests__/integration/invoicePayment.test.ts` (new)

**Interfaces:**

- Consumes: shared payment types (Task 3), `matchBookings`, `OpenInvoice` (Task 3),
  `Invoice.paid` (Task 1), `calculateGross(positionsJson, vat)` from
  `services/invoiceCreation.ts`.
- Produces: `GET/PUT /api/settings/booking-import` (`BookingImportSettings`);
  `POST /api/invoice-payment/match` (`{ bookings: Booking[] }` → `MatchResult`);
  `POST /api/invoice-payment/confirm` (`{ invoiceIds: number[] }` → `{ marked: number }`, 400
  `{ error: 'MISSING_IDS' | 'DUPLICATE_IDS' | 'NOT_FOUND' | 'CANCELLED', ids: number[] }`).

- [ ] **Step 1: Write the failing settings tests**

Append to `backend/src/__tests__/integration/settings.test.ts` (add the import at the top):

```ts
import { DEFAULT_BOOKING_IMPORT_SETTINGS } from '../../../../shared/src/invoicePayments';
```

```ts
describe('booking import settings', () => {
  const custom = {
    encoding: 'utf-8',
    delimiter: '\t',
    columns: { date: 'Datum', payer: 'Name', purpose: 'Text', amount: 'Umsatz' },
  };

  it('answers the defaults when nothing is stored', async () => {
    const res = await request.get('/api/settings/booking-import');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(DEFAULT_BOOKING_IMPORT_SETTINGS);
  });

  it('stores the settings and answers them on the next GET', async () => {
    const put = await request.put('/api/settings/booking-import').send(custom);
    expect(put.status).toBe(200);
    expect(put.body).toEqual(custom);
    expect((await request.get('/api/settings/booking-import')).body).toEqual(custom);
  });

  it.each([
    { ...custom, encoding: 'latin1' },
    { ...custom, delimiter: '|' },
    { ...custom, columns: { ...custom.columns, date: 5 } },
    { ...custom, columns: { date: 'Datum', payer: 'Name', purpose: 'Text' } },
    { ...custom, columns: { ...custom.columns, date: 'x'.repeat(201) } },
    { encoding: 'utf-8', delimiter: ';' },
  ])('rejects %j', async (body) => {
    const res = await request.put('/api/settings/booking-import').send(body);
    expect(res.status).toBe(400);
    expect((await request.get('/api/settings/booking-import')).body).toEqual(
      DEFAULT_BOOKING_IMPORT_SETTINGS,
    );
  });

  it('falls back to the defaults when the stored value is unreadable', async () => {
    await prisma.systemSetting.create({ data: { key: 'bookingImport', value: '{oops' } });
    const res = await request.get('/api/settings/booking-import');
    expect(res.body).toEqual(DEFAULT_BOOKING_IMPORT_SETTINGS);
  });

  it('keeps the booking import out of the general settings', async () => {
    await request.put('/api/settings/booking-import').send(custom);
    const res = await request.get('/api/settings');
    expect(res.body).not.toHaveProperty('bookingImport');
  });
});
```

- [ ] **Step 2: Write the failing payment tests**

`backend/src/__tests__/integration/invoicePayment.test.ts`:

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

let nextRunningNumber = 1;

async function seedInvoice(
  options: { name?: string; netCents?: number; status?: string; paid?: boolean } = {},
) {
  const template =
    (await prisma.template.findFirst()) ??
    (await prisma.template.create({
      data: {
        type: 'RECHNUNG',
        version: 1,
        fileName: 'template.docx',
        filePath: 'templates/template.docx',
        active: true,
      },
    }));
  const runningNumber = nextRunningNumber++;
  const name = options.name ?? 'Musikschule Klangwelt';
  const invoiceDate = new Date('2026-03-01T00:00:00.000Z');
  const recipient = await prisma.invoiceRecipient.create({
    data: { name, street: 'Weg 1', city: 'Stadt' },
  });
  const invoice = await prisma.invoice.create({
    data: {
      number: `${runningNumber} / 2026`,
      year: 2026,
      runningNumber,
      recipientId: recipient.id,
      invoiceDate,
      status: options.status ?? 'AKTIV',
      paid: options.paid ?? false,
    },
  });
  await prisma.invoiceRevision.create({
    data: {
      invoiceId: invoice.id,
      revisionNumber: 1,
      salutation: '',
      name,
      street: 'Weg 1',
      city: 'Stadt',
      invoiceDate,
      title: 'Miete',
      positions: JSON.stringify([{ text: 'Miete', priceInCents: options.netCents ?? 5000 }]),
      vat: 19,
      directDebit: false,
      email: '',
      emailSalutation: '',
      templateId: template.id,
      pdfStatus: 'OK',
    },
  });
  return invoice;
}

function booking(overrides: Record<string, unknown> = {}) {
  return {
    row: 1,
    date: '2026-03-10',
    payer: 'Musikschule Klangwelt',
    purpose: 'Miete',
    amountCents: 5950,
    ...overrides,
  };
}

async function isPaid(id: number) {
  return (await prisma.invoice.findUnique({ where: { id } }))?.paid;
}

describe('POST /api/invoice-payment/match', () => {
  it('proposes an open invoice by its gross amount and name, without changing it', async () => {
    const invoice = await seedInvoice();
    const res = await request.post('/api/invoice-payment/match').send({ bookings: [booking()] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      matches: [
        {
          booking: booking(),
          level: 'CONFIDENT',
          candidates: [
            {
              invoiceId: invoice.id,
              invoiceNumber: invoice.number,
              recipientName: 'Musikschule Klangwelt',
              invoiceDate: '2026-03-01',
              amountCents: 5950,
              reasons: ['AMOUNT', 'NAME'],
              differenceCents: 0,
            },
          ],
        },
      ],
      unmatched: [],
    });
    expect(await isPaid(invoice.id)).toBe(false);
  });

  it('ignores cancelled and paid invoices', async () => {
    await seedInvoice({ status: 'STORNIERT' });
    await seedInvoice({ paid: true });
    const res = await request.post('/api/invoice-payment/match').send({ bookings: [booking()] });
    expect(res.body).toEqual({ matches: [], unmatched: [booking()] });
  });

  it.each([
    {},
    { bookings: 'x' },
    { bookings: [booking({ date: '10.03.2026' })] },
    { bookings: [booking({ date: '2026-02-30' })] },
    { bookings: [booking({ amountCents: -5 })] },
    { bookings: [booking({ amountCents: 12.5 })] },
    { bookings: [booking({ row: 0 })] },
    { bookings: [booking({ payer: null })] },
  ])('rejects %j', async (body) => {
    const res = await request.post('/api/invoice-payment/match').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid request body');
  });

  it('rejects more than 10000 bookings', async () => {
    const bookings = Array.from({ length: 10_001 }, (_, i) => booking({ row: i + 1 }));
    const res = await request.post('/api/invoice-payment/match').send({ bookings });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('At most 10000 bookings per match');
  });

  it('accepts a year of bookings above the general 100 kB body limit', async () => {
    const bookings = Array.from({ length: 3000 }, (_, i) =>
      booking({ row: i + 1, purpose: 'x'.repeat(60) }),
    );
    const res = await request.post('/api/invoice-payment/match').send({ bookings });
    expect(res.status).toBe(200);
    expect(res.body.unmatched).toHaveLength(3000);
  });

  it('answers 413 for a body above 2 MB', async () => {
    const bookings = Array.from({ length: 2500 }, (_, i) =>
      booking({ row: i + 1, purpose: 'x'.repeat(1000) }),
    );
    const res = await request.post('/api/invoice-payment/match').send({ bookings });
    expect(res.status).toBe(413);
  });
});

describe('POST /api/invoice-payment/confirm', () => {
  it('marks every given invoice as paid', async () => {
    const a = await seedInvoice();
    const b = await seedInvoice();
    const res = await request
      .post('/api/invoice-payment/confirm')
      .send({ invoiceIds: [a.id, b.id] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ marked: 2 });
    expect(await isPaid(a.id)).toBe(true);
    expect(await isPaid(b.id)).toBe(true);
  });

  it('accepts an invoice that is already paid', async () => {
    const paid = await seedInvoice({ paid: true });
    const res = await request.post('/api/invoice-payment/confirm').send({ invoiceIds: [paid.id] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ marked: 1 });
  });

  it('changes nothing when an invoice is unknown', async () => {
    const open = await seedInvoice();
    const res = await request
      .post('/api/invoice-payment/confirm')
      .send({ invoiceIds: [open.id, 99999] });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'NOT_FOUND', ids: [99999] });
    expect(await isPaid(open.id)).toBe(false);
  });

  it('changes nothing when an invoice is cancelled', async () => {
    const open = await seedInvoice();
    const cancelled = await seedInvoice({ status: 'STORNIERT' });
    const res = await request
      .post('/api/invoice-payment/confirm')
      .send({ invoiceIds: [open.id, cancelled.id] });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'CANCELLED', ids: [cancelled.id] });
    expect(await isPaid(open.id)).toBe(false);
  });

  it('rejects an invoice given twice', async () => {
    const open = await seedInvoice();
    const res = await request
      .post('/api/invoice-payment/confirm')
      .send({ invoiceIds: [open.id, open.id] });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'DUPLICATE_IDS', ids: [] });
  });

  it.each([{}, { invoiceIds: [] }, { invoiceIds: ['1'] }, { invoiceIds: [1.5] }])(
    'rejects %j',
    async (body) => {
      const res = await request.post('/api/invoice-payment/confirm').send(body);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'MISSING_IDS', ids: [] });
    },
  );
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test:integration --workspace=backend -- settings invoicePayment`
Expected: FAIL — 404 for the new routes.

- [ ] **Step 4: Add the body parsers**

In `backend/src/services/requestParsing.ts`, extend the imports:

```ts
import type {
  Booking,
  BookingColumns,
  BookingImportSettings,
  InvoiceContent,
  InvoiceLineItem,
  ReceiptInputs,
} from 'shared';
import {
  BOOKING_COLUMN_KEYS,
  BOOKING_DELIMITERS,
  BOOKING_ENCODINGS,
  MAX_BOOKINGS_PER_MATCH,
  MAX_COLUMN_NAME_LENGTH,
} from '../../../shared/src/invoicePayments.js';
```

and append:

```ts
/** Import settings for bank bookings: a known encoding and delimiter, four column names. */
export function parseBookingImportSettings(raw: unknown): Parsed<BookingImportSettings> {
  return attempt(() => {
    if (!isRecord(raw) || !isRecord(raw.columns)) throw new BodyError(INVALID_BODY);
    const encoding = BOOKING_ENCODINGS.find((value) => value === raw.encoding);
    const delimiter = BOOKING_DELIMITERS.find((value) => value === raw.delimiter);
    if (!encoding || !delimiter) throw new BodyError(INVALID_BODY);
    const source = raw.columns;
    const columns = {} as BookingColumns;
    for (const key of BOOKING_COLUMN_KEYS) {
      const name = text(source, key);
      if (name.length > MAX_COLUMN_NAME_LENGTH) throw new BodyError(INVALID_BODY);
      columns[key] = name;
    }
    return { encoding, delimiter, columns };
  });
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** POST /api/invoice-payment/match: incoming bookings as the browser read them from the file. */
export function parseMatchBody(raw: unknown): Parsed<Booking[]> {
  return attempt(() => {
    if (!isRecord(raw) || !Array.isArray(raw.bookings)) throw new BodyError(INVALID_BODY);
    if (raw.bookings.length > MAX_BOOKINGS_PER_MATCH) {
      throw new BodyError(`At most ${MAX_BOOKINGS_PER_MATCH} bookings per match`);
    }
    return raw.bookings.map((item: unknown): Booking => {
      if (!isRecord(item)) throw new BodyError(INVALID_BODY);
      const date = text(item, 'date');
      if (!ISO_DAY.test(date) || !parseCalendarDay(date)) throw new BodyError(INVALID_BODY);
      const row = integer(item, 'row');
      const amountCents = integer(item, 'amountCents');
      if (row < 1 || amountCents <= 0) throw new BodyError(INVALID_BODY);
      return { row, date, payer: text(item, 'payer'), purpose: text(item, 'purpose'), amountCents };
    });
  });
}

/** POST /api/invoice-payment/confirm: distinct invoice ids; the error is the code to answer. */
export function parseConfirmBody(raw: unknown): Parsed<number[]> {
  return attempt(() => {
    const ids = isRecord(raw) ? raw.invoiceIds : undefined;
    if (
      !Array.isArray(ids) ||
      ids.length === 0 ||
      !ids.every((id) => typeof id === 'number' && Number.isSafeInteger(id) && id > 0)
    ) {
      throw new BodyError('MISSING_IDS');
    }
    if (new Set(ids).size !== ids.length) throw new BodyError('DUPLICATE_IDS');
    return ids as number[];
  });
}
```

- [ ] **Step 5: Settings routes**

In `backend/src/routes/settings.ts`:

```ts
import type { BookingImportSettings, SystemSettings } from 'shared';
import { DEFAULT_BOOKING_IMPORT_SETTINGS } from '../../../shared/src/invoicePayments.js';
import { prisma } from '../prismaClient.js';
import { parseBookingImportSettings, parseTextSettings } from '../services/requestParsing.js';
```

and append:

```ts
const BOOKING_IMPORT_KEY = 'bookingImport';

/** The stored import settings; the defaults when none are stored or they cannot be read. */
function storedBookingImportSettings(value: string | undefined): BookingImportSettings {
  if (value) {
    try {
      const parsed = parseBookingImportSettings(JSON.parse(value));
      if ('value' in parsed) return parsed.value;
    } catch {
      // unreadable JSON: fall back to the defaults
    }
  }
  return DEFAULT_BOOKING_IMPORT_SETTINGS;
}

settingsRouter.get('/booking-import', async (_req, res) => {
  const row = await prisma.systemSetting.findUnique({ where: { key: BOOKING_IMPORT_KEY } });
  res.json(storedBookingImportSettings(row?.value));
});

settingsRouter.put('/booking-import', async (req, res) => {
  const parsed = parseBookingImportSettings(req.body);
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const value = JSON.stringify(parsed.value);
  await prisma.systemSetting.upsert({
    where: { key: BOOKING_IMPORT_KEY },
    update: { value },
    create: { key: BOOKING_IMPORT_KEY, value },
  });
  res.json(parsed.value);
});
```

- [ ] **Step 6: Payment routes**

`backend/src/routes/invoicePayment.ts`:

```ts
import { Router } from 'express';
import { prisma } from '../prismaClient.js';
import { calculateGross } from '../services/invoiceCreation.js';
import { matchBookings, type OpenInvoice } from '../services/paymentMatching.js';
import { parseConfirmBody, parseMatchBody } from '../services/requestParsing.js';

export const invoicePaymentRouter = Router();

/** Active, unpaid invoices with the amount and name of their active revision. */
async function loadOpenInvoices(): Promise<OpenInvoice[]> {
  const invoices = await prisma.invoice.findMany({
    where: { status: 'AKTIV', paid: false },
    include: { revisions: { where: { status: 'AKTIV' }, take: 1 } },
  });
  return invoices.flatMap((invoice) => {
    const revision = invoice.revisions[0];
    if (!revision) return [];
    return [
      {
        id: invoice.id,
        number: invoice.number,
        year: invoice.year,
        runningNumber: invoice.runningNumber,
        invoiceDate: invoice.invoiceDate.toISOString().slice(0, 10),
        name: revision.name,
        amountCents: calculateGross(revision.positions, revision.vat),
      },
    ];
  });
}

// POST /api/invoice-payment/match — proposals only, nothing is stored
invoicePaymentRouter.post('/match', async (req, res) => {
  const parsed = parseMatchBody(req.body);
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  res.json(matchBookings(parsed.value, await loadOpenInvoices()));
});

// POST /api/invoice-payment/confirm — all or nothing
invoicePaymentRouter.post('/confirm', async (req, res) => {
  const parsed = parseConfirmBody(req.body);
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error, ids: [] });
    return;
  }
  const ids = parsed.value;

  const result = await prisma.$transaction(async (tx) => {
    const found = await tx.invoice.findMany({
      where: { id: { in: ids } },
      select: { id: true, status: true },
    });
    const statusById = new Map(found.map((invoice) => [invoice.id, invoice.status]));
    const notFound = ids.filter((id) => !statusById.has(id));
    if (notFound.length > 0) return { error: 'NOT_FOUND', ids: notFound };
    const cancelled = ids.filter((id) => statusById.get(id) !== 'AKTIV');
    if (cancelled.length > 0) return { error: 'CANCELLED', ids: cancelled };
    await tx.invoice.updateMany({ where: { id: { in: ids } }, data: { paid: true } });
    return { marked: ids.length };
  });

  if ('error' in result) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});
```

- [ ] **Step 7: Mount the router and the larger body limit**

In `backend/src/routes/index.ts`: import `invoicePaymentRouter` from `./invoicePayment.js` and add
`router.use('/invoice-payment', invoicePaymentRouter);` after the `/invoice-draft` line.

In `backend/src/app.ts`, directly before `app.use(express.json());`:

```ts
// A year of bank bookings exceeds the default 100 kB; a parsed body is skipped by the next parser
app.use('/api/invoice-payment/match', express.json({ limit: '2mb' }));
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npm run test:integration --workspace=backend -- settings invoicePayment`
Expected: PASS.

- [ ] **Step 9: Run the verification**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add backend/src
git commit -m "feat: add booking import settings and payment match endpoints" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Reading the bank export in the browser

**Files:**

- Create: `frontend/src/utils/bookingCsv.ts`
- Test: `frontend/src/__tests__/bookingCsv.test.ts`

**Interfaces:**

- Consumes: `Booking`, `BookingColumns`, `BookingDelimiter`, `BookingEncoding` from `shared`.
- Produces:
  - `decodeBookingFile(data: ArrayBuffer | Uint8Array, encoding: BookingEncoding): { text: string; encoding: BookingEncoding }`
  - `parseCsv(text: string, delimiter: string): string[][]`
  - `readBookingTable(text: string, delimiter: string): BookingTable` with
    `interface BookingTable { header: string[]; rows: string[][] }`
  - `parseGermanAmount(value: string): number | null`
  - `parseGermanDate(value: string): string | null`
  - `interface SkippedRow { row: number; values: string[]; reason: 'AMOUNT' | 'DATE' }`
  - `SKIP_REASON_LABELS: Record<SkippedRow['reason'], string>`
  - `toBookings(rows: string[][], header: string[], columns: BookingColumns): { bookings: Booking[]; skipped: SkippedRow[] }`

- [ ] **Step 1: Write the failing tests**

`frontend/src/__tests__/bookingCsv.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  decodeBookingFile,
  parseCsv,
  parseGermanAmount,
  parseGermanDate,
  readBookingTable,
  toBookings,
} from '../utils/bookingCsv';

function utf16le(text: string, bom = true): Uint8Array {
  const offset = bom ? 2 : 0;
  const bytes = new Uint8Array(offset + text.length * 2);
  if (bom) bytes.set([0xff, 0xfe]);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    bytes[offset + i * 2] = code & 0xff;
    bytes[offset + i * 2 + 1] = code >> 8;
  }
  return bytes;
}

describe('decodeBookingFile', () => {
  it('reads UTF-16 LE and drops the BOM', () => {
    expect(decodeBookingFile(utf16le('Empfänger;Betrag'), 'utf-16le')).toEqual({
      text: 'Empfänger;Betrag',
      encoding: 'utf-16le',
    });
  });

  it('lets a BOM win over the selected encoding', () => {
    expect(decodeBookingFile(utf16le('Grüße'), 'windows-1252')).toEqual({
      text: 'Grüße',
      encoding: 'utf-16le',
    });
    const utf8 = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('Grüße')]);
    expect(decodeBookingFile(utf8, 'utf-16le')).toEqual({ text: 'Grüße', encoding: 'utf-8' });
  });

  it('uses the selected encoding without a BOM', () => {
    const latin = new Uint8Array([0x4d, 0xfc, 0x6c, 0x6c, 0x65, 0x72]);
    expect(decodeBookingFile(latin, 'windows-1252')).toEqual({
      text: 'Müller',
      encoding: 'windows-1252',
    });
    expect(decodeBookingFile(utf16le('Ab', false), 'utf-16le').text).toBe('Ab');
  });
});

describe('parseCsv', () => {
  it('splits rows and fields with CRLF or LF', () => {
    expect(parseCsv('a;b\r\n1;2\r\n', ';')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(parseCsv('a,b\n1,2', ',')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(parseCsv('a\tb\n1\t2', '\t')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('keeps delimiters, quotes and line breaks inside quoted fields', () => {
    expect(parseCsv('a;b\n"x;y";"he said ""hi"""\n"line 1\nline 2";2', ';')).toEqual([
      ['a', 'b'],
      ['x;y', 'he said "hi"'],
      ['line 1\nline 2', '2'],
    ]);
  });

  it('keeps empty fields and skips empty lines', () => {
    expect(parseCsv('a;;c\n\n1;2;3\n\n', ';')).toEqual([
      ['a', '', 'c'],
      ['1', '2', '3'],
    ]);
  });
});

describe('readBookingTable', () => {
  it('splits off the trimmed header', () => {
    expect(readBookingTable(' Buchungstag ;Betrag\n24.03.2025;1,00', ';')).toEqual({
      header: ['Buchungstag', 'Betrag'],
      rows: [['24.03.2025', '1,00']],
    });
    expect(readBookingTable('', ';')).toEqual({ header: [], rows: [] });
  });
});

describe('parseGermanAmount', () => {
  it.each([
    ['-1.284,00', -128400],
    ['53,55', 5355],
    ['1284', 128400],
    ['+5,5', 550],
    [' 59,50 € ', 5950],
    ['-0,00', 0],
    ['1.234.567,89', 123456789],
  ])('reads %j as %d cents', (value, cents) => {
    expect(parseGermanAmount(value)).toBe(cents);
  });

  it.each(['', 'abc', '12,345', '1,284.00', '12.34', '--5'])('cannot read %j', (value) => {
    expect(parseGermanAmount(value)).toBeNull();
  });
});

describe('parseGermanDate', () => {
  it.each([
    ['24.03.2025', '2025-03-24'],
    ['1.3.2025', '2025-03-01'],
    [' 05.06.2025 ', '2025-06-05'],
  ])('reads %j as %s', (value, iso) => {
    expect(parseGermanDate(value)).toBe(iso);
  });

  it.each(['31.02.2025', '2025-03-24', '24.03.25', ''])('cannot read %j', (value) => {
    expect(parseGermanDate(value)).toBeNull();
  });
});

describe('toBookings', () => {
  const header = ['Buchungstag', 'Empfänger', 'Verwendungszweck', 'Betrag'];
  const columns = {
    date: 'Buchungstag',
    payer: 'Empfänger',
    purpose: 'Verwendungszweck',
    amount: 'Betrag',
  };

  it('converts incoming bookings, drops outgoing ones and reports unreadable rows', () => {
    const rows = [
      ['24.03.2025', ' Verlag GmbH ', ' RE 12/2025 ', '59,50'],
      ['25.03.2025', 'Stadtwerke', 'Strom', '-120,00'],
      ['26.03.2025', 'Anna', 'Beitrag', 'zwölf'],
      ['32.03.2025', 'Bernd', 'Beitrag', '10,00'],
      ['27.03.2025', 'Kurz'],
    ];
    expect(toBookings(rows, header, columns)).toEqual({
      bookings: [
        {
          row: 1,
          date: '2025-03-24',
          payer: 'Verlag GmbH',
          purpose: 'RE 12/2025',
          amountCents: 5950,
        },
      ],
      skipped: [
        { row: 3, values: rows[2], reason: 'AMOUNT' },
        { row: 4, values: rows[3], reason: 'DATE' },
        { row: 5, values: rows[4], reason: 'AMOUNT' },
      ],
    });
  });

  it('reads the columns by name, whatever their order', () => {
    const reversed = [...header].reverse();
    const rows = [['10,00', 'Zweck', 'Zahler', '01.04.2025']];
    expect(toBookings(rows, reversed, columns).bookings).toEqual([
      { row: 1, date: '2025-04-01', payer: 'Zahler', purpose: 'Zweck', amountCents: 1000 },
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit --workspace=frontend -- bookingCsv`
Expected: FAIL — cannot resolve `../utils/bookingCsv`.

- [ ] **Step 3: Implement**

`frontend/src/utils/bookingCsv.ts`:

```ts
import type { Booking, BookingColumns, BookingEncoding } from 'shared';

/**
 * Decodes the file bytes. A byte order mark wins over the selected encoding, because it states
 * the encoding for certain; TextDecoder drops the mark from the text.
 */
export function decodeBookingFile(
  data: ArrayBuffer | Uint8Array,
  encoding: BookingEncoding,
): { text: string; encoding: BookingEncoding } {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let detected = encoding;
  if (bytes[0] === 0xff && bytes[1] === 0xfe) detected = 'utf-16le';
  else if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) detected = 'utf-8';
  return { text: new TextDecoder(detected).decode(bytes), encoding: detected };
}

/** RFC 4180 style CSV: quoted fields may hold the delimiter, line breaks and "" for a quote. */
export function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch !== '"') field += ch;
      else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else inQuotes = false;
    } else if (ch === '"' && field === '') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

export interface BookingTable {
  header: string[];
  rows: string[][];
}

/** The header (trimmed, so " Betrag" still maps) and the data rows of the file. */
export function readBookingTable(text: string, delimiter: string): BookingTable {
  const [header = [], ...rows] = parseCsv(text, delimiter);
  return { header: header.map((name) => name.trim()), rows };
}

const AMOUNT = /^([+-])?\s*(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/;

/** "-1.284,00" → -128400 cents; null when the text is no German amount. */
export function parseGermanAmount(value: string): number | null {
  const match = AMOUNT.exec(value.replace('€', '').trim());
  if (!match) return null;
  const euros = Number(match[2].replace(/\./g, ''));
  const cents = Number((match[3] ?? '').padEnd(2, '0'));
  const total = euros * 100 + cents;
  return match[1] === '-' ? -total || 0 : total;
}

const GERMAN_DATE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;

/** "24.03.2025" → "2025-03-24"; null for anything else or an impossible day. */
export function parseGermanDate(value: string): string | null {
  const match = GERMAN_DATE.exec(value.trim());
  if (!match) return null;
  const [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export interface SkippedRow {
  /** 1-based data row in the file. */
  row: number;
  values: string[];
  reason: 'AMOUNT' | 'DATE';
}

export const SKIP_REASON_LABELS: Record<SkippedRow['reason'], string> = {
  AMOUNT: 'Unreadable amount',
  DATE: 'Unreadable date',
};

/**
 * The incoming bookings of the file. Outgoing bookings (amount ≤ 0) are left out without a word;
 * rows whose amount or date cannot be read are reported.
 */
export function toBookings(
  rows: string[][],
  header: string[],
  columns: BookingColumns,
): { bookings: Booking[]; skipped: SkippedRow[] } {
  const at = (values: string[], name: string) => values[header.indexOf(name)] ?? '';
  const bookings: Booking[] = [];
  const skipped: SkippedRow[] = [];
  rows.forEach((values, index) => {
    const row = index + 1;
    const amountCents = parseGermanAmount(at(values, columns.amount));
    if (amountCents === null) {
      skipped.push({ row, values, reason: 'AMOUNT' });
      return;
    }
    if (amountCents <= 0) return;
    const date = parseGermanDate(at(values, columns.date));
    if (date === null) {
      skipped.push({ row, values, reason: 'DATE' });
      return;
    }
    bookings.push({
      row,
      date,
      payer: at(values, columns.payer).trim(),
      purpose: at(values, columns.purpose).trim(),
      amountCents,
    });
  });
  return { bookings, skipped };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:unit --workspace=frontend -- bookingCsv`
Expected: PASS.

- [ ] **Step 5: Run the verification**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/utils/bookingCsv.ts frontend/src/__tests__/bookingCsv.test.ts
git commit -m "feat: read bank booking exports in the browser" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Selection rules for the proposals

**Files:**

- Create: `frontend/src/utils/paymentSelection.ts`
- Test: `frontend/src/__tests__/paymentSelection.test.ts`

**Interfaces:**

- Consumes: `BookingMatch`, `MatchCandidate` from `shared`.
- Produces:
  - `interface MatchRow { key: number; match: BookingMatch; invoiceId: number | null; selected: boolean }`
  - `initialRows(matches: BookingMatch[]): MatchRow[]`
  - `takenInvoiceIds(rows: MatchRow[], exceptKey: number): Set<number>`
  - `canSelect(rows: MatchRow[], row: MatchRow): boolean`
  - `setSelected(rows: MatchRow[], key: number, selected: boolean): MatchRow[]`
  - `chooseInvoice(rows: MatchRow[], key: number, invoiceId: number | null): MatchRow[]`
  - `chosenCandidate(row: MatchRow): MatchCandidate | null`
  - `selectedInvoiceIds(rows: MatchRow[]): number[]`

- [ ] **Step 1: Write the failing tests**

`frontend/src/__tests__/paymentSelection.test.ts`:

```ts
import type { BookingMatch, MatchCandidate, MatchLevel } from 'shared';
import { describe, expect, it } from 'vitest';
import {
  canSelect,
  chooseInvoice,
  chosenCandidate,
  initialRows,
  selectedInvoiceIds,
  setSelected,
} from '../utils/paymentSelection';

function candidate(invoiceId: number): MatchCandidate {
  return {
    invoiceId,
    invoiceNumber: `${invoiceId} / 2026`,
    recipientName: 'Anna Alt',
    invoiceDate: '2026-03-01',
    amountCents: 5950,
    reasons: ['AMOUNT'],
    differenceCents: 0,
  };
}

function match(row: number, level: MatchLevel, invoiceIds: number[]): BookingMatch {
  return {
    booking: { row, date: '2026-03-10', payer: 'Anna', purpose: '', amountCents: 5950 },
    level,
    candidates: invoiceIds.map(candidate),
  };
}

describe('initialRows', () => {
  it('preselects confident rows with one candidate only', () => {
    const rows = initialRows([
      match(1, 'CONFIDENT', [1]),
      match(2, 'AMOUNT_DIFFERS', [2]),
      match(3, 'AMOUNT_ONLY', [3]),
      match(4, 'CONFIDENT', [4, 5]),
    ]);
    expect(rows.map((r) => r.selected)).toEqual([true, false, false, false]);
    expect(rows.map((r) => r.invoiceId)).toEqual([1, 2, 3, null]);
    expect(selectedInvoiceIds(rows)).toEqual([1]);
  });

  it('preselects an invoice proposed twice only in the first row', () => {
    const rows = initialRows([match(1, 'CONFIDENT', [1]), match(2, 'CONFIDENT', [1])]);
    expect(rows.map((r) => r.selected)).toEqual([true, false]);
    expect(canSelect(rows, rows[1])).toBe(false);
  });
});

describe('selecting', () => {
  it('frees an invoice for other rows once it is unselected', () => {
    let rows = initialRows([match(1, 'CONFIDENT', [1]), match(2, 'AMOUNT_ONLY', [1])]);
    expect(setSelected(rows, 1, true)).toBe(rows);

    rows = setSelected(rows, 0, false);
    expect(canSelect(rows, rows[1])).toBe(true);
    rows = setSelected(rows, 1, true);
    expect(selectedInvoiceIds(rows)).toEqual([1]);
  });

  it('needs a chosen invoice before a row with several candidates can be selected', () => {
    let rows = initialRows([match(1, 'AMOUNT_ONLY', [1, 2])]);
    expect(canSelect(rows, rows[0])).toBe(false);

    rows = chooseInvoice(rows, 0, 2);
    expect(chosenCandidate(rows[0])?.invoiceId).toBe(2);
    rows = setSelected(rows, 0, true);
    expect(selectedInvoiceIds(rows)).toEqual([2]);

    rows = chooseInvoice(rows, 0, null);
    expect(rows[0]).toMatchObject({ invoiceId: null, selected: false });
  });

  it('does not let a row choose an invoice that another row has selected', () => {
    const rows = initialRows([match(1, 'CONFIDENT', [1]), match(2, 'AMOUNT_ONLY', [1, 2])]);
    expect(chooseInvoice(rows, 1, 1)).toBe(rows);
    expect(chooseInvoice(rows, 1, 2)[1].invoiceId).toBe(2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit --workspace=frontend -- paymentSelection`
Expected: FAIL — cannot resolve `../utils/paymentSelection`.

- [ ] **Step 3: Implement**

`frontend/src/utils/paymentSelection.ts`:

```ts
import type { BookingMatch, MatchCandidate } from 'shared';

/** One proposal on the import page: the booking, the chosen invoice, and whether to mark it. */
export interface MatchRow {
  key: number;
  match: BookingMatch;
  /** The chosen candidate; preset when there is only one. */
  invoiceId: number | null;
  selected: boolean;
}

/**
 * Rows for a match result. Only confident proposals with a single candidate start selected,
 * and an invoice proposed for several bookings only in its first row.
 */
export function initialRows(matches: BookingMatch[]): MatchRow[] {
  const taken = new Set<number>();
  return matches.map((match, key) => {
    const only = match.candidates.length === 1 ? match.candidates[0].invoiceId : null;
    const selected = match.level === 'CONFIDENT' && only !== null && !taken.has(only);
    if (selected && only !== null) taken.add(only);
    return { key, match, invoiceId: only, selected };
  });
}

/** Invoices selected in rows other than `exceptKey`. */
export function takenInvoiceIds(rows: MatchRow[], exceptKey: number): Set<number> {
  const taken = new Set<number>();
  for (const row of rows) {
    if (row.selected && row.key !== exceptKey && row.invoiceId !== null) taken.add(row.invoiceId);
  }
  return taken;
}

/** A selected row can always be unselected; otherwise it needs a free, chosen invoice. */
export function canSelect(rows: MatchRow[], row: MatchRow): boolean {
  if (row.selected) return true;
  return row.invoiceId !== null && !takenInvoiceIds(rows, row.key).has(row.invoiceId);
}

export function setSelected(rows: MatchRow[], key: number, selected: boolean): MatchRow[] {
  const row = rows.find((r) => r.key === key);
  if (!row || row.selected === selected || (selected && !canSelect(rows, row))) return rows;
  return rows.map((r) => (r.key === key ? { ...r, selected } : r));
}

/** Choosing no invoice unselects the row; an invoice selected elsewhere cannot be chosen. */
export function chooseInvoice(rows: MatchRow[], key: number, invoiceId: number | null): MatchRow[] {
  if (invoiceId !== null && takenInvoiceIds(rows, key).has(invoiceId)) return rows;
  return rows.map((r) =>
    r.key === key ? { ...r, invoiceId, selected: invoiceId === null ? false : r.selected } : r,
  );
}

export function chosenCandidate(row: MatchRow): MatchCandidate | null {
  return row.match.candidates.find((c) => c.invoiceId === row.invoiceId) ?? null;
}

export function selectedInvoiceIds(rows: MatchRow[]): number[] {
  return rows.flatMap((row) => (row.selected && row.invoiceId !== null ? [row.invoiceId] : []));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:unit --workspace=frontend -- paymentSelection`
Expected: PASS.

- [ ] **Step 5: Run the verification**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/utils/paymentSelection.ts frontend/src/__tests__/paymentSelection.test.ts
git commit -m "feat: add selection rules for payment proposals" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Import page

**Files:**

- Modify: `frontend/src/utils/statusTags.ts` (match level tag, reason labels)
- Create: `frontend/src/views/InvoicePaymentImportView.vue`
- Modify: `frontend/src/router/index.ts`
- Modify: `frontend/src/views/InvoiceView.vue` (header button)
- Test: `frontend/src/__tests__/InvoicePaymentImportView.test.ts` (new),
  `frontend/src/__tests__/statusTags.test.ts`, `frontend/src/__tests__/router.test.ts`,
  `frontend/src/__tests__/InvoiceView.test.ts`

**Interfaces:**

- Consumes: Task 3 shared types and `DEFAULT_BOOKING_IMPORT_SETTINGS`, `BOOKING_COLUMN_KEYS`;
  Task 4 endpoints; Task 5 `decodeBookingFile`, `readBookingTable`, `toBookings`,
  `SKIP_REASON_LABELS`, `SkippedRow`; Task 6 selection functions.
- Produces: route `invoice-payment-import` at `/invoice/payment-import`;
  `matchLevelTag(level: string): StatusTag`; `MATCH_REASON_LABELS: Record<MatchReason, string>`.

- [ ] **Step 1: Write the failing tag and route tests**

Append to `frontend/src/__tests__/statusTags.test.ts` (add `matchLevelTag` to the import):

```ts
describe('matchLevelTag', () => {
  it.each([
    ['CONFIDENT', 'Confident', 'success'],
    ['AMOUNT_DIFFERS', 'Amount differs', 'warn'],
    ['AMOUNT_ONLY', 'Amount only', 'secondary'],
  ])('maps %s', (level, label, severity) => {
    expect(matchLevelTag(level)).toEqual({ label, severity });
  });
});
```

In `frontend/src/__tests__/router.test.ts`, add inside `describe('router', …)`:

```ts
it('opens the booking import, not an invoice called "payment-import"', () => {
  expect(router.resolve('/invoice/payment-import').name).toBe('invoice-payment-import');
});
```

In `frontend/src/__tests__/InvoiceView.test.ts`, add inside `describe('InvoiceView', …)`:

```ts
it('leads to the bank booking import', async () => {
  const wrapper = await mountView();
  await wrapper.find('[data-testid="import-bookings"]').trigger('click');
  expect(push).toHaveBeenCalledWith('/invoice/payment-import');
});
```

- [ ] **Step 2: Write the failing view tests**

`frontend/src/__tests__/InvoicePaymentImportView.test.ts`:

```ts
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import type { Booking, BookingImportSettings, MatchCandidate, MatchResult } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRouter } from 'vue-router';
import { formatCents } from '../utils/format';
import type { MatchRow } from '../utils/paymentSelection';
import InvoicePaymentImportView from '../views/InvoicePaymentImportView.vue';
import { withPrimeVue } from './helpers/primeVue';

const { notify, confirmAction } = vi.hoisted(() => ({
  notify: { success: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  confirmAction: vi.fn(),
}));

vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRouter: vi.fn(),
}));
vi.mock('../composables/useNotify', () => ({ useNotify: () => notify }));
vi.mock('../composables/useConfirmAction', () => ({
  useConfirmAction: () => ({ confirmAction }),
}));

interface ViewVM {
  settings: BookingImportSettings;
  encoding: string;
  rows: MatchRow[];
  choose: (row: MatchRow, invoiceId: number | null) => void;
}

function vm(wrapper: VueWrapper): ViewVM {
  return wrapper.vm as unknown as ViewVM;
}

const STORED: BookingImportSettings = {
  encoding: 'utf-8',
  delimiter: ';',
  columns: { date: 'Datum', payer: 'Name', purpose: 'Zweck', amount: 'Betrag' },
};

// Row 3 is outgoing (dropped), row 4 has an unreadable amount (skipped)
const CSV =
  'Datum;Name;Zweck;Betrag\n' +
  '10.03.2026;Anna Alt;Miete;59,50\n' +
  '11.03.2026;Bernd Bach;"RE 2/2026; danke";40,00\n' +
  '12.03.2026;Stadtwerke;Strom;-10,00\n' +
  '13.03.2026;Clara Cord;Beitrag;zwölf\n';

function candidate(overrides: Partial<MatchCandidate> = {}): MatchCandidate {
  return {
    invoiceId: 1,
    invoiceNumber: '1 / 2026',
    recipientName: 'Anna Alt',
    invoiceDate: '2026-03-01',
    amountCents: 5950,
    reasons: ['AMOUNT', 'NAME'],
    differenceCents: 0,
    ...overrides,
  };
}

function bookingOf(row: number, overrides: Partial<Booking> = {}): Booking {
  return {
    row,
    date: '2026-03-10',
    payer: 'Anna Alt',
    purpose: 'Miete',
    amountCents: 5950,
    ...overrides,
  };
}

const RESULT: MatchResult = {
  matches: [
    { booking: bookingOf(1), level: 'CONFIDENT', candidates: [candidate()] },
    {
      booking: bookingOf(2, {
        date: '2026-03-11',
        payer: 'Bernd Bach',
        purpose: 'RE 2/2026; danke',
        amountCents: 4000,
      }),
      level: 'AMOUNT_DIFFERS',
      candidates: [
        candidate({
          invoiceId: 2,
          invoiceNumber: '2 / 2026',
          recipientName: 'Bernd Bach',
          amountCents: 4100,
          reasons: ['INVOICE_NUMBER'],
          differenceCents: -100,
        }),
      ],
    },
  ],
  unmatched: [],
};

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

function sentBody(method: string, url: string): unknown {
  const call = fetchMock.mock.calls.find(
    ([u, init]) => u === url && (init?.method ?? 'GET') === method,
  );
  return call ? JSON.parse(String(call[1]?.body)) : undefined;
}

async function mountView(): Promise<VueWrapper> {
  const wrapper = mount(InvoicePaymentImportView, {
    attachTo: document.body,
    global: withPrimeVue(),
  });
  await flushPromises();
  return wrapper;
}

async function chooseFile(wrapper: VueWrapper, content: string | Uint8Array<ArrayBuffer>) {
  const file = new File([content], 'bookings.csv');
  const input = wrapper.find('input[type="file"]');
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true });
  await input.trigger('change');
  await vi.waitFor(() => expect(wrapper.find('[data-testid="csv-preview"]').exists()).toBe(true));
  await flushPromises();
}

async function runMatch(wrapper: VueWrapper) {
  await chooseFile(wrapper, CSV);
  await wrapper.find('[data-testid="match-bookings"]').trigger('click');
  await flushPromises();
}

function headerCells(wrapper: VueWrapper): string[] {
  return wrapper.findAll('[data-testid="csv-preview"] th').map((th) => th.text());
}

function matchButton(wrapper: VueWrapper) {
  return wrapper.find('[data-testid="match-bookings"]');
}

function checkbox(wrapper: VueWrapper, key: number) {
  return wrapper.find(`[data-testid="match-select-${key}"] input`);
}

beforeEach(() => {
  replies = {
    'GET /api/settings/booking-import': { status: 200, body: STORED },
    'PUT /api/settings/booking-import': { status: 200, body: STORED },
    'POST /api/invoice-payment/match': { status: 200, body: RESULT },
  };
  fetchMock.mockClear();
  confirmAction.mockReset().mockResolvedValue(true);
  Object.values(notify).forEach((fn) => fn.mockReset());
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(useRouter).mockReturnValue({ push: vi.fn() } as unknown as ReturnType<
    typeof useRouter
  >);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('InvoicePaymentImportView', () => {
  it('previews the header and the first 3 rows with the stored settings', async () => {
    const wrapper = await mountView();
    await chooseFile(wrapper, CSV);

    expect(headerCells(wrapper)).toEqual(['Datum', 'Name', 'Zweck', 'Betrag']);
    const preview = wrapper.find('[data-testid="csv-preview"]');
    expect(preview.findAll('tbody tr')).toHaveLength(3);
    expect(preview.text()).toContain('RE 2/2026; danke');
    expect(preview.text()).not.toContain('Clara Cord');
    expect(preview.findAll('th.mapped')).toHaveLength(4);
    expect(matchButton(wrapper).attributes('disabled')).toBeUndefined();
  });

  it('updates the preview when the delimiter changes', async () => {
    const wrapper = await mountView();
    await chooseFile(wrapper, CSV);

    vm(wrapper).settings.delimiter = ',';
    await flushPromises();

    expect(headerCells(wrapper)).toEqual(['Datum;Name;Zweck;Betrag']);
    expect(matchButton(wrapper).attributes('disabled')).toBeDefined();
  });

  it('updates the preview when the encoding changes', async () => {
    const head = new TextEncoder().encode('Datum;Name;Zweck;Betrag\n10.03.2026;M');
    const tail = new TextEncoder().encode('ller;Miete;59,50\n');
    const wrapper = await mountView();
    await chooseFile(wrapper, new Uint8Array([...head, 0xfc, ...tail]));
    expect(wrapper.find('[data-testid="csv-preview"]').text()).not.toContain('Müller');

    vm(wrapper).settings.encoding = 'windows-1252';
    await flushPromises();
    expect(wrapper.find('[data-testid="csv-preview"]').text()).toContain('Müller');
  });

  it('shows the encoding a byte order mark states', async () => {
    const text = 'Datum;Name;Zweck;Betrag\n10.03.2026;Anna;Miete;59,50\n';
    const bytes = new Uint8Array(2 + text.length * 2);
    bytes.set([0xff, 0xfe]);
    for (let i = 0; i < text.length; i++) bytes[2 + i * 2] = text.charCodeAt(i);
    const wrapper = await mountView();
    await chooseFile(wrapper, bytes);

    expect(vm(wrapper).encoding).toBe('utf-16le');
    expect(headerCells(wrapper)).toEqual(['Datum', 'Name', 'Zweck', 'Betrag']);
  });

  it('leaves a column unmapped when the file lacks the stored name', async () => {
    const wrapper = await mountView();
    await chooseFile(wrapper, 'Datum;Name;Zweck;Umsatz\n10.03.2026;Anna;Miete;59,50\n');
    expect(matchButton(wrapper).attributes('disabled')).toBeDefined();

    vm(wrapper).settings.columns.amount = 'Umsatz';
    await flushPromises();
    expect(matchButton(wrapper).attributes('disabled')).toBeUndefined();
  });

  it('says when the file holds no bookings', async () => {
    const wrapper = await mountView();
    await chooseFile(wrapper, 'Datum;Name;Zweck;Betrag\n');
    expect(wrapper.find('[data-testid="no-bookings"]').text()).toContain(
      'The file contains no bookings',
    );
    expect(matchButton(wrapper).attributes('disabled')).toBeDefined();
  });

  it('falls back to the default settings when they cannot be loaded', async () => {
    replies['GET /api/settings/booking-import'] = { status: 500, body: {} };
    const wrapper = await mountView();
    expect(notify.error).toHaveBeenCalledWith('Import settings could not be loaded');
    expect(vm(wrapper).settings.encoding).toBe('utf-16le');
  });

  it('saves the settings, sends the incoming bookings and lists the proposals', async () => {
    const wrapper = await mountView();
    await runMatch(wrapper);

    expect(sentBody('PUT', '/api/settings/booking-import')).toEqual(STORED);
    expect(sentBody('POST', '/api/invoice-payment/match')).toEqual({
      bookings: [
        { row: 1, date: '2026-03-10', payer: 'Anna Alt', purpose: 'Miete', amountCents: 5950 },
        {
          row: 2,
          date: '2026-03-11',
          payer: 'Bernd Bach',
          purpose: 'RE 2/2026; danke',
          amountCents: 4000,
        },
      ],
    });

    const rows = wrapper.findAll('.match-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].text()).toContain('Confident');
    expect(rows[0].text()).toContain('Amount · Name');
    expect(rows[1].text()).toContain('Amount differs');
    expect(rows[1].text()).toContain(formatCents(-100));
    expect((checkbox(wrapper, 0).element as HTMLInputElement).checked).toBe(true);
    expect((checkbox(wrapper, 1).element as HTMLInputElement).checked).toBe(false);
    expect(wrapper.find('[data-testid="confirm-paid"]').text()).toContain('Mark 1 invoice as paid');

    const skipped = wrapper.find('[data-testid="skipped-rows"]');
    expect(skipped.text()).toContain('Skipped rows (1)');
    expect(skipped.text()).toContain('Unreadable amount');
    expect(skipped.text()).toContain('Clara Cord');
  });

  it('lets an invoice be selected in one row only', async () => {
    replies['POST /api/invoice-payment/match'] = {
      status: 200,
      body: {
        matches: [
          { booking: bookingOf(1), level: 'CONFIDENT', candidates: [candidate()] },
          { booking: bookingOf(2), level: 'CONFIDENT', candidates: [candidate()] },
        ],
        unmatched: [],
      },
    };
    const wrapper = await mountView();
    await runMatch(wrapper);

    expect(checkbox(wrapper, 1).attributes('disabled')).toBeDefined();
    await checkbox(wrapper, 0).setValue(false);
    await flushPromises();
    expect(checkbox(wrapper, 1).attributes('disabled')).toBeUndefined();
  });

  it('asks for a choice when a booking fits several invoices', async () => {
    replies['POST /api/invoice-payment/match'] = {
      status: 200,
      body: {
        matches: [
          {
            booking: bookingOf(1),
            level: 'AMOUNT_ONLY',
            candidates: [candidate(), candidate({ invoiceId: 2, invoiceNumber: '2 / 2026' })],
          },
        ],
        unmatched: [],
      },
    };
    const wrapper = await mountView();
    await runMatch(wrapper);

    expect(wrapper.find('[data-testid="candidate-select"]').exists()).toBe(true);
    expect(checkbox(wrapper, 0).attributes('disabled')).toBeDefined();

    vm(wrapper).choose(vm(wrapper).rows[0], 2);
    await flushPromises();
    expect(checkbox(wrapper, 0).attributes('disabled')).toBeUndefined();
    expect(wrapper.find('[data-testid="invoice-link"]').attributes('href')).toBe('/invoice/2');
  });

  it('marks the selected invoices as paid and removes their rows', async () => {
    replies['POST /api/invoice-payment/confirm'] = { status: 200, body: { marked: 1 } };
    const wrapper = await mountView();
    await runMatch(wrapper);

    await wrapper.find('[data-testid="confirm-paid"]').trigger('click');
    await flushPromises();

    expect(confirmAction).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Mark 1 invoice as paid?' }),
    );
    expect(sentBody('POST', '/api/invoice-payment/confirm')).toEqual({ invoiceIds: [1] });
    expect(notify.success).toHaveBeenCalledWith('1 invoice marked as paid');
    expect(wrapper.findAll('.match-row')).toHaveLength(1);
  });

  it('keeps the rows and explains a refused confirmation', async () => {
    replies['POST /api/invoice-payment/confirm'] = {
      status: 400,
      body: { error: 'CANCELLED', ids: [1] },
    };
    const wrapper = await mountView();
    await runMatch(wrapper);

    await wrapper.find('[data-testid="confirm-paid"]').trigger('click');
    await flushPromises();

    expect(notify.error).toHaveBeenCalledWith(
      'Some invoices have been cancelled. Run the match again.',
    );
    expect(wrapper.findAll('.match-row')).toHaveLength(2);
  });

  it('lists the bookings without a match', async () => {
    replies['POST /api/invoice-payment/match'] = {
      status: 200,
      body: { matches: [], unmatched: [bookingOf(1)] },
    };
    const wrapper = await mountView();
    await runMatch(wrapper);

    const unmatched = wrapper.find('[data-testid="unmatched-bookings"]');
    expect(unmatched.text()).toContain('Bookings without a match (1)');
    expect(unmatched.text()).toContain('Anna Alt');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test:unit --workspace=frontend -- statusTags router InvoiceView InvoicePaymentImportView`
Expected: FAIL — `matchLevelTag` missing, route resolves to `invoice-detail`, view file missing.

- [ ] **Step 4: Tags and labels**

Append to `frontend/src/utils/statusTags.ts` (add `import type { MatchReason } from 'shared';` at
the top):

```ts
const MATCH_LEVEL: Record<string, StatusTag> = {
  CONFIDENT: { label: 'Confident', severity: 'success' },
  AMOUNT_DIFFERS: { label: 'Amount differs', severity: 'warn' },
  AMOUNT_ONLY: { label: 'Amount only', severity: 'secondary' },
};

export const matchLevelTag = (level: string) => lookup(MATCH_LEVEL, level);

export const MATCH_REASON_LABELS: Record<MatchReason, string> = {
  AMOUNT: 'Amount',
  INVOICE_NUMBER: 'Invoice number',
  NAME: 'Name',
};
```

- [ ] **Step 5: Route and list button**

In `frontend/src/router/index.ts`, after the `/invoice/new` route:

```ts
    {
      path: '/invoice/payment-import',
      name: 'invoice-payment-import',
      component: () => import('@/views/InvoicePaymentImportView.vue'),
    },
```

In `frontend/src/views/InvoiceView.vue`, in the header actions before the Settings button:

```vue
<Button
  label="Import bank bookings"
  icon="pi pi-upload"
  severity="secondary"
  outlined
  data-testid="import-bookings"
  @click="router.push('/invoice/payment-import')"
/>
```

- [ ] **Step 6: The view**

`frontend/src/views/InvoicePaymentImportView.vue`:

```vue
<script setup lang="ts">
import Button from 'primevue/button';
import Card from 'primevue/card';
import Checkbox from 'primevue/checkbox';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import Message from 'primevue/message';
import Select from 'primevue/select';
import {
  BOOKING_COLUMN_KEYS,
  DEFAULT_BOOKING_IMPORT_SETTINGS,
  type BookingColumnKey,
  type BookingEncoding,
  type BookingImportSettings,
  type MatchResult,
} from 'shared';
import { computed, onMounted, ref, shallowRef, watch } from 'vue';
import { useRouter } from 'vue-router';
import PageHeader from '../components/ui/PageHeader.vue';
import StatusTag from '../components/ui/StatusTag.vue';
import { useConfirmAction } from '../composables/useConfirmAction';
import { useNotify } from '../composables/useNotify';
import {
  decodeBookingFile,
  readBookingTable,
  SKIP_REASON_LABELS,
  toBookings,
  type SkippedRow,
} from '../utils/bookingCsv';
import { formatCents, formatDate } from '../utils/format';
import {
  canSelect,
  chooseInvoice,
  chosenCandidate,
  initialRows,
  selectedInvoiceIds,
  setSelected,
  takenInvoiceIds,
  type MatchRow,
} from '../utils/paymentSelection';
import { errorMessage, requestJson, type JsonResponse } from '../utils/requestJson';
import { MATCH_REASON_LABELS, matchLevelTag } from '../utils/statusTags';

const router = useRouter();
const notify = useNotify();
const { confirmAction } = useConfirmAction();

const JSON_HEADERS = { 'Content-Type': 'application/json' };

const ENCODING_OPTIONS: { label: string; value: BookingEncoding }[] = [
  { label: 'UTF-16 LE', value: 'utf-16le' },
  { label: 'UTF-8', value: 'utf-8' },
  { label: 'Windows-1252', value: 'windows-1252' },
];
const DELIMITER_OPTIONS = [
  { label: 'Semicolon (;)', value: ';' },
  { label: 'Comma (,)', value: ',' },
  { label: 'Tab', value: '\t' },
];
const COLUMN_LABELS: Record<BookingColumnKey, string> = {
  date: 'Booking date',
  payer: 'Payer',
  purpose: 'Purpose',
  amount: 'Amount',
};
const CONFIRM_ERRORS: Record<string, string> = {
  NOT_FOUND: 'Some invoices no longer exist. Run the match again.',
  CANCELLED: 'Some invoices have been cancelled. Run the match again.',
};

const settings = ref<BookingImportSettings>(structuredClone(DEFAULT_BOOKING_IMPORT_SETTINGS));
const fileBytes = shallowRef<ArrayBuffer | null>(null);
const fileName = ref('');
const result = ref<MatchResult | null>(null);
const rows = ref<MatchRow[]>([]);
const skipped = ref<SkippedRow[]>([]);
const matching = ref(false);
const confirming = ref(false);

onMounted(async () => {
  try {
    const res = await requestJson('/api/settings/booking-import');
    if (res.ok) settings.value = res.body as unknown as BookingImportSettings;
    else notify.error('Import settings could not be loaded');
  } catch {
    notify.error('Import settings could not be loaded');
  }
});

const decoded = computed(() =>
  fileBytes.value ? decodeBookingFile(fileBytes.value, settings.value.encoding) : null,
);
/** A byte order mark in the file wins, so the select shows what was actually used. */
const encoding = computed<BookingEncoding>({
  get: () => decoded.value?.encoding ?? settings.value.encoding,
  set: (value) => {
    settings.value.encoding = value;
  },
});
const table = computed(() =>
  decoded.value ? readBookingTable(decoded.value.text, settings.value.delimiter) : null,
);
const header = computed(() => table.value?.header ?? []);
const previewRows = computed(() => table.value?.rows.slice(0, 3) ?? []);
const noBookings = computed(() => table.value !== null && table.value.rows.length === 0);

function mappedColumn(key: BookingColumnKey): string | null {
  const name = settings.value.columns[key];
  return header.value.includes(name) ? name : null;
}

function setColumn(key: BookingColumnKey, name: string | null) {
  settings.value.columns = { ...settings.value.columns, [key]: name ?? '' };
}

const mappedNames = computed(
  () => new Set(BOOKING_COLUMN_KEYS.map((key) => mappedColumn(key)).filter((n) => n !== null)),
);
const canMatch = computed(
  () =>
    table.value !== null &&
    !noBookings.value &&
    BOOKING_COLUMN_KEYS.every((key) => mappedColumn(key) !== null) &&
    !matching.value,
);

// Proposals belong to one file read with one set of settings
watch(
  [settings, fileBytes],
  () => {
    result.value = null;
    rows.value = [];
    skipped.value = [];
  },
  { deep: true },
);

async function onFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  fileName.value = file?.name ?? '';
  fileBytes.value = file ? await file.arrayBuffer() : null;
}

async function match() {
  const current = table.value;
  if (!current) return;
  const used: BookingImportSettings = { ...settings.value, encoding: encoding.value };
  matching.value = true;
  try {
    const saved = await requestJson('/api/settings/booking-import', {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify(used),
    });
    if (!saved.ok) notify.error(`Import settings could not be saved: ${errorMessage(saved)}`);

    const converted = toBookings(current.rows, current.header, used.columns);
    const res = await requestJson('/api/invoice-payment/match', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ bookings: converted.bookings }),
    });
    if (!res.ok) {
      notify.error(errorMessage(res));
      return;
    }
    const body = res.body as unknown as MatchResult;
    result.value = body;
    rows.value = initialRows(body.matches);
    skipped.value = converted.skipped;
  } catch {
    notify.error('Network error');
  } finally {
    matching.value = false;
  }
}

const tableRows = computed(() =>
  rows.value.map((row) => ({ ...row, chosen: chosenCandidate(row) })),
);
const selectedIds = computed(() => selectedInvoiceIds(rows.value));

function invoicesText(count: number): string {
  return `${count} ${count === 1 ? 'invoice' : 'invoices'}`;
}

function toggle(row: MatchRow, selected: boolean) {
  rows.value = setSelected(rows.value, row.key, selected);
}

function choose(row: MatchRow, invoiceId: number | null) {
  rows.value = chooseInvoice(rows.value, row.key, invoiceId);
}

function candidateOptions(row: MatchRow) {
  const taken = takenInvoiceIds(rows.value, row.key);
  return row.match.candidates.map((c) => ({
    label: `${c.invoiceNumber} · ${c.recipientName} · ${formatCents(c.amountCents)}`,
    value: c.invoiceId,
    disabled: taken.has(c.invoiceId),
  }));
}

function reasonText(row: MatchRow): string {
  const chosen = chosenCandidate(row);
  return chosen ? chosen.reasons.map((reason) => MATCH_REASON_LABELS[reason]).join(' · ') : '';
}

function confirmError(res: JsonResponse): string {
  const code = res.body.error;
  return typeof code === 'string' && CONFIRM_ERRORS[code]
    ? CONFIRM_ERRORS[code]
    : errorMessage(res);
}

async function confirmPaid() {
  const ids = selectedIds.value;
  const confirmed = await confirmAction({
    message: `Mark ${invoicesText(ids.length)} as paid?`,
    header: 'Mark as paid',
    acceptLabel: 'Mark as paid',
  });
  if (!confirmed) return;
  confirming.value = true;
  try {
    const res = await requestJson('/api/invoice-payment/confirm', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ invoiceIds: ids }),
    });
    if (!res.ok) {
      notify.error(confirmError(res));
      return;
    }
    notify.success(`${invoicesText(ids.length)} marked as paid`);
    rows.value = rows.value.filter((row) => !row.selected);
  } catch {
    notify.error('Network error');
  } finally {
    confirming.value = false;
  }
}
</script>

<template>
  <div class="page">
    <PageHeader title="Import bank bookings">
      <template #actions>
        <Button
          label="Back"
          icon="pi pi-arrow-left"
          text
          severity="secondary"
          @click="router.push('/invoice')"
        />
      </template>
    </PageHeader>

    <div class="stack gap-lg">
      <Card>
        <template #content>
          <div class="stack">
            <div class="field">
              <label for="booking-file">Bank export (CSV)</label>
              <input
                id="booking-file"
                type="file"
                accept=".csv,.txt,text/csv"
                data-testid="booking-file"
                @change="onFileChange"
              />
            </div>
            <div class="settings-grid">
              <div class="field">
                <label for="booking-encoding">Encoding</label>
                <Select
                  v-model="encoding"
                  input-id="booking-encoding"
                  :options="ENCODING_OPTIONS"
                  option-label="label"
                  option-value="value"
                  aria-label="Encoding"
                />
              </div>
              <div class="field">
                <label for="booking-delimiter">Delimiter</label>
                <Select
                  v-model="settings.delimiter"
                  input-id="booking-delimiter"
                  :options="DELIMITER_OPTIONS"
                  option-label="label"
                  option-value="value"
                  aria-label="Delimiter"
                />
              </div>
              <div v-for="key in BOOKING_COLUMN_KEYS" :key="key" class="field">
                <label :for="`column-${key}`">{{ COLUMN_LABELS[key] }}</label>
                <Select
                  :model-value="mappedColumn(key)"
                  :input-id="`column-${key}`"
                  :options="header"
                  placeholder="Choose column"
                  :disabled="header.length === 0"
                  :aria-label="`${COLUMN_LABELS[key]} column`"
                  @update:model-value="(name: string | null) => setColumn(key, name)"
                />
              </div>
            </div>
          </div>
        </template>
      </Card>

      <section v-if="table" class="stack gap-sm">
        <h3 class="section-title">Preview — {{ fileName }}</h3>
        <div class="preview-scroll">
          <table class="plain-table" data-testid="csv-preview">
            <thead>
              <tr>
                <th v-for="(name, c) in header" :key="c" :class="{ mapped: mappedNames.has(name) }">
                  {{ name }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, r) in previewRows" :key="r">
                <td v-for="(name, c) in header" :key="c" :class="{ mapped: mappedNames.has(name) }">
                  {{ row[c] ?? '' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <Message v-if="noBookings" severity="warn" data-testid="no-bookings">
          The file contains no bookings
        </Message>
        <div class="row">
          <Button
            label="Match bookings"
            icon="pi pi-search"
            :disabled="!canMatch"
            :loading="matching"
            data-testid="match-bookings"
            @click="match"
          />
        </div>
      </section>

      <section v-if="result" class="stack gap-sm" data-testid="match-result">
        <div class="row row--between">
          <h3 class="section-title">Proposals ({{ rows.length }})</h3>
          <Button
            :label="`Mark ${invoicesText(selectedIds.length)} as paid`"
            icon="pi pi-check"
            :disabled="selectedIds.length === 0"
            :loading="confirming"
            data-testid="confirm-paid"
            @click="confirmPaid"
          />
        </div>

        <DataTable :value="tableRows" data-key="key" size="small" :row-class="() => 'match-row'">
          <template #empty>No booking matches an open invoice.</template>
          <Column header-style="width: 3rem">
            <template #body="{ data }">
              <span :data-testid="`match-select-${data.key}`">
                <Checkbox
                  :model-value="data.selected"
                  binary
                  :disabled="!canSelect(rows, data)"
                  :aria-label="`Select booking row ${data.match.booking.row}`"
                  @update:model-value="(value: boolean) => toggle(data, value)"
                />
              </span>
            </template>
          </Column>
          <Column header="Booking date">
            <template #body="{ data }">{{ formatDate(data.match.booking.date) }}</template>
          </Column>
          <Column header="Payer">
            <template #body="{ data }">{{ data.match.booking.payer }}</template>
          </Column>
          <Column header="Purpose">
            <template #body="{ data }">
              <span class="purpose" :title="data.match.booking.purpose">
                {{ data.match.booking.purpose }}
              </span>
            </template>
          </Column>
          <Column header="Amount" class="col-amount">
            <template #body="{ data }">{{ formatCents(data.match.booking.amountCents) }}</template>
          </Column>
          <Column header="Invoice">
            <template #body="{ data }">
              <div class="stack gap-xs">
                <Select
                  v-if="data.match.candidates.length > 1"
                  :model-value="data.invoiceId"
                  :options="candidateOptions(data)"
                  option-label="label"
                  option-value="value"
                  option-disabled="disabled"
                  placeholder="Choose invoice"
                  show-clear
                  size="small"
                  aria-label="Choose invoice"
                  data-testid="candidate-select"
                  @update:model-value="(id: number | null) => choose(data, id ?? null)"
                />
                <span v-if="data.chosen">
                  <a
                    :href="`/invoice/${data.chosen.invoiceId}`"
                    target="_blank"
                    rel="noopener"
                    data-testid="invoice-link"
                    >{{ data.chosen.invoiceNumber }}</a
                  >
                  {{ data.chosen.recipientName }}
                </span>
              </div>
            </template>
          </Column>
          <Column header="Invoice amount" class="col-amount">
            <template #body="{ data }">
              {{ data.chosen ? formatCents(data.chosen.amountCents) : '—' }}
            </template>
          </Column>
          <Column header="Match">
            <template #body="{ data }">
              <div class="stack gap-xs">
                <span class="row gap-sm">
                  <StatusTag :tag="matchLevelTag(data.match.level)" />
                  <small v-if="data.match.level === 'AMOUNT_DIFFERS' && data.chosen">
                    {{ formatCents(data.chosen.differenceCents) }}
                  </small>
                </span>
                <small class="muted">{{ reasonText(data) }}</small>
              </div>
            </template>
          </Column>
        </DataTable>

        <details v-if="result.unmatched.length > 0" data-testid="unmatched-bookings">
          <summary>Bookings without a match ({{ result.unmatched.length }})</summary>
          <table class="plain-table">
            <thead>
              <tr>
                <th>Row</th>
                <th>Booking date</th>
                <th>Payer</th>
                <th>Purpose</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="booking in result.unmatched" :key="booking.row">
                <td>{{ booking.row }}</td>
                <td>{{ formatDate(booking.date) }}</td>
                <td>{{ booking.payer }}</td>
                <td>{{ booking.purpose }}</td>
                <td>{{ formatCents(booking.amountCents) }}</td>
              </tr>
            </tbody>
          </table>
        </details>

        <details v-if="skipped.length > 0" data-testid="skipped-rows">
          <summary>Skipped rows ({{ skipped.length }})</summary>
          <table class="plain-table">
            <thead>
              <tr>
                <th>Row</th>
                <th>Reason</th>
                <th>Values</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in skipped" :key="row.row">
                <td>{{ row.row }}</td>
                <td>{{ SKIP_REASON_LABELS[row.reason] }}</td>
                <td>{{ row.values.join(' ; ') }}</td>
              </tr>
            </tbody>
          </table>
        </details>
      </section>
    </div>
  </div>
</template>

<style scoped>
.settings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
  gap: 1rem;
}

.preview-scroll {
  overflow-x: auto;
}

.plain-table {
  border-collapse: collapse;
  font-size: 0.875rem;
}

.plain-table th,
.plain-table td {
  border: 1px solid var(--p-content-border-color);
  padding: 0.25rem 0.5rem;
  text-align: left;
  white-space: nowrap;
}

.plain-table .mapped {
  background: var(--p-highlight-background);
}

.purpose {
  display: inline-block;
  max-width: 18rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}

details summary {
  cursor: pointer;
  font-weight: 500;
}

:deep(.col-amount) {
  text-align: right;
  white-space: nowrap;
}
</style>
```

Notes for the implementer:

- `wrapper.vm` exposes `<script setup>` bindings in tests (`settings`, `encoding`, `rows`,
  `choose`); keep those names.
- If `vue-tsc` rejects a template arrow parameter type (e.g. `(value: boolean) => …`), keep the
  annotation and adjust only the type to what PrimeVue declares for that emit.
- The `watch` resets proposals on any settings or file change; `match()` never mutates
  `settings`, so its own result survives.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm run test:unit --workspace=frontend -- statusTags router InvoiceView InvoicePaymentImportView`
Expected: PASS.

- [ ] **Step 8: Run the verification**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add frontend/src
git commit -m "feat: import bank bookings and confirm invoice payments" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: End-to-end test and docs

**Files:**

- Create: `e2e/tests/invoice-payments.spec.ts`
- Modify: `AGENTS.md` (feature list sentence)

**Interfaces:**

- Consumes: everything above; `BACKEND_URL`, `uploadInvoiceTemplate` from `e2e/tests/helpers.ts`.

- [ ] **Step 1: Write the spec**

`e2e/tests/invoice-payments.spec.ts`:

```ts
import fs from 'fs';
import os from 'os';
import path from 'path';
import { BACKEND_URL, uploadInvoiceTemplate } from './helpers';

/** A synthetic bank export as the bank writes it: UTF-16 LE with BOM, CRLF, semicolons. */
function writeBookingFile(lines: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-bookings-'));
  const file = path.join(dir, 'bookings.csv');
  const text = lines.join('\r\n') + '\r\n';
  fs.writeFileSync(file, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]));
  return file;
}

async function acceptConfirm(label: string) {
  const accept = await $('.p-confirmdialog').$(`button=${label}`);
  await accept.waitForClickable({ timeout: 5000 });
  await accept.click();
}

describe('Invoice payments', () => {
  let invoiceId = 0;

  before(async function () {
    this.timeout(60000);
    await uploadInvoiceTemplate();
    const res = await fetch(`${BACKEND_URL}/api/invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputs: {
          salutation: '',
          name: 'E2E Zahler GmbH',
          street: 'Zahlweg 1',
          city: 'Zahlstadt',
          invoiceDate: '2025-06-01',
          title: 'E2E Raummiete',
          lineItems: [{ text: 'Raummiete Juni', priceInCents: 5000 }],
          vat: 19,
          directDebit: false,
          email: '',
          emailSalutation: '',
        },
        recipientData: { name: 'E2E Zahler GmbH', street: 'Zahlweg 1', city: 'Zahlstadt' },
      }),
    });
    expect([200, 201, 202]).toContain(res.status);
    invoiceId = (await res.json()).invoiceId;
    expect(invoiceId).toBeGreaterThan(0);
  });

  it('marks the invoice paid from a bank export', async function () {
    this.timeout(60000);
    await browser.url('/invoice/payment-import');
    await (await $('h2=Import bank bookings')).waitForDisplayed({ timeout: 10000 });

    const file = writeBookingFile([
      'Buchungstag;Konto;Empfänger;Verwendungszweck;Betrag',
      '01.07.2025;Giro;E2E Zahler GmbH;"Miete Juni; danke";59,50',
      '02.07.2025;Giro;Stadtwerke;Strom;-120,00',
    ]);
    await $('[data-testid="booking-file"]').setValue(file);
    await expect($('[data-testid="csv-preview"]')).toHaveText(
      expect.stringContaining('E2E Zahler GmbH'),
    );

    await $('[data-testid="match-bookings"]').click();
    const row = await $('.match-row');
    await row.waitForDisplayed({ timeout: 10000 });
    await expect(row).toHaveText(expect.stringContaining('Confident'));

    await $('[data-testid="confirm-paid"]').click();
    await acceptConfirm('Mark as paid');
    await $('.match-row').waitForExist({ reverse: true, timeout: 10000 });

    await browser.url(`/invoice/${invoiceId}`);
    await expect($('[data-testid="payment-status"]')).toHaveText('Paid');
  });

  it('marks the invoice unpaid again on its page', async function () {
    this.timeout(30000);
    await browser.url(`/invoice/${invoiceId}`);
    await $('[data-testid="mark-unpaid"]').click();
    await acceptConfirm('Mark as unpaid');
    await expect($('[data-testid="payment-status"]')).toHaveText('Open');
  });
});
```

- [ ] **Step 2: Run the e2e suite against scratch servers only**

Never against ports 3000/5173 and never via `npm test` / `e2e/run-tests.sh`. Start a backend in
its own Docker compose project on a scratch port (the user's notes: `Dockerfile.dev`, port
`127.0.0.1:3996:3000`, `E2E_RESET_ENABLED=true`, a mktemp data dir), build the frontend and serve
it with `vite preview --port 5179` with `VITE_API_TARGET=http://localhost:3996`, record the PGID
of every process you start, then:

```bash
cd e2e && E2E_BACKEND_URL=http://localhost:3996 E2E_FRONTEND_URL=http://localhost:5179 \
  npx wdio run wdio.conf.ts
```

Expected: all specs pass, including `invoice-payments.spec.ts`. Stop only what you started
(`docker compose -p <scratch project> down`, `kill -- -<recorded pgid>`).

- [ ] **Step 3: Mention the feature in AGENTS.md**

In `AGENTS.md`, change

```
The app covers donation receipts (Zuwendungsbestätigungen), invoices with revisions and drafts,
and instructor rent.
```

to

```
The app covers donation receipts (Zuwendungsbestätigungen), invoices with revisions, drafts and
a paid flag (set by hand or by matching an uploaded bank export), and instructor rent.
```

- [ ] **Step 4: Run the verification**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add e2e/tests/invoice-payments.spec.ts AGENTS.md
git commit -m "test: cover the bank booking import end to end" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
