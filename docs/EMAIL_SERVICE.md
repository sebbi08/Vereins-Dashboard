# Email Service Architecture

This guide documents the email sending system, with focus on the critical constraint: **test emails must never update invoice/receipt status**.

## Core Design: Two Endpoints Per Revision

Each invoice and donation receipt revision supports two email endpoints:

| Endpoint                                        | Purpose   | Recipient                    | Status Update                   |
| ----------------------------------------------- | --------- | ---------------------------- | ------------------------------- |
| `POST /api/invoice/:revisionId/send-email`      | Real send | Original recipient           | Updates `emailStatus` to "SENT" |
| `POST /api/invoice/:revisionId/send-test-email` | Test send | Test address (from settings) | **No status update**            |

**Why two endpoints?**

- Users want to test email content before sending to the real recipient
- Test sends should be repeatable without blocking real sends
- Test sends should not mark the invoice as "sent" in the system

## The forceTestAddress Pattern

The email service uses a conditional mode called `forceTestAddress`:

```typescript
// backend/src/services/emailService.ts
async function sendInvoiceEmail(revisionId: number, forceTestAddress: boolean = false) {
  // ... fetch revision, validate state

  if (revision.invoice.status === 'STORNIERT') {
    return { success: false, error: 'Canceled invoices cannot be sent by email' };
  }

  // Route to test address if forceTestAddress is true
  const recipient = forceTestAddress ? emailTestAddress : revision.recipientEmail;

  // Send email
  await transporter.sendMail({
    to: recipient,
    subject: `Invoice ${revision.invoice.number}`,
    html: generateEmailBody(revision),
  });

  // CRITICAL: Only update status on real send, not on test send
  if (!forceTestAddress) {
    await prisma.invoiceRevision.update({
      where: { id: revisionId },
      data: { emailStatus: 'SENT' },
    });
  }

  return { success: true };
}
```

**Key behaviors:**

1. **Real send** (`forceTestAddress=false`): Updates `emailStatus` after sending
2. **Test send** (`forceTestAddress=true`): Sends email but **skips the DB update**
3. **Canceled invoice**: Rejects both real and test sends at the service layer

## Route Integration

### Real Send Endpoint

**POST /api/invoice/:revisionId/send-email**

```typescript
router.post('/revision/:revisionId/send-email', async (req, res) => {
  // 1. Validate the revision exists
  const revision = await prisma.invoiceRevision.findUnique({
    where: { id: parseInt(req.params.revisionId) },
    include: { invoice: true },
  });
  if (!revision) return res.status(404).json({ error: 'Revision not found' });

  // 2. Validate it's the latest revision (can only send the latest version)
  const latestRevision = await prisma.invoiceRevision.findFirst({
    where: { invoiceId: revision.invoiceId },
    orderBy: { revisionNumber: 'desc' },
  });
  if (latestRevision.id !== revision.id) {
    return res.status(400).json({ error: 'Email can only be sent for the latest revision' });
  }

  // 3. Validate invoice is active (not canceled)
  if (revision.invoice.status !== 'AKTIV') {
    return res.status(400).json({ error: 'Only active invoices can be sent' });
  }

  // 4. Send with forceTestAddress=false (real recipient)
  const result = await sendInvoiceEmail(revision.id, false);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  res.json({ success: true });
});
```

### Test Send Endpoint

**POST /api/invoice/:revisionId/send-test-email**

```typescript
router.post('/revision/:revisionId/send-test-email', async (req, res) => {
  // Same validation as real send (latest revision, active invoice)
  // ...

  // Send with forceTestAddress=true (test address only)
  const result = await sendInvoiceEmail(revision.id, true);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  res.json({ success: true, message: 'Test email sent' });
});
```

**Critical difference:** Same validation (latest revision, active invoice), but `forceTestAddress=true` so no DB update occurs.

## Frontend Integration

### InvoiceDetailView.vue — Action Buttons

```vue
<template>
  <!-- Download PDF -->
  <button @click="downloadPDF(rev.id)" v-if="rev.pdfStatus === 'OK'">📥 Download</button>

  <!-- Send Real Email (only if: PDF ready, invoice active, latest revision) -->
  <button
    @click="confirmAndSend(rev.id)"
    v-if="rev.pdfStatus === 'OK' && invoice.status === 'AKTIV' && isLatestRevision(rev.id)"
    class="border border-green-300 text-green-700"
  >
    📧 Send
  </button>

  <!-- Send Test Email (only if: PDF ready, invoice active, latest revision) -->
  <button
    @click="sendTestEmail(rev.id)"
    v-if="rev.pdfStatus === 'OK' && invoice.status === 'AKTIV' && isLatestRevision(rev.id)"
    class="border border-blue-300 text-blue-700"
  >
    🧪 Send Test
  </button>

  <!-- Retry PDF (if PDF generation failed) -->
  <button @click="retryPDF(rev.id)" v-if="rev.pdfStatus === 'FAILED'">↻ Retry PDF</button>
</template>

<script setup>
function isLatestRevision(revisionId: number): boolean {
  return invoice.value?.revisions?.[0]?.id === revisionId;
}

async function confirmAndSend(revisionId: number) {
  if (!confirm('Send invoice to real recipient?')) return;
  const response = await fetch(`/api/invoice/revision/${revisionId}/send-email`, {
    method: 'POST',
  });
  if (response.ok) {
    // Refetch invoice to update status
    await loadInvoice();
  } else {
    alert('Failed to send: ' + (await response.text()));
  }
}

async function sendTestEmail(revisionId: number) {
  // No confirmation needed; test sends are safe to repeat
  const response = await fetch(`/api/invoice/revision/${revisionId}/send-test-email`, {
    method: 'POST',
  });
  if (response.ok) {
    alert('Test email sent successfully');
    // Note: We do NOT refetch invoice here because status didn't change
  } else {
    alert('Failed to send test email: ' + (await response.text()));
  }
}
</script>
```

## Testing Patterns

### Unit Tests — Email Service Isolation

**backend/src/**tests**/unit/emailService.test.ts**

Test the email service without touching the database:

```typescript
describe('emailService — forceTestAddress behavior', () => {
  it('should redirect to test address when forceTestAddress=true', async () => {
    const result = await sendInvoiceEmail(revisionId, true);

    expect(mockNodemailer.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'test@example.com', // forceTestAddress redirects here
      }),
    );
    expect(result.success).toBe(true);
  });

  it('should not update DB when forceTestAddress=true', async () => {
    const result = await sendInvoiceEmail(revisionId, true);

    expect(mockPrisma.invoiceRevision.update).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it('should update DB when forceTestAddress=false', async () => {
    const result = await sendInvoiceEmail(revisionId, false);

    expect(mockPrisma.invoiceRevision.update).toHaveBeenCalledWith({
      where: { id: revisionId },
      data: { emailStatus: 'SENT' },
    });
    expect(result.success).toBe(true);
  });

  it('should be repeatable: multiple test sends do not error', async () => {
    const result1 = await sendInvoiceEmail(revisionId, true);
    const result2 = await sendInvoiceEmail(revisionId, true);
    const result3 = await sendInvoiceEmail(revisionId, true);

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);
    expect(result3.success).toBe(true);
    expect(mockNodemailer.sendMail).toHaveBeenCalledTimes(3);
  });

  it('should reject canceled invoices', async () => {
    // Mock a canceled invoice
    mockPrisma.invoiceRevision.findUnique.mockResolvedValueOnce({
      invoice: { status: 'STORNIERT' },
    });

    const result = await sendInvoiceEmail(revisionId, false);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/canceled/i);
    expect(mockNodemailer.sendMail).not.toHaveBeenCalled();
  });

  it('should handle missing SMTP settings gracefully', async () => {
    mockConfig.emailSmtpHost = undefined;

    const result = await sendInvoiceEmail(revisionId, false);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/SMTP|settings/i);
  });
});
```

### Integration Tests — Full Workflow

**backend/src/**tests**/integration/email.test.ts**

Test the routes with a real database:

```typescript
describe('POST /api/invoice/:revisionId/send-email — Real Send', () => {
  it('should send email and update emailStatus', async () => {
    const { invoice, revision } = await seedInvoiceWithRevision();

    const response = await supertest(app)
      .post(`/api/invoice/revision/${revision.id}/send-email`)
      .expect(200);

    // Verify email was sent
    expect(mockNodemailer.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: invoice.recipientEmail,
      }),
    );

    // Verify status was updated in DB
    const updated = await prisma.invoiceRevision.findUnique({
      where: { id: revision.id },
    });
    expect(updated.emailStatus).toBe('SENT');
  });

  it('should reject if not the latest revision', async () => {
    const { invoice, revision: rev1 } = await seedInvoiceWithRevision();

    // Create revision 2
    const rev2 = await prisma.invoiceRevision.create({
      data: {
        invoiceId: invoice.id,
        revisionNumber: 2,
        recipientEmail: invoice.recipientEmail,
        // ... other fields
      },
    });

    // Try to send revision 1 (not latest)
    const response = await supertest(app)
      .post(`/api/invoice/revision/${rev1.id}/send-email`)
      .expect(400);

    expect(response.body.error).toMatch(/latest/i);
  });

  it('should reject if invoice is canceled', async () => {
    const { invoice, revision } = await seedInvoiceWithRevision();

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: 'STORNIERT' },
    });

    const response = await supertest(app)
      .post(`/api/invoice/revision/${revision.id}/send-email`)
      .expect(400);

    expect(response.body.error).toMatch(/canceled|aktiv/i);
  });
});

describe('POST /api/invoice/:revisionId/send-test-email — Test Send', () => {
  it('should send email to test address and NOT update emailStatus', async () => {
    const { invoice, revision } = await seedInvoiceWithRevision();
    const initialStatus = revision.emailStatus;

    const response = await supertest(app)
      .post(`/api/invoice/revision/${revision.id}/send-test-email`)
      .expect(200);

    // Verify email was sent
    expect(mockNodemailer.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'test@example.com', // Test address, not recipient
      }),
    );

    // Verify status was NOT updated
    const updated = await prisma.invoiceRevision.findUnique({
      where: { id: revision.id },
    });
    expect(updated.emailStatus).toBe(initialStatus); // Unchanged
  });

  it('should allow multiple test sends', async () => {
    const { revision } = await seedInvoiceWithRevision();

    const response1 = await supertest(app)
      .post(`/api/invoice/revision/${revision.id}/send-test-email`)
      .expect(200);

    const response2 = await supertest(app)
      .post(`/api/invoice/revision/${revision.id}/send-test-email`)
      .expect(200);

    const response3 = await supertest(app)
      .post(`/api/invoice/revision/${revision.id}/send-test-email`)
      .expect(200);

    // All should succeed
    expect(response1.body.success).toBe(true);
    expect(response2.body.success).toBe(true);
    expect(response3.body.success).toBe(true);
  });

  it('should reject if invoice is canceled', async () => {
    const { invoice, revision } = await seedInvoiceWithRevision();

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: 'STORNIERT' },
    });

    const response = await supertest(app)
      .post(`/api/invoice/revision/${revision.id}/send-test-email`)
      .expect(400);

    expect(response.body.error).toMatch(/canceled|aktiv/i);
  });
});
```

## Critical Rules

These rules are enforced by the backend and should not be bypassed:

| Rule                                 | Enforcement                  | Bypass? |
| ------------------------------------ | ---------------------------- | ------- |
| Only latest revision can be sent     | Route validation (400 error) | ❌ No   |
| Only active invoices can be sent     | Service layer guard          | ❌ No   |
| Test emails don't update status      | Conditional logic in service | ❌ No   |
| Test emails redirect to test address | forceTestAddress parameter   | ❌ No   |

**If you need to send an old revision or a canceled invoice:** You must first create a new revision or reactivate the invoice. These guards prevent accidental sends and maintain audit trails.

## Environment Configuration

### SMTP Settings

The email service reads from environment variables:

```bash
# .env
EMAIL_SMTP_HOST=mail.example.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_USER=sender@example.com
EMAIL_SMTP_PASSWORD=***
EMAIL_FROM_ADDRESS=sender@example.com
EMAIL_TEST_ADDRESS=test@example.com  # Where test sends go
```

### Development Mode

In development (`NODE_ENV !== 'production'`), the email service may auto-redirect all sends to the test address. Check `backend/src/services/emailService.ts` for the current behavior.

## Summary

| Concept              | Detail                                                          |
| -------------------- | --------------------------------------------------------------- |
| **Two endpoints**    | `/send-email` (real) and `/send-test-email` (test)              |
| **forceTestAddress** | When true, redirects recipient email and skips DB status update |
| **Validation**       | Both endpoints require latest revision and active invoice       |
| **Repeatability**    | Test sends can be triggered any number of times                 |
| **Auditability**     | Real sends update status; test sends leave it unchanged         |
| **Safety**           | Canceled invoices reject both real and test sends               |

**Golden Rule**: Test emails should be indistinguishable from real sends except that they go to a different address and don't update the invoice's email status.
