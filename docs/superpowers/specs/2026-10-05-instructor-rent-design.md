# Instructor Rent Calculator

**Date**: 2026-10-05
**Status**: Approved

## Overview

The club rents rooms to instructors and charges a net hourly rate. This feature stores instructors with a recurring weekly schedule (Mo–So time blocks with breaks), calculates the net rent for a configurable number of months, and can open the invoice form prefilled with that amount.

The calculation per instructor is:

```
netMinutesPerWeek = Σ over blocks (block length − Σ its breaks)
totalCents        = round(netMinutesPerWeek / 60 × hourlyRateCents × weeksPerMonth × months)
```

Only net amounts are calculated. VAT is handled by the invoice form as usual.

## Decisions

| Topic           | Decision                                                                                                                                      |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Purpose         | Club rents rooms to instructors; result is what the instructor owes                                                                           |
| Amounts         | Net only, integer cents, rounded once at the final result                                                                                     |
| Weeks per month | Global setting, default `3.25`, must be > 0 with at most 2 decimals                                                                           |
| Months          | Stored per instructor, whole number ≥ 1                                                                                                       |
| Schedule        | Abstract week Mo–So; no calendar dates                                                                                                        |
| Storage         | One `Instructor` table; time blocks as a JSON string (same pattern as `InvoiceRevision.positions`)                                            |
| Recipient       | Required, unique link to `InvoiceRecipient`; name/address come from the recipient. Saving updates the recipient in place (invoice convention) |
| Overlaps        | Blocks on the same weekday must not overlap; touching (10:00–10:00) is allowed                                                                |
| Midnight        | Blocks cannot cross midnight                                                                                                                  |
| Invoice         | "Create invoice" opens `/invoice/new?fromInstructor=:id`, prefilled; user reviews and saves. No automatic invoice creation                    |
| Invoice content | Title `Raummiete`, one line item for the total                                                                                                |
| Delete          | Hard delete; recipient is kept                                                                                                                |

## Shared Code (`shared/src/instructorRent.ts`)

Single source of truth for types, validation and calculation, used by backend and frontend.

```ts
export type Weekday = 'MO' | 'DI' | 'MI' | 'DO' | 'FR' | 'SA' | 'SO';
export const WEEKDAYS: Weekday[]; // in order MO..SO

export interface TimeRange {
  start: string; // "HH:MM", 00:00–23:59
  end: string; // "HH:MM"
}

export interface TimeBlock extends TimeRange {
  weekday: Weekday;
  breaks: TimeRange[];
}

export interface InstructorRentInputs {
  hourlyRateCents: number;
  months: number;
  timeBlocks: TimeBlock[];
}

export interface InstructorRentResult {
  netMinutesPerWeek: number;
  monthlyCents: number; // round(netMinutesPerWeek / 60 × rate × weeksPerMonth)
  totalCents: number; // round(netMinutesPerWeek / 60 × rate × weeksPerMonth × months)
}

export const DEFAULT_WEEKS_PER_MONTH = 3.25;

export function blockNetMinutes(block: TimeBlock): number;
export function calculateInstructorRent(
  inputs: InstructorRentInputs,
  weeksPerMonth: number,
): InstructorRentResult;

export interface ValidationIssue {
  path: string; // e.g. "timeBlocks.2.breaks.0", "hourlyRateCents"
  message: string;
}
export function validateInstructorRent(inputs: InstructorRentInputs): ValidationIssue[];
export function validateWeeksPerMonth(value: number): string | null;
```

`totalCents` is computed from the unrounded value, not as `monthlyCents × months`, so it is exact.

`shared/src/index.ts` re-exports everything from `instructorRent.ts` and adds the DTOs below.

### Validation Rules

| Rule                                                                                              | Message                                        |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------- |
| `start` / `end` match `^([01]\d                                                                   | 2[0-3]):[0-5]\d$`                              | `Invalid time format (HH:MM)` |
| Block `start < end`                                                                               | `Start must be before end`                     |
| Break `start < end`                                                                               | `Break start must be before break end`         |
| Break inside its block (`block.start ≤ break.start`, `break.end ≤ block.end`)                     | `Break must be within the time block`          |
| Breaks of one block do not overlap                                                                | `Breaks must not overlap`                      |
| Blocks on the same weekday do not overlap                                                         | `Time blocks on the same day must not overlap` |
| `weekday` is one of `WEEKDAYS`                                                                    | `Invalid weekday`                              |
| `hourlyRateCents` integer > 0                                                                     | `Hourly rate must be greater than 0`           |
| `months` integer ≥ 1                                                                              | `Months must be a whole number of at least 1`  |
| `weeksPerMonth` finite > 0                                                                        | `Weeks per month must be greater than 0`       |
| `weeksPerMonth` has at most 2 decimals (`Math.abs(value * 100 - Math.round(value * 100)) < 1e-9`) | `Weeks per month may have at most 2 decimals`  |

An empty `timeBlocks` array is valid (total is 0).

### Runtime Import Constraint

`shared` currently contains only types, and the production Docker image does not ship `shared/dist`. A runtime `import … from 'shared'` in the backend would compile but fail in production. Therefore:

- **Backend** imports runtime values via a relative path, e.g. `import { calculateInstructorRent } from '../../../shared/src/instructorRent.js'`. The backend `tsc` (`rootDir: ".."`) compiles it into `backend/dist/shared/src/`, which the Docker image already copies. Type-only imports may keep using `'shared'`.
- **Frontend** imports from `'shared'` as today. Vite bundles it.
- The implementation must verify that `npm run build` succeeds and that `node backend/dist/backend/src/index.js` starts and serves `GET /api/instructor/settings`.

## Backend

### Data Model

```prisma
model Instructor {
  id              Int              @id @default(autoincrement())
  recipientId     Int              @unique
  recipient       InvoiceRecipient @relation(fields: [recipientId], references: [id])
  hourlyRateCents Int
  months          Int
  timeBlocks      String           // JSON: TimeBlock[]
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt
}
```

`InvoiceRecipient` gets the back-relation `instructor Instructor?`. One Prisma migration.

Weeks per month is stored as `SystemSetting` with key `instructorWeeksPerMonth` (string value, parsed as number). Missing or unparsable → `DEFAULT_WEEKS_PER_MONTH`.

### Shared DTOs (`shared/src/index.ts`)

```ts
export interface InstructorDto {
  id: number;
  recipient: InvoiceRecipientDto;
  hourlyRateCents: number;
  months: number;
  timeBlocks: TimeBlock[];
  calculation: InstructorRentResult; // uses current weeksPerMonth
  createdAt: string;
  updatedAt: string;
}

export interface InstructorListItemDto {
  id: number;
  name: string;
  hourlyRateCents: number;
  months: number;
  calculation: InstructorRentResult;
}

export interface InstructorSettingsDto {
  weeksPerMonth: number;
}

export interface InstructorInvoicePrefillDto {
  recipient: InvoiceRecipientDto;
  title: string;
  lineItems: InvoiceLineItem[];
}
```

### Endpoints

New router `backend/src/routes/instructor.ts`, mounted at `/api/instructor`. `/settings` routes are registered before `/:id`.

| Method   | Path                   | Body                                                                    | Behavior                                              |
| -------- | ---------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------- |
| `GET`    | `/settings`            | —                                                                       | `InstructorSettingsDto`                               |
| `PUT`    | `/settings`            | `{ weeksPerMonth }`                                                     | Validate, upsert setting. `200 InstructorSettingsDto` |
| `GET`    | `/`                    | —                                                                       | `InstructorListItemDto[]`, sorted by recipient name   |
| `GET`    | `/:id`                 | —                                                                       | `InstructorDto`                                       |
| `POST`   | `/`                    | `{ recipientId?, recipientData?, hourlyRateCents, months, timeBlocks }` | Create. `201 { id }`                                  |
| `PUT`    | `/:id`                 | same as `POST`                                                          | Update. `200 { id }`                                  |
| `DELETE` | `/:id`                 | —                                                                       | Hard delete, recipient kept. `204`                    |
| `GET`    | `/:id/invoice-prefill` | —                                                                       | `InstructorInvoicePrefillDto`                         |

`recipientData` has the shape `{ name, street, city, email?, salutation? }`, same as the invoice create body.

### Recipient Handling

Same convention as invoices:

- `recipientData` without `recipientId` → create a new `InvoiceRecipient`.
- `recipientId` with `recipientData` → update that recipient in place.
- `recipientId` alone → link only.
- Neither → `400 { error: 'Recipient is required' }`.

Recipient write and instructor write happen in one transaction.

### Invoice Prefill

- `title`: `Raummiete`
- One line item:
  - `text`: `Raummiete {months} Monate ({hours}/Woche × {weeksPerMonth} Wochen × {months} Monate × {rate} €)`
  - `{hours}` is printed exactly, so the text reproduces the billed amount:
    - if `netMinutesPerWeek % 3 === 0` (exact with ≤ 2 decimals): German decimal with trailing zeros trimmed, followed by ` h` (`7,5 h`, `8 h`, `0,25 h`)
    - otherwise: `{H} h {M} min` (e.g. `7 h 50 min`; when H is 0: `0 h 50 min`)
  - numbers formatted German-style: weeks with up to 2 decimals and no trailing zeros (`3,25`; at most 2 decimals are allowed), rate with exactly 2 decimals (`12,00`)
  - `months` singular form when 1: `1 Monat`
  - `priceInCents`: `calculation.totalCents`
- `recipient`: the linked recipient

The prefill uses the current `weeksPerMonth` setting.

### Errors

| Case                                           | Response                                                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Validation fails                               | `400 { error: <first issue message> }`, nothing written                                                                  |
| Invalid `weeksPerMonth`                        | `400 { error: <validateWeeksPerMonth message> }`; non-number → `400 { error: 'Weeks per month must be greater than 0' }` |
| No recipient specified                         | `400 { error: 'Recipient is required' }`                                                                                 |
| Unknown `recipientId`                          | `400 { error: 'Recipient not found' }`                                                                                   |
| Recipient already linked to another instructor | `409 { error: 'Recipient already has an instructor' }`                                                                   |
| Unknown / non-numeric instructor id            | `404 { error: 'Instructor not found' }`                                                                                  |

### E2E Reset

`POST /api/e2e/reset` deletes instructors before recipients (foreign key).

## Frontend

### Routes

| Path              | Name                | Component            |
| ----------------- | ------------------- | -------------------- |
| `/instructor`     | `instructor`        | `InstructorView`     |
| `/instructor/new` | `instructor-new`    | `InstructorFormView` |
| `/instructor/:id` | `instructor-detail` | `InstructorFormView` |

`AppSidebar` gets a nav item `Instructor Rent` → `/instructor`. `HomeView` gets a matching card.

### `InstructorView.vue` (list)

- **Weeks per month**: number input (step 0.01) with Save button → `PUT /api/instructor/settings`. Shows validation error inline. After saving, the list is reloaded so totals reflect the new value.
- **Table** (all net): Name, hourly rate, h/week, per month, months, total. Footer row: sum of totals.
- Row click → `/instructor/:id`.
- **New instructor** button → `/instructor/new`.
- **Create invoice** button per row → `/invoice/new?fromInstructor=:id`. Disabled with tooltip `No active invoice template` when `store.invoiceTemplateAvailable` is false.
- Empty state: "No instructors yet."

### `InstructorFormView.vue`

- **Recipient**: new `RecipientPicker.vue` component — search existing recipients (`GET /api/invoice-recipient?search=`), pick one, or enter a new one; name/street/city/email/salutation fields are editable and saving updates the recipient in place. Used only by this form for now. `InvoiceFormView` is deliberately not refactored to use it (avoids conflicts with the parallel invoice-drafts work); consolidation can follow later.
- **Hourly rate** in € (input with 2 decimals, converted to cents) and **months** (integer).
- **Weekly schedule**: seven sections Mo–So. Each has `+ Block`. A block has start/end `<input type="time">`, its net hours, a `+ Pause` button and a list of breaks (start/end, remove). Blocks and breaks can be removed.
- **Summary** (live): h/week, per month, total — via `calculateInstructorRent` with the global weeks per month (`GET /api/instructor/settings` on mount).
- **Validation** (live): `validateInstructorRent`; each issue is shown next to the field matching its `path`. Save is disabled while issues exist.
- **Buttons**:
  - Save — `POST` (new) or `PUT` (edit); on success navigate to `/instructor`. Server errors shown in an error banner.
  - Delete (edit mode) — confirm, `DELETE`, navigate to `/instructor`.
  - Create invoice (edit mode, only when there are no unsaved changes) → `/invoice/new?fromInstructor=:id`.

### `InvoiceFormView.vue` (additive)

When `route.query.fromInstructor` is set (new-invoice mode), `onMounted` calls `GET /api/instructor/:id/invoice-prefill` and sets recipient (as selected existing recipient), `title`, `lineItems`, and `invoiceDate = today`. Same structure as the existing `copyFromInvoice` branch. All other behavior unchanged.

## Testing

TDD: tests are written before implementation.

### Unit — shared logic (`backend/src/__tests__/unit/instructorRent.test.ts`)

`shared` has no test runner, so these tests live in the backend unit suite.

- `blockNetMinutes`: block without breaks; block with multiple breaks
- `calculateInstructorRent`: multiple blocks across multiple weekdays; empty schedule → 0
- Rounding only at the end: 7.5 h/week × 3.25 × 6 months × 1234 cents → `totalCents = 180473` (1804.725 → rounded once); `monthlyCents` rounded independently
- `validateInstructorRent` returns an issue with the correct `path` for each rule in the validation table
- Touching blocks (`08:00–10:00`, `10:00–12:00`) and touching breaks are valid
- `validateWeeksPerMonth`: rejects `0`, negative, `NaN`; accepts `3.25`

### Integration (`backend/src/__tests__/integration/instructor.test.ts`, real SQLite)

- Create with `recipientData` creates a recipient; create/update with `recipientId` + `recipientData` updates the recipient in place
- Second instructor for the same recipient → `409`
- Invalid body (e.g. overlapping blocks, months `1.5`) → `400`, nothing written
- No recipient → `400`; unknown `recipientId` → `400`
- `GET /:id` and `GET /` return stored values plus calculation; list sorted by name
- Settings: default `3.25`; `PUT` changes list totals; `0` / negative → `400`
- `DELETE` removes instructor, keeps recipient; unknown id → `404`
- `invoice-prefill` returns recipient, title `Raummiete`, one line item with exact text and amount; `1 Monat` singular
- `/e2e/reset` succeeds when instructors exist

### Unit — frontend (`frontend/src/__tests__/`)

- `InstructorView`: renders totals and footer sum; settings save calls `PUT` and reloads; Create invoice navigates to `/invoice/new?fromInstructor=:id`
- `InstructorFormView`: adding a block/break updates the summary; overlapping blocks show an error and disable Save; Save sends the expected body
- `InvoiceFormView` with `?fromInstructor`: recipient, title and line item are prefilled

### Verification

`npm run lint && npm run test:unit && npm run test:integration`, plus the production build check from _Runtime Import Constraint_.

## Out of Scope

- VAT / gross amounts in the calculator
- Calendar-specific weeks, holidays, exceptions
- Automatic invoice or invoice-draft creation
- Refactoring `InvoiceFormView` to use `RecipientPicker`
