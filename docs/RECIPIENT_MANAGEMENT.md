# Recipient Management Workflow

This guide documents how invoice and donation receipt recipients work, with focus on revision creation and in-place updates.

## Core Concept

When a new revision is created (not a new invoice), the form allows editing recipient/donor fields. These edits **update the linked recipient/donor record in place** rather than creating a new one or keeping the old data.

This ensures consistency: the invoice/receipt history is preserved (multiple revisions), but the recipient contact information is always current.

## Data Model

### Invoice + Recipient Relationship

```
Invoice (1) ──→ (many) InvoiceRevision
         ↓
    InvoiceRecipient
```

- Each `Invoice` has one linked `InvoiceRecipient`
- Each `Invoice` has multiple `InvoiceRevision` entries (revision 1, 2, 3, etc.)
- Each `InvoiceRevision` contains a copy of recipient data at the time of creation
- Editing a revision's recipient fields updates the **parent Invoice's InvoiceRecipient record**

### Example Workflow

1. **Create Invoice #1** with Recipient "Alice Smith, alice@example.com"
   - Saves: `InvoiceRecipient` (id=1, name="Alice", email="alice@example.com")
   - Saves: `InvoiceRevision 1` (revisionNumber=1, recipientEmail="alice@example.com", ...)

2. **Create Revision 2** — edit recipient to "Alice S., alice.smith@example.com"
   - Updates: `InvoiceRecipient` (id=1, name="Alice S.", email="alice.smith@example.com")
   - Saves: `InvoiceRevision 2` (revisionNumber=2, recipientEmail="alice.smith@example.com", ...)

3. **Later, view Invoice #1**
   - Recipient shows "Alice S." (from updated InvoiceRecipient)
   - Revision 1 shows "alice@example.com" (archived in that revision)
   - Revision 2 shows "alice.smith@example.com" (archived in that revision)

## Frontend Implementation

### InvoiceFormView.vue — Conditional Field Locking

```typescript
const recipientFieldsLocked = computed(() => {
  // Only lock if: editing an existing invoice AND recipient is selected AND not creating a new recipient
  return !isNewRevision && !!recipient.value && !newRecipient.value;
});

// In template: :disabled="recipientFieldsLocked"
```

**When fields are editable:**

- Creating a new invoice (path: `/invoice/new`)
- Creating a new revision (path: `/invoice/:id/revision`)
- Editing an invoice draft (path: `/invoice/draft/:draftId`) — every draft save (`POST`/`PUT /api/invoice-draft`) updates the linked `InvoiceRecipient` in place, like revisions

**When fields are locked:**

- Never — they're always editable (help text explains the update behavior)

### Help Text

The form shows: _"Editing these recipient fields updates the linked recipient record for this invoice."_

This guides users to understand that changes persist to the invoice's recipient data.

## Backend Implementation

### Invoice Routes — Revision Creation

**POST /api/invoice/:id/revision**

```typescript
// 1. Validate the invoice exists and is not canceled
// 2. Create new revision with recipient data from request body
// 3. Update the invoice's linked InvoiceRecipient if new data was provided
await prisma.$transaction(async (tx) => {
  // Create revision
  const revision = await tx.invoiceRevision.create({
    data: {
      invoiceId,
      revisionNumber: latestRevision.revisionNumber + 1,
      recipientEmail: newRecipientEmail,
      recipientName: newRecipientName,
      // ... other fields
    },
  });

  // Update the invoice's linked recipient (in-place)
  await tx.invoiceRecipient.update({
    where: { id: invoice.recipientId },
    data: {
      email: newRecipientEmail,
      name: newRecipientName,
    },
  });

  return revision;
});
```

**Key points:**

- Wrapped in `prisma.$transaction()` for atomicity
- Both operations must succeed or both fail
- No new `InvoiceRecipient` record is created; the existing one is updated

## Testing Patterns

### Unit Tests

Test the form logic in isolation:

```typescript
describe('InvoiceFormView — Recipient Fields', () => {
  it('should unlock recipient fields when creating new revision', () => {
    const wrapper = mount(InvoiceFormView, {
      props: { isNewRevision: true, invoiceId: 1 },
    });
    expect(wrapper.find('[data-test="recipient-name"]').attributes('disabled')).toBeUndefined();
  });

  it('should show help text on revision path', () => {
    const wrapper = mount(InvoiceFormView, {
      props: { isNewRevision: true },
    });
    expect(wrapper.text()).toContain('updates the linked recipient record');
  });
});
```

### Integration Tests

Test the full workflow in the database:

```typescript
describe('POST /api/invoice/:id/revision — Recipient Update', () => {
  it('should update the linked recipient when creating a revision', async () => {
    // 1. Create invoice with recipient
    const { invoice, recipient } = await seedRecipientAndInvoice({
      email: 'alice@example.com',
      name: 'Alice',
    });

    // 2. Create revision with new recipient data
    const response = await supertest(app).post(`/api/invoice/${invoice.id}/revision`).send({
      recipientEmail: 'alice.smith@example.com',
      recipientName: 'Alice Smith',
      // ... other fields
    });

    expect(response.status).toBe(201);

    // 3. Verify the revision was created
    const revision = response.body;
    expect(revision.recipientEmail).toBe('alice.smith@example.com');
    expect(revision.revisionNumber).toBe(2);

    // 4. Verify the linked recipient was updated (not created a new one)
    const updatedRecipient = await prisma.invoiceRecipient.findUnique({
      where: { id: recipient.id },
    });
    expect(updatedRecipient.email).toBe('alice.smith@example.com');
    expect(updatedRecipient.name).toBe('Alice Smith');

    // 5. Verify only one recipient exists for this invoice
    const recipientCount = await prisma.invoiceRecipient.count({
      where: { invoiceId: invoice.id },
    });
    expect(recipientCount).toBe(1);
  });

  it('should reject revision creation if invoice is canceled', async () => {
    const { invoice } = await seedRecipientAndInvoice();
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: 'STORNIERT' },
    });

    const response = await supertest(app)
      .post(`/api/invoice/${invoice.id}/revision`)
      .send({ recipientEmail: 'new@example.com' /* ... */ });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/canceled|storniert/i);
  });
});
```

## Donation Receipt (Spendenquittung)

The same pattern applies to donation receipts:

- `DonationReceipt` ↔ `DonationReceiptDonor` (1:1)
- `DonationReceipt` → `DonationReceiptRevision` (1:many)
- Form allows editing donor fields during revision creation
- Backend updates the linked `DonationReceiptDonor` in a transaction

See `backend/src/routes/donationReceipt.ts` and `frontend/src/views/DonationReceiptFormView.vue` for implementation.

## Common Mistakes to Avoid

❌ **Creating a new recipient record** instead of updating the existing one

- This breaks the 1:1 relationship and leaves orphaned records

❌ **Locking recipient fields during revision creation**

- Defeats the purpose of allowing edits; removes user control

❌ **Not wrapping the update in a transaction**

- If the revision create fails, the recipient update shouldn't have happened

❌ **Forgetting to test the in-place update**

- Unit tests for form logic are good, but integration tests verify DB behavior

## Summary

| Scenario                      | Behavior                                                                     |
| ----------------------------- | ---------------------------------------------------------------------------- |
| New invoice                   | Create new `InvoiceRecipient`, save revision with that data                  |
| New revision (edit recipient) | Update existing `InvoiceRecipient`, save new revision with updated data      |
| New revision (same recipient) | Keep existing `InvoiceRecipient` unchanged, save new revision with same data |
| Save invoice draft            | Update the linked `InvoiceRecipient` in place (draft fields stay editable)   |
| Edit old revision             | Cannot edit; only the latest revision can be edited (enforced by UI)         |

**Golden Rule**: One linked recipient per invoice/receipt, multiple revisions per invoice/receipt. Edits to the latest revision's form update the linked recipient in place.
