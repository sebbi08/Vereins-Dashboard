# Configurable Instructor Invoice Text + Multi-line Line Items

**Date**: 2026-10-05
**Status**: Approved
**Builds on**: `2026-10-05-instructor-rent-design.md`

## Overview

The text of the line item that "Create invoice" prefills for an instructor becomes a configurable, multi-line template with placeholders for the calculated numbers. One global template is edited on the Instructor Rent page; a built-in default applies while none is configured. To support multi-line texts, invoice line items in general (all invoices, including drafts) can contain line breaks in the form, the detail view and the PDF.

## Decisions

| Topic                 | Decision                                                                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Scope of template     | One global template (no per-instructor override)                                                                                        |
| Storage               | `SystemSetting` key `instructorInvoiceTemplate`; missing/blank → built-in default. No migration                                         |
| Rendering             | Backend renders in the invoice-prefill endpoint via a pure shared function; the settings page uses the same function for a live preview |
| Placeholder syntax    | `{name}` — lowercase letters and `_` only                                                                                               |
| Unknown placeholders  | Rejected on save (`400`), flagged live in the UI                                                                                        |
| Template length       | Max 2000 characters                                                                                                                     |
| Title / amount        | Unchanged: title `Raummiete`, amount = `calculation.totalCents`                                                                         |
| Multi-line line items | Line breaks (`\n`) allowed in every invoice line item text: textarea in the form, preserved in the detail view, `<w:br/>` in the PDF    |
| Existing invoices     | Untouched; only newly prefilled invoices use the template                                                                               |

## Placeholders

Example values for: Anna Alt, 12,50 €/h, 6 months, 3,25 weeks/month, Mo 14:00–18:00 with Pause 16:00–16:30, Do 09:00–13:00.

| Placeholder           | Meaning                             | Example                                                |
| --------------------- | ----------------------------------- | ------------------------------------------------------ |
| `{name}`              | Recipient name                      | `Anna Alt`                                             |
| `{monate}`            | Months, with unit                   | `6 Monate` (`1 Monat` when 1)                          |
| `{stunden_pro_woche}` | Net hours per week, exact           | `7,5 h`; `7 h 50 min` when not exact with ≤ 2 decimals |
| `{wochen_pro_monat}`  | Weeks per month setting             | `3,25`                                                 |
| `{stundensatz}`       | Net hourly rate                     | `12,50 €`                                              |
| `{betrag_pro_monat}`  | Net amount per month                | `304,69 €`                                             |
| `{betrag_gesamt}`     | Net total (= line amount)           | `1.828,13 €`                                           |
| `{zeiten}`            | Weekly schedule, one line per block | `Mo 14:00–18:00 (Pause 16:00–16:30)`⏎`Do 09:00–13:00`  |

Formatting rules:

- Hours: as today — German decimal trimmed (`7,5 h`, `8 h`, `0,25 h`) when `netMinutesPerWeek % 3 === 0`, otherwise `{H} h {M} min` (`7 h 50 min`, `0 h 50 min`).
- Weeks: German decimal, up to 2 decimals, trailing zeros trimmed (`3,25`, `4`).
- Money (`{stundensatz}`, `{betrag_pro_monat}`, `{betrag_gesamt}`): German format with thousands separator and exactly 2 decimals, suffix ` €` (`12,50 €`, `1.828,13 €`). Implemented without `Intl` (deterministic in Node and browser).
- `{zeiten}`: blocks sorted by weekday order Mo→So, then start time. Line format `{Wd} {start}–{end}` plus ` (Pause {s}–{e}, {s}–{e})` when breaks exist (breaks sorted by start). Weekday labels `Mo Di Mi Do Fr Sa So`. En dash `–`. Empty string when there are no blocks.

## Default Template

```
Raummiete {monate}
{stunden_pro_woche}/Woche × {wochen_pro_monat} Wochen × {monate} × {stundensatz}
```

Rendered example:

```
Raummiete 6 Monate
7,5 h/Woche × 3,25 Wochen × 6 Monate × 12,50 €
```

This replaces today's one-line text `Raummiete 6 Monate (7,5 h/Woche × 3,25 Wochen × 6 Monate × 12,50 €)` for newly prefilled invoices.

## Shared Code (`shared/src/instructorInvoiceText.ts`)

```ts
export type InstructorInvoicePlaceholder =
  | 'name'
  | 'monate'
  | 'stunden_pro_woche'
  | 'wochen_pro_monat'
  | 'stundensatz'
  | 'betrag_pro_monat'
  | 'betrag_gesamt'
  | 'zeiten';

export const INSTRUCTOR_INVOICE_PLACEHOLDERS: readonly {
  key: InstructorInvoicePlaceholder;
  description: string; // English UI description, e.g. 'Recipient name'
}[];

export const DEFAULT_INSTRUCTOR_INVOICE_TEMPLATE: string;
export const MAX_INSTRUCTOR_INVOICE_TEMPLATE_LENGTH = 2000;

export type InstructorInvoiceTextValues = Record<InstructorInvoicePlaceholder, string>;

export function buildInstructorInvoiceTextValues(
  name: string,
  inputs: InstructorRentInputs,
  weeksPerMonth: number,
): InstructorInvoiceTextValues;

/** Unique unknown `{word}` tokens in order of first appearance, e.g. ['{monat}']. */
export function findUnknownPlaceholders(template: string): string[];

/** Normalizes \r\n → \n, replaces known placeholders; anything else stays literal. */
export function renderInstructorInvoiceText(
  template: string,
  values: InstructorInvoiceTextValues,
): string;

/** Blank/whitespace-only → default; otherwise the template as given. */
export function effectiveInstructorInvoiceTemplate(template: string | null | undefined): string;

/** null when valid, else the error message (see Errors). */
export function validateInstructorInvoiceTemplate(template: string): string | null;
```

Placeholder token pattern: `/\{([a-z_]+)\}/g`. Text in braces that does not match this pattern (`{ }`, `{12}`, `{Name}`) is literal and not an error.

The number-formatting helpers currently in `backend/src/services/instructorRent.ts` (`formatDecimal`, the exact-hours formatter, the months label) move into shared so backend and preview format identically. `buildInvoiceLineText` in the backend service is replaced by the shared functions. `shared/src/index.ts` re-exports the new module (`export * from './instructorInvoiceText.js'`).

Backend `src/` imports these runtime values via relative `.js` paths (existing constraint).

## Backend

### Settings

`InstructorSettingsDto` becomes:

```ts
export interface InstructorSettingsDto {
  weeksPerMonth: number;
  invoiceTemplate: string | null; // null = built-in default in use
}
```

| Method | Path                       | Body                                   | Behavior                                                                                                                                                                                                                                                               |
| ------ | -------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/instructor/settings` | —                                      | `{ weeksPerMonth, invoiceTemplate }`; `invoiceTemplate` is `null` when the row is missing or blank                                                                                                                                                                     |
| `PUT`  | `/api/instructor/settings` | `{ weeksPerMonth?, invoiceTemplate? }` | At least one key required. `weeksPerMonth` validated as today. `invoiceTemplate`: `null` or blank string → delete the row (default); otherwise `\r\n`→`\n`, validate, upsert. Both keys validated before anything is written. Returns the full `InstructorSettingsDto` |

### Invoice Prefill

`GET /api/instructor/:id/invoice-prefill` builds the single line item text as `renderInstructorInvoiceText(effectiveInstructorInvoiceTemplate(stored), buildInstructorInvoiceTextValues(recipient.name, inputs, weeksPerMonth))`. Title and `priceInCents` unchanged.

### Errors

| Case                                                              | Response                                                        |
| ----------------------------------------------------------------- | --------------------------------------------------------------- |
| `PUT` body has neither `weeksPerMonth` nor `invoiceTemplate`      | `400 { error: 'Nothing to update' }`                            |
| `invoiceTemplate` not a string or null                            | `400 { error: 'Invalid request body' }`                         |
| Unknown placeholders                                              | `400 { error: 'Unknown placeholders: {monat}, {xyz}' }`         |
| Template longer than 2000 characters (after `\r\n` normalization) | `400 { error: 'Invoice text must be at most 2000 characters' }` |
| Invalid `weeksPerMonth`                                           | unchanged from today                                            |

### PDF

No behavior change. To make multi-line items testable, the DOCX-building part of `generateInvoicePdf` (everything up to the LibreOffice conversion) is extracted into an exported `buildInvoiceDocx(...)` returning the DOCX buffer; `generateInvoicePdf` calls it. Pure refactor. Docxtemplater's existing `linebreaks: true` turns `\n` in `{textN}` values into `<w:br/>`.

## Frontend

### Instructor Rent page (`InstructorView.vue`)

New card "Invoice text" below the weeks-per-month card:

- `<textarea>` (6 rows, monospace not required). Loaded from `GET /settings`: the configured template, or `DEFAULT_INSTRUCTOR_INVOICE_TEMPLATE` with the hint "Using the default text." when `invoiceTemplate` is `null`.
- Placeholder list from `INSTRUCTOR_INVOICE_PLACEHOLDERS` (token + description). Clicking a token inserts it at the textarea cursor (replacing a selection) and keeps focus.
- Live preview (`whitespace-pre-line`) via `renderInstructorInvoiceText` with values from `buildInstructorInvoiceTextValues` for the first instructor in the list. That requires the instructor's schedule, which the list DTO does not carry, so the page loads `GET /api/instructor/:id` for the first instructor (only when at least one exists). With no instructors: built-in example values (the Anna Alt example above) and the caption "Example values".
- Live validation via `validateInstructorInvoiceTemplate`; message shown under the textarea; Save disabled while invalid or while settings failed to load.
- Save → `PUT /settings { invoiceTemplate }`; success hint "Saved". Reset to default → confirm, then `PUT /settings { invoiceTemplate: null }`, textarea shows the default again with the hint.
- The existing weeks-per-month Save sends only `{ weeksPerMonth }` (unchanged).

### Invoice form (`InvoiceFormView.vue`) — all invoices

- Line item text `<input type="text">` becomes `<textarea rows="1">` that grows with its content (height follows `scrollHeight` on input and on load). Same classes/width; no other change to the form, validation, drafts or submit logic.

### Invoice detail view (`InvoiceDetailView.vue`)

- Line item text rendered with `whitespace-pre-line`.

## Testing

TDD.

### Unit — shared (`backend/src/__tests__/unit/instructorInvoiceText.test.ts`)

- `buildInstructorInvoiceTextValues` for the example → exact values from the placeholder table, incl. `{zeiten}` two lines; `1 Monat`; `7 h 50 min`; empty schedule → `{zeiten}` = `''`; `{zeiten}` sorting (blocks entered Do then Mo, breaks out of order) and multiple breaks; money with thousands separator.
- `renderInstructorInvoiceText`: default template renders exactly the two lines above; all placeholders replaced; repeated placeholders replaced each time; `{ }`, `{12}`, `{Name}` stay literal; `\r\n` → `\n`.
- `findUnknownPlaceholders`: `{monat}` and `{xyz}` found once each in order; known ones not reported.
- `validateInstructorInvoiceTemplate`: unknown → message; 2001 chars → length message; valid → null.
- `effectiveInstructorInvoiceTemplate`: `null`, `''`, `'  \n '` → default; custom → unchanged.

### Unit — PDF (`backend/src/__tests__/unit/invoiceDocx.test.ts`)

- `buildInvoiceDocx` with `e2e/fixture/Rechnung.docx` and a line item `"Zeile 1\nZeile 2"` → unzipped `word/document.xml` contains `Zeile 1` and `Zeile 2` separated by `<w:br/>`.

### Integration (`backend/src/__tests__/integration/instructor.test.ts`)

- `GET /settings` default → `invoiceTemplate: null`.
- `PUT { invoiceTemplate: custom }` → stored; prefill text = custom rendered (multi-line).
- `PUT { invoiceTemplate: null }` and `{ invoiceTemplate: '' }` → row deleted; prefill uses default.
- Unknown placeholder → 400 message, nothing stored; > 2000 chars → 400.
- `PUT { weeksPerMonth }` leaves template unchanged and vice versa; `PUT {}` → 400 `Nothing to update`.
- Prefill with default template → `Raummiete 6 Monate\n7,5 h/Woche × 3,25 Wochen × 6 Monate × 12,00 €` (existing test data: 12,00 €).
- Existing prefill tests updated to the new default text.

### Unit — frontend

- `InstructorView`: default hint + default text shown when `invoiceTemplate` is null; typing updates the preview; unknown placeholder shows message and disables Save; clicking a placeholder inserts it at the cursor; Save sends `{ invoiceTemplate }`; Reset sends `{ invoiceTemplate: null }` after confirm; preview uses the first instructor's data.
- `InvoiceFormView`: line item text is a `<textarea>`; a multi-line value is sent unchanged in the submit body.
- `InvoiceDetailView`: a line item with `\n` is rendered in an element with `whitespace-pre-line` containing both lines.

### Verification

`npm run lint && npm run test:unit && npm run test:integration`, `npm run build`, and a browser check of the settings card, preview, prefilled invoice and the PDF of an invoice with a multi-line item.

## Out of Scope

- Per-instructor templates
- Templates for title or for ordinary (non-instructor) invoices
- Rich text / formatting beyond line breaks
- Changing texts of already created invoices
