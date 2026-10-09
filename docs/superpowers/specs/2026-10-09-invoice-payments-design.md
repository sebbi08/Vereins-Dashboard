# Invoice Payments and Bank Booking Import — Design

## Goal

Record which invoices have been paid. The user marks an invoice as paid (and can undo it) by hand,
or uploads a CSV export of bank bookings; the app proposes booking ↔ invoice pairs and marks the
pairs the user confirms as paid.

## Decisions (agreed 2026-10-09)

- **Only a paid flag.** No payment date, no amount, no booking data is stored. The CSV itself is
  never stored and never sent to the server as a file.
- **Paid is separate from the status.** `AKTIV`/`STORNIERT` stays as it is. Only active invoices
  can be marked as paid; unmarking is always allowed. Cancelling a paid invoice is allowed and it
  stays marked as paid (money may have to be returned).
- **Matching runs in the backend**, the user confirms the proposals in a second step. Nothing is
  marked paid without that confirmation.
- **Only incoming bookings** (positive amount) are matched, and only against active, unpaid
  invoices.
- **Configurable import:** after picking a file the page shows the header and the first 3 rows;
  encoding, delimiter and the column mapping can be changed there. The last used values are stored
  in the database (`SystemSetting`), so they apply on every computer.
- **A differing amount** is proposed only when the invoice number is clearly in the purpose text.
  Such pairs are flagged "Amount differs" with the difference and are never preselected.
- **Out of scope:** one booking paying several invoices, partial payments. These are marked paid
  by hand.

## Sample export (for orientation, not test data)

The bank export is UTF-16 LE with BOM, CRLF line ends, `;` as delimiter. Columns vary between
exports, so they are read by header name. Known header names:
`Buchungstag;Konto;Beleg;Empfänger;Verwendungszweck;Kategorie;Klasse;Betrag`.
Amounts look like `-1.284,00` / `53,55`, dates like `24.03.2025`.

The real sample in `context/` is git-ignored and may hold real data: tests use synthetic files only.

## Data model

`Invoice` gets a new column, with a migration that is safe for the existing production database:

```prisma
model Invoice {
  // …existing fields…
  paid          Boolean           @default(false)
}
```

Existing invoices start as unpaid.

The import settings are one `SystemSetting` row, key `bookingImport`, value JSON:

```json
{
  "encoding": "utf-16le",
  "delimiter": ";",
  "columns": {
    "date": "Buchungstag",
    "payer": "Empfänger",
    "purpose": "Verwendungszweck",
    "amount": "Betrag"
  }
}
```

## Shared (`shared/`)

- `type BookingEncoding = 'utf-16le' | 'utf-8' | 'windows-1252'`
- `type BookingDelimiter = ';' | ',' | '\t'`
- `interface BookingImportSettings { encoding; delimiter; columns: { date; payer; purpose; amount } }`
  (column values are header names, `''` when unset)
- `interface Booking { row: number; date: string /* YYYY-MM-DD */; payer: string; purpose: string;
amountCents: number }` — `row` is the 1-based data row in the file, for display
- `type MatchLevel = 'CONFIDENT' | 'AMOUNT_ONLY' | 'AMOUNT_DIFFERS'`
- `type MatchReason = 'AMOUNT' | 'INVOICE_NUMBER' | 'NAME'`
- `interface MatchCandidate { invoiceId; invoiceNumber; recipientName; invoiceDate;
amountCents; reasons: MatchReason[]; differenceCents: number }` (booking − invoice)
- `interface BookingMatch { booking: Booking; level: MatchLevel; candidates: MatchCandidate[] }`
- `interface MatchResult { matches: BookingMatch[]; unmatched: Booking[] }`
- `InvoiceListItem` and the invoice detail DTO get `paid: boolean`.

## API

### Paid flag

`PATCH /api/invoice/:id/paid` with `{ paid: boolean }`

- 400 for an invalid id or body, 404 for an unknown invoice.
- 400 `Cancelled invoices cannot be marked as paid` when setting `paid: true` on a cancelled
  invoice. `paid: false` is always allowed.
- Answers the updated `{ id, paid }`.

`GET /api/invoice` returns `paid` on every item, `GET /api/invoice/:id` returns `paid`. The list
page already loads all invoices and filters in the browser, so there is no `paid` query parameter.

### Import settings

`GET /api/settings/booking-import` → `BookingImportSettings` (defaults when nothing is stored:
`utf-16le`, `;`, columns `Buchungstag`, `Empfänger`, `Verwendungszweck`, `Betrag`).

`PUT /api/settings/booking-import` with `BookingImportSettings` → stores it. 400 for an unknown
encoding or delimiter, or a column value that is not a string (max. 200 characters).

### Matching (`/api/invoice-payment`)

`POST /api/invoice-payment/match` with `{ bookings: Booking[] }` → `MatchResult`

- Changes nothing in the database.
- The body is parsed in `services/requestParsing.ts`: an array of at most 10 000 bookings, each
  with a valid `YYYY-MM-DD` date, strings for payer and purpose, a positive integer `amountCents`.
  Anything else → 400.
- This route gets its own `express.json({ limit: '2mb' })`, mounted before the global JSON parser
  in `app.ts` (the global 100 kB limit is too small for a year of bookings).

`POST /api/invoice-payment/confirm` with `{ invoiceIds: number[] }`

- Marks all of them as paid in one transaction.
- 400 `{ error: 'MISSING_IDS' }` for an empty or invalid list, 400 `{ error: 'DUPLICATE_IDS' }`
  when an id appears twice.
- 400 `{ error: 'NOT_FOUND' | 'CANCELLED', ids }` when an invoice is unknown or cancelled; nothing
  is changed then.
- An invoice that is already paid is not an error.
- Answers `{ marked: number }`.

## Matching rules (`backend/src/services/paymentMatching.ts`)

A pure function `matchBookings(bookings, invoices)` with unit tests; the route loads the invoices
and calls it.

**Candidates:** every booking with `amountCents > 0` against every active, unpaid invoice whose
invoice date is on or before the booking date. The invoice amount is the gross total of its
active revision (`calculateInvoiceTotals` with the revision's VAT). The invoice name is the name
on the active revision.

**Signals per booking/invoice pair:**

1. **Amount** — booking amount equals the invoice amount to the cent.
2. **Invoice number** in the purpose text. Invoice numbers are `<runningNumber> / <year>`.
   - **Strong:** the running number and the year appear next to each other in either order,
     separated by at least one space or one of `/ - _ .` (so `202612` does not count, and any mix
     like `/` is fine). Leading zeros on the running
     number are allowed; the year may be 4 digits or its last 2 digits. Neither number may be part
     of a longer digit run. Examples that match invoice `12 / 2026`: `12/2026`, `12 / 26`,
     `12-2026`, `RE 12 2026`, `2026/12`, `Nr. 012/2026`, `ReNr. 12.26`. Not a match: `112/2026`,
     `12/2025`, `1220 26`.
   - **Weak:** only the running number, directly after `RE`, `Re.`, `Rg`, `Rg.`, `Rechnung`,
     `Nr`, `Nr.` or `ReNr` (case-insensitive, optional `.`/`:` and spaces), not followed by a
     year. Example: `Rechnung 12`.
3. **Name** — compares the invoice name with the booking payer after normalising both: lower
   case, `ä→ae ö→oe ü→ue ß→ss`, punctuation becomes space, legal forms dropped (`gmbh`, `mbh`,
   `ev`/`e v`, `ug`, `ag`, `kg`, `ohg`, `gbr`, `co`), words shorter than 3 letters dropped. A match
   when at least half of the invoice name's remaining words occur among the payer's words (and
   the invoice name has at least one such word).

**Levels per pair:**

| Level            | Condition                                                                          | Preselected                        |
| ---------------- | ---------------------------------------------------------------------------------- | ---------------------------------- |
| `CONFIDENT`      | amount matches and (strong invoice number or name)                                 | yes, when it is the only candidate |
| `AMOUNT_ONLY`    | amount matches, no strong number and no name (a weak number is listed as a reason) | no                                 |
| `AMOUNT_DIFFERS` | amount does not match, strong invoice number found                                 | no                                 |

A differing amount with only a name match, or with only a weak number, is no proposal.

`reasons` lists the signals found (`INVOICE_NUMBER` for strong or weak).

**Per booking:** the booking appears once, with its best level (`CONFIDENT` > `AMOUNT_DIFFERS` >
`AMOUNT_ONLY`) and all candidates of that level, sorted by invoice number. A booking without any
candidate goes to `unmatched`. `matches` is sorted by level in that order, then by booking date.

## Frontend

### Paid flag

- **Payment tag:** "Paid" (success) for a paid invoice, "Open" (secondary) for an active unpaid one,
  no tag for a cancelled unpaid one (nothing is owed).
- **Invoice detail:** the payment tag next to the status tag; a button
  "Mark as paid" / "Mark as unpaid" with a confirmation dialog. For a cancelled, unpaid invoice the
  button is not shown; a cancelled, paid invoice shows "Mark as unpaid".
- **Invoice list:** a column "Payment" with the payment tag and a column filter select
  "Open / Paid" (cleared = all, the default), like the existing Email column filter. A button
  "Import bank bookings" leads to the import page.

### Import page (`/invoice/payment-import`, `InvoicePaymentImportView.vue`)

1. **File:** a file picker for `.csv`/`.txt`. The file is read in the browser
   (`File.arrayBuffer()`), never uploaded.
2. **Settings** (loaded from `GET /api/settings/booking-import` when the page opens):
   - Encoding select (UTF-16 LE, UTF-8, Windows-1252). A BOM in the file wins over the selection
     (`FF FE` → UTF-16 LE, `EF BB BF` → UTF-8) and the select shows the detected encoding.
   - Delimiter select (`;`, `,`, Tab).
   - Four column selects (Booking date, Payer, Purpose, Amount), options are the header names of
     the file. A stored name missing from the file leaves the select empty.
   - Changing any setting updates the preview at once, without picking the file again.
3. **Preview:** a table with the header and the first 3 data rows; mapped columns are highlighted.
4. **Match bookings** button, disabled until a file is read and all four columns are mapped.
   It stores the settings (`PUT /api/settings/booking-import`), converts the rows, sends the
   positive bookings to `/match` and shows the result.
5. **Result:**
   - A table: selection checkbox, booking date, payer, purpose (shortened, full text as tooltip),
     booking amount, invoice (number as link to the detail page, opens in a new tab), name,
     invoice amount, level tag ("Confident" success, "Amount differs" warn with the difference
     e.g. "−1,00 €", "Amount only" secondary), reasons ("Amount · Invoice number · Name").
   - Rows with several candidates show a select of the candidates instead of one invoice; nothing
     is preselected there.
   - `CONFIDENT` rows with one candidate start selected; all others start unselected.
   - An invoice can be selected in one row only: selecting it elsewhere is disabled while it is
     selected in another row.
   - Collapsible sections: "Bookings without a match (n)" and "Skipped rows (n)" with row number,
     raw values and the reason ("Unreadable amount", "Unreadable date").
   - "Mark n invoices as paid" with a confirmation dialog → `/confirm`. On success a toast, and the
     confirmed rows disappear from the result. On a 400 the error is shown and nothing changes.

### CSV reading (`frontend/src/utils/bookingCsv.ts`, unit-tested)

- `decodeBookingFile(buffer, encoding)` → `{ text, encoding }` using `TextDecoder`, BOM detection
  as above, BOM removed.
- `parseCsv(text, delimiter)` → `string[][]`: RFC-4180 style quoting (`"…"`, `""` inside quotes,
  delimiter and line breaks inside quotes), CRLF and LF, empty trailing line ignored. No new
  dependency.
- `parseGermanAmount('-1.284,00')` → `-128400`; `null` when unreadable. Accepts an optional sign,
  `.` thousands separators, `,` decimals with 0–2 digits, surrounding spaces and an optional `€`.
- `parseGermanDate('24.03.2025')` → `'2025-03-24'`; `null` when not a real date.
- `toBookings(rows, header, columns)` → `{ bookings: Booking[], skipped: SkippedRow[] }` with
  `interface SkippedRow { row: number; values: string[]; reason: 'AMOUNT' | 'DATE' }`; payer and
  purpose are trimmed; rows with amount `≤ 0` are dropped silently (outgoing bookings), unreadable
  rows go to `skipped`.

Empty file, or a file with only a header → message "The file contains no bookings".

## Error handling

- Backend validation as listed per endpoint; errors go through `errorHandler.ts`.
- Frontend requests use `requestJson`; server errors and network errors are shown on the page.
- A wrong encoding shows up as garbled preview text; the user changes the select.

## Testing

- **Shared/backend unit:** `paymentMatching` — every number spelling above (match and no-match),
  name normalisation (umlauts, legal forms, short words), each level, best-level selection,
  several candidates, invoice date after booking date, cancelled/paid invoices excluded.
- **Frontend unit:** `bookingCsv` — quotes, delimiter and line break inside quotes, BOM handling,
  all three encodings, amounts and dates (valid and invalid), skipped rows.
- **Backend integration:** `PATCH /:id/paid` (set, unset, cancelled → 400, unknown → 404);
  `paid` in list and detail; settings GET defaults / PUT / invalid; `/match` (validation, result,
  2 MB body accepted); `/confirm` (atomic, duplicates, cancelled, unknown, already paid).
- **Frontend component:** detail toggle; list filter; import view — preview follows encoding and
  delimiter, stored settings are loaded and saved, preselection rules, an invoice cannot be
  selected twice, confirmed rows disappear.
- **E2E:** one spec with a synthetic UTF-16 LE CSV: create an invoice, import, confirm, invoice
  shows as paid; then mark as unpaid on the detail page.
