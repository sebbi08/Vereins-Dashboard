# Email Sending for Invoices — Design Spec

**Date**: 2026-06-22
**Status**: Approved

---

## Overview

Add the ability to send invoice PDFs via email directly from the application. Configure SMTP settings and email templates in the invoice settings page. In development mode, override the target email address with a configurable test address.

---

## Database Changes

### New SystemSetting Keys

Stored in the existing `SystemSetting` key-value table:

| Key                | Type                       | Description                      | Default                                                                                   |
| ------------------ | -------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------- |
| `smtpHost`         | string                     | SMTP server hostname             | `""`                                                                                      |
| `smtpPort`         | number (stored as string)  | SMTP port                        | `"587"`                                                                                   |
| `smtpUser`         | string                     | SMTP username/email              | `""`                                                                                      |
| `smtpPassword`     | string                     | SMTP password (plaintext)        | `""`                                                                                      |
| `smtpSecure`       | boolean (stored as string) | Use TLS (`"true"`/`"false"`)     | `"false"`                                                                                 |
| `emailSubject`     | string                     | Email subject template           | `"Ihre Rechnung {number}"`                                                                |
| `emailBody`        | string (multiline)         | Email body template              | `"{salutation}\n\nanbei erhalten Sie Ihre Rechnung {number}.\n\nMit freundlichen Grüßen"` |
| `emailTestAddress` | string                     | Test override address (dev only) | `""`                                                                                      |

### New InvoiceRevision Columns

| Column        | Type    | Default      | Description                  |
| ------------- | ------- | ------------ | ---------------------------- |
| `emailStatus` | String  | `"NOT_SENT"` | `NOT_SENT`, `SENT`, `FAILED` |
| `emailError`  | String? | `null`       | Error message if `FAILED`    |

### Migration

A new Prisma migration will add these two columns to `InvoiceRevision`.

---

## Backend

### New Dependency

`nodemailer` — added to `backend/package.json`.

### New Service: `backend/src/services/emailService.ts`

```
sendInvoiceEmail(prisma, revisionId: number) → { success, error? }
sendTestEmail(prisma) → { success, error? }
```

#### Variable Substitution

The following variables are replaced in `emailSubject` and `emailBody`:

- `{salutation}` → `InvoiceRevision.emailSalutation`
- `{name}` → `InvoiceRevision.name`
- `{number}` → `Invoice.number`
- `{email}` → `InvoiceRevision.email`

#### Dev Override Logic

In `sendInvoiceEmail`:

```
if (NODE_ENV !== 'production' && emailTestAddress is set) {
  to = emailTestAddress
  prepend note to body: "[DEV OVERRIDE — Original recipient: {name} <{email}>]\n\n"
}
```

#### Attachment

The generated PDF (`InvoiceRevision.filePath`) is attached to the email. If no PDF exists or `pdfStatus !== 'OK'`, the send fails.

### New Route: `backend/src/routes/emailSettings.ts`

| Method | Path                       | Body/Params             | Response                                  |
| ------ | -------------------------- | ----------------------- | ----------------------------------------- |
| `GET`  | `/api/email-settings`      | —                       | `EmailSettings` object                    |
| `PUT`  | `/api/email-settings`      | Partial `EmailSettings` | `{ message: 'Saved' }`                    |
| `POST` | `/api/email-settings/test` | —                       | `{ message: 'Test email sent' }` or error |

### Modified Route: `backend/src/routes/invoice.ts`

| Method | Path                                           | Response                       |
| ------ | ---------------------------------------------- | ------------------------------ |
| `POST` | `/api/invoice/revision/:revisionId/send-email` | `{ emailStatus, emailError? }` |

This route must come before `/:id` in the router to avoid matching `send-email` as an ID.

### Route Registration

`emailSettingsRouter` registered at `/api/email-settings` in `backend/src/routes/index.ts`.

---

## Shared Types

### New Interface: `EmailSettings`

```ts
interface EmailSettings {
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPassword: string;
  smtpSecure: string;
  emailSubject: string;
  emailBody: string;
  emailTestAddress: string;
}
```

### Modified: `InvoiceRevisionDto`

Add:

- `emailStatus: 'NOT_SENT' | 'SENT' | 'FAILED'`
- `emailError: string | null`

### Modified: `revisionToDto` (backend)

Include `emailStatus` and `emailError` in the DTO mapping.

---

## Frontend

### Modified: `InvoiceSettingsView.vue`

Add a new "Email Settings" section between the template section and the recipient management section:

**Fields:**

- SMTP Host (text input)
- SMTP Port (number input)
- SMTP User (text input)
- SMTP Password (password input)
- Secure / TLS (checkbox)
- Email Subject (text input, with placeholder showing `{number}`, `{salutation}`, `{name}`)
- Email Body (textarea, multi-line)
- Test Email Address (text input)

**Button:** "Send Test Email" — calls `POST /api/email-settings/test`, shows result.

**Save:** All fields save on blur/change via `PUT /api/email-settings`.

### Modified: `InvoiceDetailView.vue`

In the revision action buttons area (where "Download PDF" and "PDF neu generieren" are):

Add **"Send via Email"** button:

- Visible when `pdfStatus === 'OK'` AND `emailStatus !== 'SENT'`
- Shows loading state while sending
- On success: shows green confirmation, refreshes invoice data
- On failure: shows red error
- If already `SENT`: shows "Email Sent ✓" badge instead

---

## Files Changed Summary

| File                                         | Change                                                       |
| -------------------------------------------- | ------------------------------------------------------------ |
| `backend/prisma/schema.prisma`               | Add `emailStatus`, `emailError` to `InvoiceRevision`         |
| `backend/package.json`                       | Add `nodemailer` dependency                                  |
| `backend/src/services/emailService.ts`       | **New** — email sending logic                                |
| `backend/src/routes/emailSettings.ts`        | **New** — email settings CRUD + test                         |
| `backend/src/routes/index.ts`                | Register `emailSettingsRouter`                               |
| `backend/src/routes/invoice.ts`              | Add `POST .../send-email` route, include email fields in DTO |
| `shared/src/index.ts`                        | Add `EmailSettings` type, extend `InvoiceRevisionDto`        |
| `frontend/src/views/InvoiceSettingsView.vue` | Add email settings section                                   |
| `frontend/src/views/InvoiceDetailView.vue`   | Add "Send via Email" button                                  |

---

## Testing

- **Unit tests**: `emailService.ts` variable substitution, dev override logic
- **Integration tests**: Email settings CRUD, send-email endpoint
- **E2E tests**: Invoice settings page shows email section, detail page shows send button
