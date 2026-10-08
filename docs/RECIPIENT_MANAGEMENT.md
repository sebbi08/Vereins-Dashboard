# Recipients, Donors and Revisions

How invoice recipients and donation-receipt donors relate to documents and their revisions.

## Model

```
InvoiceRecipient 1 ── n Invoice 1 ── n InvoiceRevision
InvoiceRecipient 1 ── n InvoiceDraft
InvoiceRecipient 1 ── 0..1 Instructor

Donor 1 ── n DonationReceipt 1 ── n DonationReceiptRevision
```

- The recipient/donor is the **master record**: current name, address, email, salutation.
- Every revision stores its **own copy** of these fields (`name`, `street`, `city`, `email`,
  `salutation` on invoice revisions; `name`, `street`, `city`, `letterSalutation`,
  `addressSalutation` on receipt revisions). The PDF of a revision always shows that copy.
- A new revision supersedes the previous one (`ERSETZT`); revision numbers are unique per
  document and are assigned inside the transaction.

## Saving updates the master record in place

Creating an invoice or receipt, saving a draft and creating a revision all update the linked
master record from the form fields, in the same transaction as the document write. No second
recipient/donor is created for an existing one.

- Invoices: `saveRecipient()` in `backend/src/services/invoiceCreation.ts`; revisions in
  `POST /api/invoice/:id/revision`.
- Receipts: `POST /api/donation-receipt` and `POST /api/donation-receipt/:id/revision`.

## Forms

- **Prefill from the master record.** Copying an invoice or creating a revision fills the
  address from the current recipient, not from the archived revision (the copy may predate an
  address change). A revision shows "pre-filled with the current recipient master data" when the
  two differed. The receipt form does the same for donors.
- **Invoices:** recipient fields stay editable when a recipient is linked; a hint says edits
  update that recipient. _New recipient_ unlinks it and empties the fields, so the invoice
  creates a new recipient.
- **Receipts:** typing in the donor search does not unlink the picked donor; only picking
  another donor or _Create … as new donor_ changes the link.

## Deleting

Donors without donation receipts and recipients without invoices, drafts or an instructor can be
deleted from the settings tables. Others are kept (409 with the reason), because issued
documents must stay complete.

## Tests

- `backend/src/__tests__/integration/invoice.test.ts` — revision updates the recipient in place
- `backend/src/__tests__/integration/masterDataDeletion.test.ts` — deleting unused master data
- `frontend/src/__tests__/InvoiceFormView.test.ts` — prefill from master data, _New recipient_
- `frontend/src/__tests__/DonorAutocomplete.test.ts` — donor stays linked while typing
