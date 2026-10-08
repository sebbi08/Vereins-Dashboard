# Email Service

How invoices are sent by email. Code: `backend/src/services/emailService.ts`, routes in
`backend/src/routes/invoice.ts` and `backend/src/routes/emailSettings.ts`, UI in
`frontend/src/views/InvoiceDetailView.vue` and `InvoiceSettingsView.vue`.

## Configuration

All settings live in the database (`SystemSetting` rows), edited on _Invoice settings → Email_
and read on every send. There are no SMTP environment variables.

| Key                | Meaning                                                             |
| ------------------ | ------------------------------------------------------------------- |
| `smtpHost`         | SMTP server; required                                               |
| `smtpPort`         | Port, default `587`                                                 |
| `smtpUser`         | Login; required. Also used as the `From` address                    |
| `smtpPassword`     | Password; required                                                  |
| `smtpSecure`       | `"true"` for implicit TLS (port 465); otherwise STARTTLS if offered |
| `emailSubject`     | Subject template, default `Ihre Rechnung {number}`                  |
| `emailBody`        | Plain-text body template                                            |
| `emailTestAddress` | Address for test sends; also BCC'd on every real send (see below)   |

Templates support `{salutation}`, `{name}`, `{number}`, `{title}` and `{email}`, filled from the
revision. Mails are plain text with the revision PDF attached as `<number>.pdf`.

## Two sends per revision

| Endpoint                                                 | Goes to             | Changes `emailStatus`                    |
| -------------------------------------------------------- | ------------------- | ---------------------------------------- |
| `POST /api/invoice/revision/:revisionId/send-email`      | the invoice address | yes: `SENT` or `FAILED` (+ `emailError`) |
| `POST /api/invoice/revision/:revisionId/send-test-email` | `emailTestAddress`  | **never**                                |

Both call `sendInvoiceEmail(prisma, revisionId, { forceTestAddress })`. A test send prepends
`[TEST SEND — Original recipient: …]` to the body.

**Critical rule:** a test send must never change the revision's email status — neither on
success nor on failure. Tests: `__tests__/unit/emailService.test.ts`.

## Guards

Both endpoints refuse (400) unless:

- the revision is the latest of its invoice;
- the PDF is finished (`pdfStatus` `OK` with a file);
- the invoice is not cancelled (`STORNIERT`);
- SMTP host, user and password are set (test sends also need a test address).

A real send additionally needs exactly one valid recipient address: an empty address gives
"This invoice has no email address", a list such as `a@x.de, b@y.de` (which nodemailer would
send to both) gives "The recipient email address is not valid". A second send of the same
revision while one is running answers 409.

## Development override and BCC

- With `NODE_ENV` other than `production` and a test address set, a **real** send is redirected
  to the test address with a `[DEV OVERRIDE — …]` note, but the revision is still marked `SENT`.
  This only matters for the local docker-compose stack; the production image sets
  `NODE_ENV=production`. The settings page shows the current mode.
- When a test address is configured, every real send also BCCs it (a copy for the club).

## Settings test

`POST /api/email-settings/test` sends a fixed test mail to `emailTestAddress` using the **saved**
settings. The settings page disables the button while there are unsaved edits.

## Frontend

On the invoice detail page the latest active revision with a finished PDF shows _Send Test
Email_ and, until it was sent, _Send via Email_. The latter asks for confirmation naming the
invoice and the address, and is disabled when the invoice has no address. The status tag shows
`SENT`/`FAILED`, with the error text for failures.
