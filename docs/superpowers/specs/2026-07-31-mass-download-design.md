# Mass Download — Invoices & Donation Receipts

**Date**: 2026-07-31
**Status**: Approved

## Overview

Add checkbox-based multi-select to invoice and donation receipt list views, allowing users to download multiple PDFs as a single ZIP file.

## Backend

### New Endpoints

| Method | Path | Body | Response |
|--------|------|------|----------|
| `POST` | `/api/invoice/download-batch` | `{ ids: number[] }` | `application/zip` or `400` |
| `POST` | `/api/donation-receipt/download-batch` | `{ ids: number[] }` | `application/zip` or `400` |

### Validation

Before any ZIP work, validate all IDs:

1. Load each invoice/receipt with its active revision
2. Any not found → `400 { error: "NOT_FOUND", ids: [...] }`
3. Any `STORNIERT` → `400 { error: "CANCELLED", ids: [...] }`
4. Any active revision with `pdfStatus !== 'OK'` or `filePath === null` → `400 { error: "PDF_NOT_READY", ids: [...] }`

All validation runs first; the error response lists ALL problematic IDs in one round-trip.

### ZIP Assembly

- Library: `archiver` (streaming, no native deps)
- Response headers: `Content-Type: application/zip`, `Content-Disposition: attachment; filename="rechnungen-YYYY-MM-DD.zip"` (or `quittungen-YYYY-MM-DD.zip`)
- Internal filenames: `{number}-R{revNumber}.pdf` (e.g., `RE-2026-0001-R1.pdf`)
- Piped directly to response — no temp ZIP file on disk

### Route Ordering

Both `download-batch` routes must be defined **before** the `/:id` param route.

### Only the Latest Active Revision

Each selected entry contributes exactly one PDF: its current `AKTIV` revision.

## Frontend

### List View Changes

Both `InvoiceView.vue` and `DonationReceiptView.vue`:

- **Checkbox column**: Leftmost column with row checkboxes + header "select all" checkbox
- **"Download selected" button**: In header area, disabled when no selection, shows count: `Download selected (3)`
- **State**: `selectedIds: Set<number>` — local component state, no Pinia needed

### Download Flow

1. User selects entries → clicks "Download selected"
2. `POST /api/{type}/download-batch` with `{ ids: [...] }`
3. **200**: `response.blob()` → object URL → `<a>` download → revoke URL
4. **400**: Parse JSON, show toast with details, deselect problematic IDs

### ZIP Filename

- Invoices: `rechnungen-YYYY-MM-DD.zip`
- Donation receipts: `quittungen-YYYY-MM-DD.zip`

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Empty selection | Button disabled, no request |
| All valid | ZIP downloaded |
| Some not ready / cancelled | 400, toast with details, problematic IDs deselected |
| Network error | Toast "Download failed, please try again" |
| Server error (500) | Toast "Server error during ZIP creation" |

## Testing

### Backend Integration Tests

- Valid batch returns ZIP with correct content type, filename, and internal filenames
- 400 on cancelled entries
- 400 on PDF not ready (PENDING/FAILED)
- 400 on not found
- 400 on empty/missing IDs array
- Error responses include correct `error` code and `ids` array

### Frontend Unit Tests

- Checkbox toggling and "select all" behavior
- Button disabled state and count display
- Correct API call with selected IDs
- Error toast on 400 responses
