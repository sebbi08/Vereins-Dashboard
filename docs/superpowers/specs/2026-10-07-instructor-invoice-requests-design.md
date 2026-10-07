# Instructor Invoice Requests — Design

## Goal

Track, by hand, which calendar months have already been invoiced ("requested") from each instructor. The user ticks a month once they have sent the instructor the invoice for it. Nothing is derived from the invoices stored in the app.

## Decisions (agreed 2026-10-07)

- **Calendar months** (e.g. October 2026), independent of an instructor's `months` count. Instructors have no start date.
- **States:** a month is either **requested** or **not requested** (an invoice was sent, or not yet). No amounts, dates or notes.
- **Completely manual:** no automatic marking, no link to `Invoice` records.
- **View:** a matrix with one row per instructor and one column per month of one calendar year (Jan–Dec). A year switcher changes the year.
- **Placement:** a card "Invoice requests" on the Instructor Rent page (`/instructor`), below the instructors table.
- **Storage:** a separate table, one row per requested instructor-month.

## Data model

New Prisma model with a migration:

```prisma
model InstructorInvoiceRequest {
  id           Int        @id @default(autoincrement())
  instructorId Int
  instructor   Instructor @relation(fields: [instructorId], references: [id], onDelete: Cascade)
  month        String     // "YYYY-MM"
  createdAt    DateTime   @default(now())

  @@unique([instructorId, month])
}
```

`Instructor` gets the back-relation `invoiceRequests InstructorInvoiceRequest[]`. Deleting an instructor deletes its requests.

## Shared (`shared/`)

- `interface InstructorInvoiceRequestDto { instructorId: number; month: string }`
- `isValidRequestMonth(value: string): boolean`: `true` for `YYYY-MM` with month 01–12 and year 2000–2100.

## API (`/api/instructor`)

| Method | Path                           | Result                                                                                                                                                                                                                   |
| ------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/invoice-requests?year=2026`  | `200` with `InstructorInvoiceRequestDto[]` for all instructors in that year (months `2026-01` … `2026-12`), ordered by instructor and month. A missing or invalid year (not an integer 2000–2100) gives `400 { error }`. |
| PUT    | `/:id/invoice-requests/:month` | Marks the month as requested. Repeatable: `204` whether or not the row already existed. Unknown instructor → `404 { error }`; invalid id or month → `400 { error }`.                                                     |
| DELETE | `/:id/invoice-requests/:month` | Removes the mark. Repeatable: `204` even if it wasn't marked. Unknown instructor → `404`; invalid id or month → `400`.                                                                                                   |

The `/invoice-requests` route must be registered before `/:id`, so `invoice-requests` is never parsed as an id.

## UI: `InstructorInvoiceRequests.vue` (card on `InstructorView`)

- **Header:** title "Invoice requests", then a year switcher `‹ 2026 ›`: two icon buttons labelled "Previous year" / "Next year", and the year in between. It starts at the current year.
- **Matrix:**
  - **Rows:** one per instructor, from the instructor list the page already loaded, sorted by name. It does **not** follow the table filters above.
  - **Columns:** the instructor name, then 12 columns with English short month names (`Jan`, `Feb`, `Mar`, `Apr`, `May`, `Jun`, `Jul`, `Aug`, `Sep`, `Oct`, `Nov`, `Dec`).
  - **Current month:** when the current year is shown, its column is visually highlighted.
- **Cells:** each cell is a toggle button.
  - **Requested:** a check icon and a highlighted background, `aria-pressed="true"`. **Not requested:** empty, `aria-pressed="false"`.
  - Label: `"<Name>, <English month name> <year>: requested"` / `"… not requested"`, e.g. `"Anna Alt, October 2026: requested"`.
- **Toggling:** a click flips the cell immediately and sends `PUT` or `DELETE`.
  - **Failure:** the cell flips back and a toast shows "Could not save the invoice request".
  - **In flight:** while a request is pending, that cell is disabled.
- **Loading:** `GET` for the selected year when the card mounts and on every year change.
  - **Load failure:** an inline error message "Invoice requests could not be loaded." with all cells disabled.
  - **Stale responses:** a response for a year that is no longer selected is ignored.
- **Empty state:** without instructors the card shows "No instructors yet." instead of the matrix.
- **Layout:** the matrix scrolls horizontally inside the card on narrow screens, and the name column stays sticky. No Tailwind; PrimeVue components plus `layout.css` helpers and scoped CSS.

## Error handling

- The backend validates id, month and year as above. Prisma's unique constraint makes `PUT` safe to repeat (`upsert`); `DELETE` uses `deleteMany`.
- In the frontend, failures never leave a cell showing a state the server doesn't have: optimistic update, then revert on error.

## Testing

- **Backend integration tests** (`backend/src/__tests__/integration/`):
  - PUT creates a row and is repeatable; DELETE removes it and is repeatable.
  - An unknown instructor gives 404 and an invalid id, month or year gives 400.
  - The year filter returns only that year.
  - Deleting an instructor cascades.
- **Shared unit tests:** `isValidRequestMonth` (valid months, `2026-00`, `2026-13`, `26-01`, `1999-12`).
- **Frontend component tests:**
  - Renders the rows and 12 months, with the ticked cells from the GET.
  - A toggle sends PUT / DELETE and updates `aria-pressed`; a failed save reverts and toasts.
  - Switching years reloads, and a stale response is ignored.
  - The current month column is highlighted.
  - A load failure shows the inline message and disables the cells.
  - The empty state shows without instructors.
- **`InstructorView` test:** the card is present below the table.
- **E2E:** a smoke test on `/instructor`. Create an instructor via the API, tick the current month, reload the page, and the cell is still ticked.

## Out of scope

Linking to real invoices, amounts, payment status, automatic marking, filtering the matrix, and exports.
