# Invoice Email Text per Invoice and Draft Preview — Design

## Goal

1. The email subject and text of an invoice can be adapted per draft and per invoice, instead of
   being built from the global template only at the moment of sending.
2. A draft can be looked at as a PDF, marked with a "Preview" watermark, before it becomes an
   invoice.

## Decisions (agreed 2026-10-12)

- **Written down at creation.** When a draft is first saved or an invoice is created directly,
  subject and text are built from the template in the email settings and stored. `{salutation}`,
  `{name}`, `{title}` and `{email}` are replaced by the values of that moment; `{number}` stays,
  because a draft has no number yet. Later changes to the template only affect new drafts and
  invoices.
- **Kept afterwards.** Saving a draft again, or creating a new revision, never changes the stored
  subject and text, whatever else is edited. Only the user changes them: by editing, or with the
  button "Reset from template".
- **Stored on the invoice, not on the revision.** The text is not part of the PDF, so changing it
  needs no new revision.
- **Edited after creation only.** The form for a new invoice or a new draft does not show the
  fields. Drafts: in the form of a saved draft. Invoices: on the invoice page.
- **What is shown is what is sent.** Sending replaces only `{number}` in the stored text.
- **Preview shows the saved draft only**, never unsaved form content, and exists for drafts only
  (not in the forms "New Invoice" and "New Revision").
- **Preview uses no invoice number and stores nothing.**

## Data model

Two nullable columns each on `Invoice` and `InvoiceDraft`, with a migration that is safe for the
existing production database:

```prisma
  emailSubject String?
  emailBody    String?
```

`null` means "nothing stored yet" — only for invoices and drafts from before this change. For
them the app works with the text the current template gives (see "Existing data").

## Building the text (`backend/src/services/invoiceEmailText.ts`)

- `interface InvoiceEmailText { emailSubject: string; emailBody: string }`
- `interface EmailTextValues { emailSalutation: string; name: string; title: string; email: string }`
- `buildInvoiceEmailText(settings, values): InvoiceEmailText` — takes the templates `emailSubject`
  and `emailBody` from the settings rows (with today's defaults when empty: subject
  `Ihre Rechnung {number}`, body
  `{salutation}\n\nanbei erhalten Sie Ihre Rechnung {number}.\n\nMit freundlichen Grüßen`),
  replaces `{salutation}` (the email salutation), `{name}`, `{title}`, `{email}`, and leaves
  `{number}` untouched.
- `fillInvoiceNumber(text, number): string` — replaces every `{number}`.
- `parseEmailText` in `services/requestParsing.ts`: subject is a string, not blank, without line
  breaks, at most 200 characters; body is a string of at most 10 000 characters. Anything else →
  400 `Invalid request body`, a blank subject → 400 `Email subject is required`.

## Behaviour

| Event                                            | Subject and text                                                                                            |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| New draft saved (`POST /api/invoice-draft`)      | built from the template and the draft's values, stored                                                      |
| Draft saved again (`PUT /api/invoice-draft/:id`) | unchanged, unless the request carries an edited text                                                        |
| Draft becomes an invoice (`…/activate`)          | the draft's stored text is copied to the invoice; a draft without stored text gets one built at that moment |
| Invoice created directly (`POST /api/invoice`)   | built from the template and the invoice's values, stored                                                    |
| Invoice copied ("Copy")                          | a new invoice: built fresh, not copied                                                                      |
| New revision                                     | unchanged                                                                                                   |
| Invoice cancelled                                | unchanged, shown read-only                                                                                  |

**Sending** (`sendInvoiceEmail`, real and test sends alike): uses the invoice's stored subject and
text and replaces only `{number}`. An invoice without stored text is sent as today: the text is
built from the template with the revision's values at that moment.

**Existing data.** `GET /api/invoice/:id` and `GET /api/invoice-draft/:id` always answer a subject
and a text: the stored ones, or — when nothing is stored — what the template gives now for the
current values (invoice: the active revision, or the latest one if none is active). Nothing is
written until the user saves.

## API

- `GET /api/invoice-draft/:id` → `InvoiceDraftDto` with `emailSubject`, `emailBody`.
- `PUT /api/invoice-draft/:id` accepts an optional `emailText: { emailSubject, emailBody }` next to
  the existing body. Present → validated and stored; absent → the stored text is left alone.
- `GET /api/invoice/:id` → `InvoiceDto` with `emailSubject`, `emailBody`.
- `PATCH /api/invoice/:id/email-text` with `{ emailSubject, emailBody }` → stores them and answers
  `{ emailSubject, emailBody }`. 400 for an invalid id or body, 404 for an unknown invoice, 400
  `Cancelled invoices cannot be changed` for a cancelled one.
- `POST /api/email-settings/invoice-text` with `{ emailSalutation, name, title, email }` →
  `{ emailSubject, emailBody }` built from the template. Stores nothing; it serves "Reset from
  template". 400 for a body of the wrong shape.
- `GET /api/invoice-draft/:id/preview` → the preview PDF (`application/pdf`, inline, file name
  `invoice-preview.pdf`). 400 `Invalid ID`, 404 `Draft not found`, 400
  `No active invoice template found`, 500 `Preview could not be generated` (the technical error
  goes to the server log only).

Shared types: `InvoiceDraftDto` and `InvoiceDto` get `emailSubject: string` and
`emailBody: string`; `InvoiceEmailText` is exported from `shared`.

## Preview PDF

- Built from the saved draft and the active invoice template with the same code as a real
  invoice (`buildInvoiceDocx` → LibreOffice), with today's date and the text `Preview` in place of
  the invoice number. Required fields are not checked: an incomplete draft shows gaps.
- `addWatermark(pdf, text)` in `backend/src/services/pdfWatermark.ts` (pdf-lib, already a
  dependency) then draws `Preview` on every page: centred, rotated 45°, bold, light grey, 35 %
  opacity, sized to about 60 % of the page diagonal.
- The PDF is only sent to the browser. No invoice number is taken, no file is written to the data
  directory, nothing changes in the database.

## Frontend

### `components/InvoiceEmailText.vue`

The editor used in both places: a subject input, a text area, the hint "`{number}` is replaced by
the invoice number when the email is sent", and the button "Reset from template".

- `v-model:subject`, `v-model:body`; prop `source: EmailTextValues` (what "Reset from template"
  builds the text from); prop `disabled`.
- "Reset from template" calls `POST /api/email-settings/invoice-text` with `source` and puts the
  answer into the two fields. It stores nothing; the surrounding form or card saves.
- A blank subject shows "Email subject is required" (`v-model:invalid`).

### Draft form (`InvoiceFormView.vue`, saved drafts only)

- A section "Email" with the editor, below the existing fields. `source` is the current form
  content, so a reset uses what is typed, also when it is not saved yet.
- "Save Draft" sends the text as `emailText`. Edits count as unsaved changes (existing guard).
- A button "Preview" opens `/api/invoice-draft/:id/preview` in a new tab. While the form has
  unsaved changes it is disabled, with the hint "Save the draft to preview it".

### Draft list (`InvoiceView.vue`)

Each draft row gets a small button "Preview" that opens the same URL in a new tab, without
opening the draft.

### Invoice page (`InvoiceDetailView.vue`)

- A card "Email" with the editor, "Save" and (through the editor) "Reset from template". `source`
  is the active revision.
- While the card has unsaved changes, "Send via Email" and "Send Test Email" are disabled with the
  hint "Save the email text first", and leaving the page asks for confirmation (existing unsaved
  changes guard).
- For a cancelled invoice the card is read-only (fields disabled, no buttons).

## Error handling

- Saving the text: server and network errors as toasts; the fields keep the user's input.
- "Reset from template" failing: toast "Email text could not be loaded from the template"; the
  fields stay as they are.
- Preview errors are shown by the browser tab as the JSON error answer; the list and the form are
  not affected.

## Testing

- **Unit (backend):** `buildInvoiceEmailText` (placeholders replaced, `{number}` kept, defaults
  for empty templates), `fillInvoiceNumber`, `addWatermark` (same number of pages, every page
  gets the text), `sendInvoiceEmail` (stored text with only `{number}` replaced for real and test
  sends; fallback to the template without stored text; a test send still never changes the
  status).
- **Integration:** every row of the behaviour table; `PATCH …/email-text` (stores, validation,
  cancelled, unknown); `GET` fallback without stored text; `POST /api/email-settings/invoice-text`;
  the preview endpoint (PDF answer with LibreOffice replaced by a stub, 404, no template, failed
  conversion → 500, no invoice number used and no file written).
- **Frontend:** the editor component (reset fills the fields, blank subject); draft form (section
  only for saved drafts, text sent with the save, preview button disabled with unsaved changes);
  draft list preview button; invoice page (save, send buttons disabled while unsaved, read-only
  when cancelled).
- **E2E:** create a draft, change the email text, open the preview (answer is a PDF), create the
  invoice from the draft, the invoice page shows the changed text.
- `docs/EMAIL_SERVICE.md` is updated.
