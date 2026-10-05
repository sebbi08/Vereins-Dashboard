# Invoice Drafts

**Date**: 2026-10-05
**Status**: Approved

## Overview

Allow invoices to be prepared as drafts. A draft holds all invoice details but has no invoice number, no revision, no PDF, and cannot be emailed. A draft can be activated: activation assigns the next invoice number, sets the invoice date to the moment of activation, and turns the draft into a normal invoice (status `AKTIV`, revision 1, PDF generation started).

## Decisions

| Topic | Decision |
|-------|----------|
| Storage | Separate `InvoiceDraft` table. `Invoice` is unchanged. |
| Invoice number | Assigned on activation only. Drafts never consume a number. |
| Invoice date | Set server-side to `new Date()` on activation. Any date sent with a draft is ignored. |
| Recipient | Every draft save creates/updates the linked `InvoiceRecipient` in place (same convention as invoices). |
| Validation | Draft save requires only `name`. Full `validateRequiredFields` runs on activation. |
| Draft operations | Edit, activate, delete (hard delete). No cancel (`STORNIERT`). |
| List placement | Separate "Drafts" section above the filter bar and invoice table on the invoice list page (filters do not apply to drafts). |

Because a draft is not an `Invoice`, the existing list, detail, email, PDF and batch download code paths cannot reach it. "No PDF, cannot be sent" holds by construction rather than by status checks.

## Backend

### Data Model

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
  positions       String   // JSON, same format as InvoiceRevision.positions
  vat             Int
  directDebit     Boolean
  email           String
  emailSalutation String
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

`InvoiceRecipient` gets the back-relation `invoiceDrafts InvoiceDraft[]`. One Prisma migration.

### Endpoints

New router `backend/src/routes/invoiceDraft.ts`, mounted at `/api/invoice-draft`.

| Method | Path | Body | Behavior |
|--------|------|------|----------|
| `GET` | `/` | — | List drafts, newest `updatedAt` first: `InvoiceDraftListItem[]` |
| `GET` | `/:id` | — | One draft: `InvoiceDraftDto` |
| `POST` | `/` | `{ recipientId?, recipientData?, inputs }` | Create draft; create/update recipient in place. `201 { draftId }` |
| `PUT` | `/:id` | `{ recipientId?, recipientData?, inputs }` | Update draft; create/update recipient in place. `200 { draftId }` |
| `DELETE` | `/:id` | — | Hard delete draft (recipient kept). `204` |
| `POST` | `/:id/activate` | — | Validate, convert to invoice, delete draft. Same response shape as `POST /api/invoice` (`201`). |

Request bodies match `POST /api/invoice` so the frontend form can reuse its body-building logic. `inputs.invoiceDate` is ignored by all draft endpoints.

### Activation

1. Load draft → 404 if missing.
2. Convert draft to `InvoiceInputs` and run `validateRequiredFields` → 400 with its message if invalid. Draft is kept.
3. Find active `RECHNUNG` template → 400 `No active invoice template found` if missing. Draft is kept.
4. In one transaction: `generateInvoiceNumber`, create `Invoice` + revision 1 with `invoiceDate = new Date()` and the draft's content and `recipientId`, delete the draft.
5. After commit, start `attemptPdfGeneration` in the background (not awaited), as in `POST /api/invoice`.

Activation does not touch the recipient record — it was already updated on the last draft save.

### Refactor: Shared Invoice Creation

Extract from `POST /api/invoice` into `backend/src/services/invoiceCreation.ts`:

- `validateRequiredFields(inputs)` (moved from `routes/invoice.ts`)
- a function that, inside a given transaction client, generates the number and creates the `Invoice` + revision 1 from `recipientId`, `inputs`, `invoiceDate`, `templateId`

`POST /api/invoice` and `POST /api/invoice-draft/:id/activate` both use it, so activation cannot drift from normal creation. The recipient create/update-in-place logic is also extracted into a helper used by `POST /api/invoice` and the draft `POST`/`PUT`.

### Shared Types (`shared/src/index.ts`)

```ts
export type InvoiceContent = Omit<InvoiceInputs, 'invoiceDate'>;

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

Naming follows the existing `InvoiceListItem` (`recipientName`, `amountCents`).

### Errors

| Case | Response |
|------|----------|
| Draft save without `name` | `400 { error: 'Name is required' }` |
| Unknown `recipientId` / no recipient specified | `400`, same as `POST /api/invoice` |
| Draft not found (GET/PUT/DELETE/activate, incl. second activate) | `404 { error: 'Draft not found' }` |
| Activation with incomplete data | `400 { error: <validateRequiredFields message> }`, draft kept, no number consumed |
| No active invoice template on activation | `400 { error: 'No active invoice template found' }`, draft kept |
| PDF generation fails after activation | Invoice exists with `pdfStatus=FAILED`; retry via existing detail page |

## Frontend

### Routes

Add `/invoice/draft/:draftId` (name `invoice-draft`) → `InvoiceFormView`.

### `InvoiceFormView.vue`

- **New invoice mode** (`/invoice/new`, incl. `?copyFrom=`): add a **"Save as draft"** button next to the submit button. It checks only `name` client-side, `POST`s to `/api/invoice-draft`, then navigates to `/invoice`.
- **Draft mode** (`/invoice/draft/:draftId`): loads the draft via `GET /api/invoice-draft/:id`. Buttons:
  - **Save draft** — `PUT /api/invoice-draft/:id`
  - **Activate** — confirm dialog ("Assigns the next invoice number and today's date (DD.MM.YYYY). Continue?"), then `PUT` the current form state, then `POST /activate`, then navigate to `/invoice/:invoiceId`. Errors appear in the existing error banner.
  - **Delete** — confirm, `DELETE`, navigate to `/invoice`
- In draft mode the invoice date field is hidden and replaced by the hint "Invoice date is set on activation".
- Recipient search / new recipient / field locking behave as in new invoice mode.
- Submitting the form (e.g. pressing Enter) in draft mode saves the draft; it never creates an invoice.
- If the draft cannot be loaded (deleted / already activated), show "Draft not found" and hide Save / Activate / Delete.

### `InvoiceView.vue`

- A **"Drafts"** section above the filter bar and invoice table, rendered only when at least one draft exists. Loaded from `GET /api/invoice-draft`.
- Columns: recipient, title, gross amount, last edited, DRAFT badge. Clicking a row opens `/invoice/draft/:id`.
- Drafts are not part of checkbox selection or batch download, and are not affected by the date / cancelled filters.

### Unchanged

`InvoiceDetailView`, email send / test-send, PDF retry, batch download, invoice numbering service.

## Testing

TDD: tests are written before implementation.

### Integration (`backend/src/__tests__/integration/invoiceDraft.test.ts`, real SQLite)

- Create with `recipientData` creates a new recipient; create/update with `recipientId` updates the recipient in place
- Saving an incomplete draft (only `name`) succeeds
- Creating a draft creates no `Invoice` / `InvoiceRevision` and does not advance the next invoice number
- Activate creates an invoice with the next sequential number, `invoiceDate` ≈ now (ignoring any date sent with the draft), revision 1 with the draft content, and deletes the draft
- Activating an incomplete draft returns 400, creates no invoice, keeps the draft
- Activating twice returns 404 the second time
- Delete removes the draft and keeps the recipient
- Existing `POST /api/invoice` integration tests keep passing after the refactor

### Unit (frontend, `frontend/src/__tests__/`)

- Form in draft mode hides the date field and shows Save draft / Activate / Delete
- "Save as draft" on `/invoice/new` calls `POST /api/invoice-draft`
- Activate calls `PUT` before `POST /activate` and navigates to the new invoice
- `InvoiceView` renders the Drafts section above the filter bar and invoice table only when drafts exist

### Verification

`npm run lint && npm run test:unit && npm run test:integration`
