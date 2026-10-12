# Invoice Email Text and Draft Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Email subject and text are stored per draft and per invoice (built from the template at
creation, editable afterwards), and a saved draft can be viewed as a PDF with a "Preview"
watermark.

**Architecture:** Two nullable columns on `Invoice` and `InvoiceDraft` hold the text. One service
(`invoiceEmailText.ts`) builds it from the template and is the only place that knows the
placeholders; sending fills in only `{number}`. A shared Vue component edits the text in the draft
form and on the invoice page. The preview reuses `buildInvoiceDocx` and LibreOffice, then a
pdf-lib step draws the watermark; nothing is stored.

**Tech Stack:** Express 5, Prisma 7 (SQLite), pdf-lib, docxtemplater, Vue 3 + PrimeVue 5, Vitest,
WebdriverIO.

**Spec:** `docs/superpowers/specs/2026-10-12-invoice-email-text-and-draft-preview-design.md`

## Global Constraints

- After every task: `npm run lint && npm run test:unit && npm run test:integration` must pass
  (zero lint warnings).
- Request bodies are parsed in `backend/src/services/requestParsing.ts`; never cast `req.body`.
- The backend imports runtime values from `shared` by relative path
  (`../../../shared/src/<file>.js`); type-only imports use `'shared'`.
- Placeholders replaced when the text is built: `{salutation}` (the email salutation), `{name}`,
  `{title}`, `{email}`. `{number}` is kept and replaced only when sending.
- Default templates when the settings are empty: subject `Ihre Rechnung {number}`, body
  `{salutation}\n\nanbei erhalten Sie Ihre Rechnung {number}.\n\nMit freundlichen Grüßen`.
- Subject: not blank, no line breaks, at most 200 characters. Body: at most 10 000 characters.
- A test send must never change a revision's email status (existing rule, existing tests).
- The preview takes no invoice number, writes no file to the data directory and changes nothing
  in the database.
- UI text is English. PrimeVue components + `assets/layout.css` helpers + scoped CSS; no Tailwind.
  No new dependencies.
- Migrations must be safe on the existing production database.
- Never run `npm test`, `npm run test:e2e` or `e2e/run-tests.sh`; never touch ports 3000/5173 or
  the user's Docker stack. E2E runs only against scratch servers (Task 8).
- Never read the `context/` folder.
- Commits: conventional, lower-case subject, body lines ≤ 100 characters, ending with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. The invoice page reloads itself every 2 s while a PDF is pending: a reload must not overwrite
   an email text the user is typing → Task 7 test "keeps unsaved email text when the invoice is
   reloaded".
2. A name or title containing `$&`, `$1` or another placeholder (`{title}`) must appear literally
   in the built text, not be re-interpreted → Task 1 test.
3. A template subject with a line break, or a very long title, must still give a subject that can
   be saved later (single line, ≤ 200 characters) → Task 1 test.
4. A draft with only a name (no title, empty line items) must still give a preview instead of an
   error → Task 4 test.
5. Sending while the email card has unsaved edits would send the old text → send buttons disabled
   while unsaved (Task 7 test).

## File Structure

| File                                                                              | Responsibility                                                           |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `shared/src/invoiceEmailText.ts`                                                  | `InvoiceEmailText`, `EmailTextValues`, length limits                     |
| `shared/src/index.ts`                                                             | re-export; `emailSubject`/`emailBody` on `InvoiceDto`, `InvoiceDraftDto` |
| `backend/prisma/schema.prisma`, migration `20261012180000_add_invoice_email_text` | columns                                                                  |
| `backend/src/services/invoiceEmailText.ts`                                        | build text from template, fill number, stored-or-built                   |
| `backend/src/services/emailService.ts`                                            | send the stored text                                                     |
| `backend/src/services/requestParsing.ts`                                          | `parseEmailText`, `parseEmailTextValues`, draft body                     |
| `backend/src/services/invoiceCreation.ts`                                         | store the text with a new invoice                                        |
| `backend/src/routes/invoiceDraft.ts`                                              | store/keep/return text, activation copies it, preview route              |
| `backend/src/routes/invoice.ts`                                                   | return text, `PATCH /:id/email-text`                                     |
| `backend/src/routes/emailSettings.ts`                                             | `POST /invoice-text`                                                     |
| `backend/src/services/pdfWatermark.ts`                                            | `addWatermark`                                                           |
| `backend/src/services/invoicePreview.ts`                                          | draft content → watermarked preview PDF                                  |
| `frontend/src/components/InvoiceEmailText.vue`                                    | editor: subject, text, hint, reset                                       |
| `frontend/src/views/InvoiceFormView.vue`                                          | section "Email Text" + "Preview" for saved drafts                        |
| `frontend/src/views/InvoiceView.vue`                                              | "Preview" per draft row                                                  |
| `frontend/src/views/InvoiceDetailView.vue`                                        | "Email" card, save, send lock                                            |
| `e2e/tests/invoice-email-text.spec.ts`, `docs/EMAIL_SERVICE.md`                   | end-to-end, docs                                                         |

---

### Task 1: Build the text, store columns, send the stored text

**Files:**

- Create: `shared/src/invoiceEmailText.ts`; modify `shared/src/index.ts` (re-export)
- Modify: `backend/prisma/schema.prisma`; create
  `backend/prisma/migrations/20261012180000_add_invoice_email_text/migration.sql`
- Create: `backend/src/services/invoiceEmailText.ts`
- Modify: `backend/src/services/emailService.ts`
- Test: `backend/src/__tests__/unit/invoiceEmailText.test.ts` (new),
  `backend/src/__tests__/unit/emailService.test.ts`

**Interfaces:**

- Produces (shared): `interface InvoiceEmailText { emailSubject: string; emailBody: string }`,
  `type EmailTextValues = Pick<InvoiceContent, 'emailSalutation' | 'name' | 'title' | 'email'>`,
  `MAX_EMAIL_SUBJECT_LENGTH = 200`, `MAX_EMAIL_BODY_LENGTH = 10_000`.
- Produces (backend): `buildInvoiceEmailText(settings: SettingRow[], values: EmailTextValues):
InvoiceEmailText`, `fillInvoiceNumber(text: string, number: string): string`,
  `storedOrBuiltEmailText(stored: StoredEmailText, settings: SettingRow[], values:
EmailTextValues): InvoiceEmailText` with `type SettingRow = { key: string; value: string }` and
  `interface StoredEmailText { emailSubject?: string | null; emailBody?: string | null }`.
- Produces (Prisma): `Invoice.emailSubject`, `Invoice.emailBody`, `InvoiceDraft.emailSubject`,
  `InvoiceDraft.emailBody` (all `String?`).

- [ ] **Step 1: Shared types**

`shared/src/invoiceEmailText.ts`:

```ts
import type { InvoiceContent } from './index.js';

/** Subject and text of the email an invoice is sent with. `{number}` is filled in on sending. */
export interface InvoiceEmailText {
  emailSubject: string;
  emailBody: string;
}

/** The values the template placeholders are replaced with when the text is built. */
export type EmailTextValues = Pick<InvoiceContent, 'emailSalutation' | 'name' | 'title' | 'email'>;

export const MAX_EMAIL_SUBJECT_LENGTH = 200;
export const MAX_EMAIL_BODY_LENGTH = 10_000;
```

In `shared/src/index.ts`, next to the other re-exports: `export * from './invoiceEmailText.js';`

- [ ] **Step 2: Write the failing unit tests for the builder**

`backend/src/__tests__/unit/invoiceEmailText.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  buildInvoiceEmailText,
  fillInvoiceNumber,
  storedOrBuiltEmailText,
} from '../../services/invoiceEmailText';

const values = {
  emailSalutation: 'Sehr geehrte Frau Alt',
  name: 'Anna Alt',
  title: 'Raummiete Oktober',
  email: 'anna@example.org',
};

const settings = [
  { key: 'emailSubject', value: 'Rechnung {number}: {title}' },
  { key: 'emailBody', value: '{salutation},\n\nRechnung {number} für {name} ({email}).' },
];

describe('buildInvoiceEmailText', () => {
  it('fills in the values and keeps {number} for sending', () => {
    expect(buildInvoiceEmailText(settings, values)).toEqual({
      emailSubject: 'Rechnung {number}: Raummiete Oktober',
      emailBody: 'Sehr geehrte Frau Alt,\n\nRechnung {number} für Anna Alt (anna@example.org).',
    });
  });

  it('uses the default templates when the settings are empty or missing', () => {
    const expected = {
      emailSubject: 'Ihre Rechnung {number}',
      emailBody:
        'Sehr geehrte Frau Alt\n\nanbei erhalten Sie Ihre Rechnung {number}.\n\nMit freundlichen Grüßen',
    };
    expect(buildInvoiceEmailText([], values)).toEqual(expected);
    expect(
      buildInvoiceEmailText(
        [
          { key: 'emailSubject', value: '' },
          { key: 'emailBody', value: '' },
        ],
        values,
      ),
    ).toEqual(expected);
  });

  it('puts values in literally, whatever they contain', () => {
    const text = buildInvoiceEmailText(settings, {
      ...values,
      name: 'A {title} $& $1 B',
      title: 'Kurs {name}',
    });
    expect(text.emailSubject).toBe('Rechnung {number}: Kurs {name}');
    expect(text.emailBody).toContain('für A {title} $& $1 B (');
  });

  it('builds a subject that fits one line of at most 200 characters', () => {
    const multiline = [{ key: 'emailSubject', value: 'Rechnung\r\n{number}\n{title}' }];
    expect(buildInvoiceEmailText(multiline, values).emailSubject).toBe(
      'Rechnung {number} Raummiete Oktober',
    );

    const long = buildInvoiceEmailText(settings, { ...values, title: 'x'.repeat(500) });
    expect(long.emailSubject).toHaveLength(200);
  });
});

describe('fillInvoiceNumber', () => {
  it('replaces every {number} and nothing else', () => {
    expect(fillInvoiceNumber('Nr. {number} / {number}, {name}', '7 / 2026')).toBe(
      'Nr. 7 / 2026 / 7 / 2026, {name}',
    );
  });
});

describe('storedOrBuiltEmailText', () => {
  it('prefers the stored text', () => {
    const stored = { emailSubject: 'Mein Betreff', emailBody: 'Mein Text' };
    expect(storedOrBuiltEmailText(stored, settings, values)).toEqual(stored);
  });

  it('builds the text when nothing is stored', () => {
    const built = buildInvoiceEmailText(settings, values);
    expect(
      storedOrBuiltEmailText({ emailSubject: null, emailBody: null }, settings, values),
    ).toEqual(built);
    expect(storedOrBuiltEmailText({}, settings, values)).toEqual(built);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm run test:unit --workspace=backend -- invoiceEmailText`
Expected: FAIL — cannot resolve `../../services/invoiceEmailText`.

- [ ] **Step 4: Implement the builder**

`backend/src/services/invoiceEmailText.ts`:

```ts
import type { EmailTextValues, InvoiceEmailText } from 'shared';
import { MAX_EMAIL_SUBJECT_LENGTH } from '../../../shared/src/invoiceEmailText.js';

export const DEFAULT_EMAIL_SUBJECT = 'Ihre Rechnung {number}';
export const DEFAULT_EMAIL_BODY =
  '{salutation}\n\nanbei erhalten Sie Ihre Rechnung {number}.\n\nMit freundlichen Grüßen';

export type SettingRow = { key: string; value: string };

/** Text columns of an invoice or draft; missing or null means nothing is stored yet. */
export interface StoredEmailText {
  emailSubject?: string | null;
  emailBody?: string | null;
}

function template(settings: SettingRow[], key: string, fallback: string): string {
  return settings.find((row) => row.key === key)?.value || fallback;
}

/**
 * Subject and text for one invoice or draft, built from the templates in the email settings.
 * Every placeholder is filled in with today's values except `{number}`: a draft has no number
 * yet, so it is filled in when the email is sent. The subject always fits one line.
 */
export function buildInvoiceEmailText(
  settings: SettingRow[],
  values: EmailTextValues,
): InvoiceEmailText {
  const replacements: Record<string, string> = {
    salutation: values.emailSalutation,
    name: values.name,
    title: values.title,
    email: values.email,
  };
  // One pass with a function: a value is never read as a placeholder or a "$&" pattern
  const fill = (text: string) =>
    text.replace(/\{(salutation|name|title|email)\}/g, (_match, key: string) => replacements[key]);

  const subject = fill(template(settings, 'emailSubject', DEFAULT_EMAIL_SUBJECT))
    .replace(/\s*[\r\n]+\s*/g, ' ')
    .trim()
    .slice(0, MAX_EMAIL_SUBJECT_LENGTH);
  return {
    emailSubject: subject,
    emailBody: fill(template(settings, 'emailBody', DEFAULT_EMAIL_BODY)),
  };
}

/** The last step before sending: the invoice number goes in. */
export function fillInvoiceNumber(text: string, number: string): string {
  return text.replaceAll('{number}', () => number);
}

/** The stored text, or what the template gives now for records from before texts were stored. */
export function storedOrBuiltEmailText(
  stored: StoredEmailText,
  settings: SettingRow[],
  values: EmailTextValues,
): InvoiceEmailText {
  if (stored.emailSubject != null && stored.emailBody != null) {
    return { emailSubject: stored.emailSubject, emailBody: stored.emailBody };
  }
  return buildInvoiceEmailText(settings, values);
}
```

Run: `npm run test:unit --workspace=backend -- invoiceEmailText` — Expected: PASS.

- [ ] **Step 5: Columns and migration**

In `backend/prisma/schema.prisma` add to model `Invoice` (after `paid`) and to model
`InvoiceDraft` (after `emailSalutation`):

```prisma
  emailSubject    String?
  emailBody       String?
```

(align the columns with the model's existing formatting).

`backend/prisma/migrations/20261012180000_add_invoice_email_text/migration.sql`:

```sql
-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "emailBody" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "emailSubject" TEXT;

-- AlterTable
ALTER TABLE "InvoiceDraft" ADD COLUMN "emailBody" TEXT;
ALTER TABLE "InvoiceDraft" ADD COLUMN "emailSubject" TEXT;
```

Run `npm run generate --workspace=backend`.

- [ ] **Step 6: Write the failing send tests**

In `backend/src/__tests__/unit/emailService.test.ts`, inside
`describe('sendInvoiceEmail — dev override', …)`, add:

```ts
it('sends the text stored on the invoice and only fills in the number', async () => {
  process.env.NODE_ENV = 'production';
  const stored = {
    ...revision,
    invoice: {
      ...revision.invoice,
      emailSubject: 'Meine Rechnung {number} für {name}',
      emailBody: 'Hallo Max,\n\nRechnung {number}. {salutation}',
    },
  };

  await sendInvoiceEmail(buildPrismaMock({ revision: stored }), 1);

  const mail = sendMailMock.mock.calls[0][0];
  expect(mail.subject).toBe('Meine Rechnung 2024-001 für {name}');
  expect(mail.text).toBe('Hallo Max,\n\nRechnung 2024-001. {salutation}');
});

it('uses the stored text for a test send as well', async () => {
  process.env.NODE_ENV = 'production';
  const stored = {
    ...revision,
    invoice: { ...revision.invoice, emailSubject: 'Betreff {number}', emailBody: 'Mein Text' },
  };

  await sendInvoiceEmail(buildPrismaMock({ revision: stored }), 1, { forceTestAddress: true });

  const mail = sendMailMock.mock.calls[0][0];
  expect(mail.subject).toBe('Betreff 2024-001');
  expect(mail.text).toBe(
    '[TEST SEND — Original recipient: Max Mustermann <max@example.com>]\n\nMein Text',
  );
});

it('builds the text from the template when the invoice has none stored', async () => {
  process.env.NODE_ENV = 'production';

  await sendInvoiceEmail(buildPrismaMock(), 1);

  const mail = sendMailMock.mock.calls[0][0];
  expect(mail.subject).toBe('Rechnung 2024-001');
  expect(mail.text).toBe('Herr\n\nRechnung 2024-001.');
});
```

Run: `npm run test:unit --workspace=backend -- emailService`
Expected: the first two FAIL (the template text is sent instead of the stored text).

- [ ] **Step 7: Send the stored text**

In `backend/src/services/emailService.ts`:

- add `import { fillInvoiceNumber, storedOrBuiltEmailText } from './invoiceEmailText.js';`
- delete the `emailSubject` / `emailBody` constants read from the settings, the `vars` object and
  the two `replaceVariables(…)` lines; in their place:

```ts
// What is stored on the invoice is what goes out; only the number is filled in here
const text = storedOrBuiltEmailText(revision.invoice, settings, revision);
let to = revision.email.trim();
let body = fillInvoiceNumber(text.emailBody, revision.invoice.number);
const subject = fillInvoiceNumber(text.emailSubject, revision.invoice.number);
```

- delete the now unused `replaceVariables` function, and in the test file its import and the whole
  `describe('replaceVariables', …)` block.

- [ ] **Step 8: Verify and commit**

Run: `npm run lint && npm run test:unit && npm run test:integration` — Expected: PASS.

```bash
git add shared backend
git commit -m "feat: send the email text stored on the invoice" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Store the text at creation, keep it, return it

**Files:**

- Modify: `shared/src/index.ts` (`InvoiceDto`, `InvoiceDraftDto`)
- Modify: `backend/src/services/requestParsing.ts`, `backend/src/services/invoiceCreation.ts`,
  `backend/src/routes/invoiceDraft.ts`, `backend/src/routes/invoice.ts`
- Modify (fixtures only): every `InvoiceDto` / `InvoiceDraftDto` literal in
  `frontend/src/__tests__/` that `npm run typecheck` reports
- Test: `backend/src/__tests__/integration/invoiceEmailText.test.ts` (new)

**Interfaces:**

- Consumes: Task 1 (`buildInvoiceEmailText`, `storedOrBuiltEmailText`, shared types, columns).
- Produces: `InvoiceDto.emailSubject: string`, `InvoiceDto.emailBody: string`, the same two on
  `InvoiceDraftDto`; `parseEmailText(raw: unknown): Parsed<InvoiceEmailText>`;
  `parseDraftBody` result gains `emailText?: InvoiceEmailText`;
  `createInvoiceWithFirstRevision(tx, { …, emailText?: InvoiceEmailText })`.

- [ ] **Step 1: Write the failing integration tests**

`backend/src/__tests__/integration/invoiceEmailText.test.ts`:

```ts
import supertest from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { initializeApp } from '../../init';
import { prisma } from '../../prismaClient';
import { useCleanDatabase } from './helpers';

let request: ReturnType<typeof supertest>;

beforeAll(async () => {
  await initializeApp();
  request = supertest(createApp());
});

useCleanDatabase();

const inputs = {
  salutation: 'Frau',
  name: 'Anna Alt',
  street: 'Hauptstr. 1',
  city: '12345 Berlin',
  invoiceDate: '2026-10-01',
  title: 'Raummiete',
  lineItems: [{ text: 'Raummiete Oktober', priceInCents: 10000 }],
  vat: 19,
  directDebit: false,
  email: 'anna@example.org',
  emailSalutation: 'Sehr geehrte Frau Alt',
};
const recipientData = { name: 'Anna Alt', street: 'Hauptstr. 1', city: '12345 Berlin' };

const BUILT = {
  emailSubject: 'Rechnung {number}: Raummiete',
  emailBody: 'Sehr geehrte Frau Alt,\n\nRechnung {number} für Anna Alt.',
};

async function setTemplates(subject: string, body: string) {
  for (const [key, value] of [
    ['emailSubject', subject],
    ['emailBody', body],
  ]) {
    await prisma.systemSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }
}

beforeEach(async () => {
  await prisma.template.create({
    data: {
      type: 'RECHNUNG',
      version: 1,
      fileName: 'template.docx',
      filePath: 'templates/template.docx',
      active: true,
    },
  });
  await setTemplates(
    'Rechnung {number}: {title}',
    '{salutation},\n\nRechnung {number} für {name}.',
  );
});

async function createDraft(): Promise<number> {
  const res = await request.post('/api/invoice-draft').send({ recipientData, inputs });
  expect(res.status).toBe(201);
  return res.body.draftId;
}

async function createInvoice(): Promise<number> {
  const res = await request.post('/api/invoice').send({ recipientData, inputs });
  expect(res.status).toBe(201);
  return res.body.invoiceId;
}

function emailTextOf(body: { emailSubject: string | null; emailBody: string | null }) {
  return { emailSubject: body.emailSubject, emailBody: body.emailBody };
}

describe('email text of a draft', () => {
  it('is built from the template when the draft is first saved', async () => {
    const id = await createDraft();
    const stored = await prisma.invoiceDraft.findUniqueOrThrow({ where: { id } });
    expect(emailTextOf(stored)).toEqual(BUILT);
    expect(emailTextOf((await request.get(`/api/invoice-draft/${id}`)).body)).toEqual(BUILT);
  });

  it('stays as it is when the draft is saved again, whatever else changes', async () => {
    const id = await createDraft();
    await setTemplates('Neu {number}', 'Neue Vorlage');

    const res = await request
      .put(`/api/invoice-draft/${id}`)
      .send({ recipientData, inputs: { ...inputs, title: 'Anderer Titel', name: 'Anna Neu' } });
    expect(res.status).toBe(200);
    expect(emailTextOf((await request.get(`/api/invoice-draft/${id}`)).body)).toEqual(BUILT);
  });

  it('is replaced by the text sent with a save', async () => {
    const id = await createDraft();
    const emailText = { emailSubject: 'Mein Betreff {number}', emailBody: 'Mein Text' };

    const res = await request
      .put(`/api/invoice-draft/${id}`)
      .send({ recipientData, inputs, emailText });
    expect(res.status).toBe(200);
    expect(emailTextOf((await request.get(`/api/invoice-draft/${id}`)).body)).toEqual(emailText);
  });

  it.each([
    [{ emailSubject: '   ', emailBody: 'Text' }, 'Email subject is required'],
    [{ emailSubject: 'Zeile 1\nZeile 2', emailBody: 'Text' }, 'Invalid request body'],
    [{ emailSubject: 'x'.repeat(201), emailBody: 'Text' }, 'Invalid request body'],
    [{ emailSubject: 'Betreff', emailBody: 'x'.repeat(10_001) }, 'Invalid request body'],
    [{ emailSubject: 'Betreff' }, 'Invalid request body'],
    ['text', 'Invalid request body'],
  ])('rejects the text %j and keeps the stored one', async (emailText, error) => {
    const id = await createDraft();
    const res = await request
      .put(`/api/invoice-draft/${id}`)
      .send({ recipientData, inputs, emailText });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(error);
    expect(emailTextOf((await request.get(`/api/invoice-draft/${id}`)).body)).toEqual(BUILT);
  });

  it('is shown from the current template for a draft from before texts were stored', async () => {
    const id = await createDraft();
    await prisma.invoiceDraft.update({
      where: { id },
      data: { emailSubject: null, emailBody: null },
    });
    await setTemplates('Aktuell {number}', 'Aktueller Text für {name}');

    expect(emailTextOf((await request.get(`/api/invoice-draft/${id}`)).body)).toEqual({
      emailSubject: 'Aktuell {number}',
      emailBody: 'Aktueller Text für Anna Alt',
    });
    const stored = await prisma.invoiceDraft.findUniqueOrThrow({ where: { id } });
    expect(stored.emailSubject).toBeNull();
  });
});

describe('email text of an invoice', () => {
  it('is built from the template when the invoice is created directly', async () => {
    const id = await createInvoice();
    const stored = await prisma.invoice.findUniqueOrThrow({ where: { id } });
    expect(emailTextOf(stored)).toEqual(BUILT);
    expect(emailTextOf((await request.get(`/api/invoice/${id}`)).body)).toEqual(BUILT);
  });

  it('is taken over from the draft, edits included', async () => {
    const draftId = await createDraft();
    const emailText = { emailSubject: 'Mein Betreff {number}', emailBody: 'Mein Text' };
    await request.put(`/api/invoice-draft/${draftId}`).send({ recipientData, inputs, emailText });

    const res = await request.post(`/api/invoice-draft/${draftId}/activate`);
    expect(res.status).toBe(201);
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: res.body.invoiceId } });
    expect(emailTextOf(invoice)).toEqual(emailText);
  });

  it('is built when a draft without stored text becomes an invoice', async () => {
    const draftId = await createDraft();
    await prisma.invoiceDraft.update({
      where: { id: draftId },
      data: { emailSubject: null, emailBody: null },
    });

    const res = await request.post(`/api/invoice-draft/${draftId}/activate`);
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: res.body.invoiceId } });
    expect(emailTextOf(invoice)).toEqual(BUILT);
  });

  it('stays as it is when a new revision changes name and title', async () => {
    const id = await createInvoice();
    await setTemplates('Neu {number}', 'Neue Vorlage');

    const res = await request
      .post(`/api/invoice/${id}/revision`)
      .send({ inputs: { ...inputs, name: 'Anna Neu', title: 'Anderer Titel' } });
    expect(res.status).toBeLessThan(300);
    expect(emailTextOf((await request.get(`/api/invoice/${id}`)).body)).toEqual(BUILT);
  });

  it('is shown from the current template and the active revision when nothing is stored', async () => {
    const id = await createInvoice();
    await prisma.invoice.update({ where: { id }, data: { emailSubject: null, emailBody: null } });
    await setTemplates('Aktuell {number}', 'Aktueller Text für {name}, {title}');

    expect(emailTextOf((await request.get(`/api/invoice/${id}`)).body)).toEqual({
      emailSubject: 'Aktuell {number}',
      emailBody: 'Aktueller Text für Anna Alt, Raummiete',
    });
  });
});
```

Note: `POST /api/invoice` and the revision route start a background PDF generation that fails
without LibreOffice or a real template file; that is fine for these tests (as in
`invoice.test.ts`).

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:integration --workspace=backend -- invoiceEmailText`
Expected: FAIL — stored columns are null, DTOs lack the fields.

- [ ] **Step 3: Shared DTO fields**

In `shared/src/index.ts` add to `InvoiceDto` (after `invoiceDate`) and to `InvoiceDraftDto` (after
`inputs`):

```ts
/** Subject and text the invoice is sent with; `{number}` is filled in on sending. */
emailSubject: string;
emailBody: string;
```

- [ ] **Step 4: Parsers**

In `backend/src/services/requestParsing.ts`: add `InvoiceEmailText` to the `'shared'` type import
and `MAX_EMAIL_BODY_LENGTH, MAX_EMAIL_SUBJECT_LENGTH` via
`import { … } from '../../../shared/src/invoiceEmailText.js';`, then add:

```ts
/** Subject and text of an invoice email as edited by the user. */
export function parseEmailText(raw: unknown): Parsed<InvoiceEmailText> {
  return attempt(() => {
    if (!isRecord(raw)) throw new BodyError(INVALID_BODY);
    const emailSubject = text(raw, 'emailSubject');
    const emailBody = text(raw, 'emailBody');
    if (
      /[\r\n]/.test(emailSubject) ||
      emailSubject.length > MAX_EMAIL_SUBJECT_LENGTH ||
      emailBody.length > MAX_EMAIL_BODY_LENGTH
    ) {
      throw new BodyError(INVALID_BODY);
    }
    if (!emailSubject.trim()) throw new BodyError('Email subject is required');
    return { emailSubject, emailBody };
  });
}
```

and change `parseDraftBody` to:

```ts
/** POST/PUT /api/invoice-draft: only the name is required; an edited email text is optional. */
export function parseDraftBody(
  raw: unknown,
): Parsed<RecipientSelection & { inputs: InvoiceContent; emailText?: InvoiceEmailText }> {
  return attempt(() => {
    if (!isRecord(raw) || !isRecord(raw.inputs)) throw new BodyError(INVALID_BODY);
    const name = raw.inputs.name;
    if (typeof name !== 'string' || !name.trim()) throw new BodyError('Name is required');
    const body = { ...recipientSelection(raw), inputs: invoiceContent(raw.inputs, false) };
    if (raw.emailText === undefined) return body;
    const emailText = parseEmailText(raw.emailText);
    if ('error' in emailText) throw new BodyError(emailText.error);
    return { ...body, emailText: emailText.value };
  });
}
```

- [ ] **Step 5: Store the text with a new invoice**

In `backend/src/services/invoiceCreation.ts`: import `InvoiceEmailText` (type, from `'shared'`) and
`buildInvoiceEmailText` from `./invoiceEmailText.js`; change `createInvoiceWithFirstRevision`:

```ts
export async function createInvoiceWithFirstRevision(
  tx: Prisma.TransactionClient,
  params: {
    recipientId: number;
    inputs: InvoiceContent;
    invoiceDate: Date;
    templateId: number;
    /** The draft's text when a draft becomes an invoice; built from the template otherwise. */
    emailText?: InvoiceEmailText;
  },
) {
  const { recipientId, inputs, invoiceDate, templateId } = params;
  const { number, year, runningNumber } = await generateInvoiceNumber(tx);
  const emailText =
    params.emailText ?? buildInvoiceEmailText(await tx.systemSetting.findMany(), inputs);

  const invoice = await tx.invoice.create({
    data: { number, year, runningNumber, recipientId, invoiceDate, ...emailText },
  });
```

(the rest of the function is unchanged).

- [ ] **Step 6: Draft routes**

In `backend/src/routes/invoiceDraft.ts` import
`buildInvoiceEmailText, storedOrBuiltEmailText` from `../services/invoiceEmailText.js`, then:

- `POST /`: inside the transaction, build and store the text:

```ts
const recipientId = await saveRecipient(tx, body, body.inputs);
const emailText = buildInvoiceEmailText(await tx.systemSetting.findMany(), body.inputs);
return tx.invoiceDraft.create({
  data: { recipientId, ...contentToDraftData(body.inputs), ...emailText },
});
```

- `PUT /:id`: keep the stored text unless the request carries one:

```ts
        data: { recipientId, ...contentToDraftData(body.inputs), ...(body.emailText ?? {}) },
```

- `GET /:id`: add to the DTO, after `inputs`:

```ts
    ...storedOrBuiltEmailText(draft, await prisma.systemSetting.findMany(), draft),
```

- `POST /:id/activate`: inside the transaction, pass the draft's text on:

```ts
const emailText = storedOrBuiltEmailText(draft, await tx.systemSetting.findMany(), draft);
const { invoice, revision } = await createInvoiceWithFirstRevision(tx, {
  recipientId: draft.recipientId,
  inputs,
  invoiceDate: todayAsInvoiceDate(),
  templateId: invoiceTemplate.id,
  emailText,
});
```

- [ ] **Step 7: Invoice detail**

In `backend/src/routes/invoice.ts`, `GET /:id`: import `storedOrBuiltEmailText` and add after
`invoiceDate: …`:

```ts
    // Invoices from before texts were stored show what the template gives for the current revision
    ...storedOrBuiltEmailText(
      invoice,
      await prisma.systemSetting.findMany(),
      activeRevision ?? invoice.revisions[0] ?? { emailSalutation: '', name: '', title: '', email: '' },
    ),
```

- [ ] **Step 8: Fix frontend fixtures**

Run `npm run typecheck`. In every reported `InvoiceDto` / `InvoiceDraftDto` literal in
`frontend/src/__tests__/` (at least `makeInvoice()` in `InvoiceDetailView.test.ts` and `draftDto`
in `InvoiceFormView.test.ts`) add:

```ts
    emailSubject: 'Ihre Rechnung {number}',
    emailBody: 'Hallo\n\nanbei Ihre Rechnung {number}.',
```

If `backend/src/__tests__/integration/invoiceDraft.test.ts` or `invoice.test.ts` compare a whole
DTO with `toEqual`, extend the expectation by the two fields instead of loosening it.

- [ ] **Step 9: Verify and commit**

Run: `npm run test:integration --workspace=backend -- invoiceEmailText` — Expected: PASS.
Run: `npm run lint && npm run test:unit && npm run test:integration` — Expected: PASS.

```bash
git add shared backend frontend/src/__tests__
git commit -m "feat: store the email text with drafts and invoices" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Edit the text of an invoice, build a fresh text on request

**Files:**

- Modify: `backend/src/services/requestParsing.ts`, `backend/src/routes/invoice.ts`,
  `backend/src/routes/emailSettings.ts`
- Test: `backend/src/__tests__/integration/invoiceEmailText.test.ts` (append)

**Interfaces:**

- Consumes: `parseEmailText`, `buildInvoiceEmailText`, shared types.
- Produces: `PATCH /api/invoice/:id/email-text` (`InvoiceEmailText` → `InvoiceEmailText`);
  `POST /api/email-settings/invoice-text` (`EmailTextValues` → `InvoiceEmailText`);
  `parseEmailTextValues(raw: unknown): Parsed<EmailTextValues>`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/src/__tests__/integration/invoiceEmailText.test.ts`:

```ts
describe('PATCH /api/invoice/:id/email-text', () => {
  const edited = { emailSubject: 'Mein Betreff {number}', emailBody: 'Mein Text' };

  it('stores the edited text', async () => {
    const id = await createInvoice();
    const res = await request.patch(`/api/invoice/${id}/email-text`).send(edited);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(edited);
    expect(emailTextOf((await request.get(`/api/invoice/${id}`)).body)).toEqual(edited);
  });

  it.each([
    [{ emailSubject: ' ', emailBody: 'Text' }, 'Email subject is required'],
    [{ emailSubject: 'A\nB', emailBody: 'Text' }, 'Invalid request body'],
    [{ emailSubject: 'Betreff' }, 'Invalid request body'],
  ])('rejects %j', async (body, error) => {
    const id = await createInvoice();
    const res = await request.patch(`/api/invoice/${id}/email-text`).send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(error);
    expect(emailTextOf((await request.get(`/api/invoice/${id}`)).body)).toEqual(BUILT);
  });

  it('refuses a cancelled invoice', async () => {
    const id = await createInvoice();
    await request.patch(`/api/invoice/${id}/cancel`);
    const res = await request.patch(`/api/invoice/${id}/email-text`).send(edited);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Cancelled invoices cannot be changed');
    expect(emailTextOf((await request.get(`/api/invoice/${id}`)).body)).toEqual(BUILT);
  });

  it('answers 404 for an unknown invoice and 400 for an invalid id', async () => {
    expect((await request.patch('/api/invoice/99999/email-text').send(edited)).status).toBe(404);
    expect((await request.patch('/api/invoice/abc/email-text').send(edited)).status).toBe(400);
  });
});

describe('POST /api/email-settings/invoice-text', () => {
  const values = {
    emailSalutation: 'Hallo Bernd',
    name: 'Bernd Bach',
    title: 'Kursgebühr',
    email: 'bernd@example.org',
  };

  it('builds the text from the template without storing anything', async () => {
    const res = await request.post('/api/email-settings/invoice-text').send(values);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      emailSubject: 'Rechnung {number}: Kursgebühr',
      emailBody: 'Hallo Bernd,\n\nRechnung {number} für Bernd Bach.',
    });
    expect(await prisma.invoice.count()).toBe(0);
    expect(await prisma.invoiceDraft.count()).toBe(0);
  });

  it.each([{}, { ...values, name: 5 }, 'text'])('rejects %j', async (body) => {
    const res = await request.post('/api/email-settings/invoice-text').send(body as object);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid request body');
  });
});
```

Run: `npm run test:integration --workspace=backend -- invoiceEmailText` — Expected: the new tests
FAIL with 404.

- [ ] **Step 2: Parser for the values**

In `backend/src/services/requestParsing.ts` add `EmailTextValues` to the `'shared'` type import
and:

```ts
/** POST /api/email-settings/invoice-text: what the template placeholders are filled with. */
export function parseEmailTextValues(raw: unknown): Parsed<EmailTextValues> {
  return attempt(() => {
    if (!isRecord(raw)) throw new BodyError(INVALID_BODY);
    return {
      emailSalutation: text(raw, 'emailSalutation'),
      name: text(raw, 'name'),
      title: text(raw, 'title'),
      email: text(raw, 'email'),
    };
  });
}
```

- [ ] **Step 3: Routes**

In `backend/src/routes/invoice.ts` (import `parseEmailText`), after the `PATCH /:id/paid` handler:

```ts
// PATCH /api/invoice/:id/email-text
invoiceRouter.patch('/:id/email-text', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid ID' });
    return;
  }
  const parsed = parseEmailText(req.body);
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) {
    res.status(404).json({ error: 'Invoice not found' });
    return;
  }
  if (invoice.status !== 'AKTIV') {
    res.status(400).json({ error: 'Cancelled invoices cannot be changed' });
    return;
  }

  await prisma.invoice.update({ where: { id }, data: parsed.value });
  res.json(parsed.value);
});
```

In `backend/src/routes/emailSettings.ts` (import `parseEmailTextValues` and
`buildInvoiceEmailText` from `../services/invoiceEmailText.js`):

```ts
// POST /api/email-settings/invoice-text — the text the template gives for these values; stores nothing
emailSettingsRouter.post('/invoice-text', async (req, res) => {
  const parsed = parseEmailTextValues(req.body);
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  res.json(buildInvoiceEmailText(await prisma.systemSetting.findMany(), parsed.value));
});
```

- [ ] **Step 4: Verify and commit**

Run: `npm run test:integration --workspace=backend -- invoiceEmailText` — Expected: PASS.
Run: `npm run lint && npm run test:unit && npm run test:integration` — Expected: PASS.

```bash
git add backend
git commit -m "feat: edit an invoice's email text and rebuild it from the template" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Draft preview PDF with watermark

**Files:**

- Create: `backend/src/services/pdfWatermark.ts`, `backend/src/services/invoicePreview.ts`
- Modify: `backend/src/routes/invoiceDraft.ts`
- Test: `backend/src/__tests__/unit/pdfWatermark.test.ts`,
  `backend/src/__tests__/unit/invoicePreview.test.ts`,
  `backend/src/__tests__/integration/invoiceDraftPreview.test.ts` (all new)

**Interfaces:**

- Consumes: `buildInvoiceDocx`, `docxToPdf` from `services/pdfGeneration.ts`; `toAbsolutePath`
  from `config.ts`; `draftToContent`, `todayAsInvoiceDate`, `parseId` in the draft router.
- Produces: `addWatermark(pdf: Buffer, text: string): Promise<Buffer>`;
  `PREVIEW_LABEL = 'Preview'`;
  `createInvoicePreview(deps: { convert: (docx: Buffer) => Promise<Buffer>; readTemplate:
(storedPath: string) => Promise<Buffer> }): (templatePath: string, content: InvoiceContent,
today: Date) => Promise<Buffer>`; `generateInvoicePreview` (the real one);
  `GET /api/invoice-draft/:id/preview`.

- [ ] **Step 1: Write the failing watermark test**

`backend/src/__tests__/unit/pdfWatermark.test.ts`:

```ts
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { addWatermark } from '../../services/pdfWatermark';

/** "Preview" as pdf-lib writes it into a content stream (hex string of the characters). */
const PREVIEW_HEX = Buffer.from('Preview', 'latin1').toString('hex');

async function twoPages(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]).drawText('Seite 1');
  doc.addPage([842, 595]).drawText('Seite 2');
  return Buffer.from(await doc.save());
}

/** The decoded drawing instructions of every page. */
async function pageContents(pdf: Buffer): Promise<string[]> {
  const doc = await PDFDocument.load(pdf);
  return doc.getPages().map((page) => {
    const contents = page.node.Contents();
    const streams =
      contents instanceof PDFArray
        ? contents.asArray().map((ref) => doc.context.lookup(ref))
        : [contents];
    return streams
      .map((stream) =>
        stream instanceof PDFRawStream
          ? Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1')
          : '',
      )
      .join('\n');
  });
}

describe('addWatermark', () => {
  it('draws the text on every page and keeps the pages', async () => {
    const original = await twoPages();
    expect((await pageContents(original)).some((page) => page.includes(PREVIEW_HEX))).toBe(false);

    const marked = await pageContents(await addWatermark(original, 'Preview'));

    expect(marked).toHaveLength(2);
    expect(marked.every((page) => page.includes(PREVIEW_HEX))).toBe(true);
    expect(marked[0]).toContain(Buffer.from('Seite 1', 'latin1').toString('hex'));
  });

  it('draws it half transparent, in grey and rotated', async () => {
    const [page] = await pageContents(await addWatermark(await twoPages(), 'Preview'));
    const watermark = page.slice(page.lastIndexOf('BT', page.indexOf(PREVIEW_HEX)) - 40);
    expect(watermark).toMatch(/\/GS-\d+ gs/); // an opacity state
    expect(watermark).toContain('0.6 0.6 0.6 rg');
    expect(watermark).toMatch(/0\.7071\d* 0\.7071\d* -0\.7071\d* 0\.7071\d* [\d.]+ [\d.]+ Tm/);
  });
});
```

Run: `npm run test:unit --workspace=backend -- pdfWatermark` — Expected: FAIL (module missing).

- [ ] **Step 2: Implement the watermark**

`backend/src/services/pdfWatermark.ts`:

```ts
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';

const ANGLE = Math.PI / 4;

/**
 * Draws `text` across every page: centred, rotated 45°, light grey and half transparent, about
 * 60 % of the page diagonal wide. The page content stays untouched below it.
 */
export async function addWatermark(pdf: Buffer, text: string): Promise<Buffer> {
  const doc = await PDFDocument.load(pdf);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);

  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    const size = (0.6 * Math.hypot(width, height)) / font.widthOfTextAtSize(text, 1);
    const textWidth = font.widthOfTextAtSize(text, size);
    const textHeight = font.heightAtSize(size, { descender: false });
    // drawText rotates around the start of the text: shift it so the text's centre is the page's
    const x = width / 2 - (textWidth / 2) * Math.cos(ANGLE) + (textHeight / 2) * Math.sin(ANGLE);
    const y = height / 2 - (textWidth / 2) * Math.sin(ANGLE) - (textHeight / 2) * Math.cos(ANGLE);
    page.drawText(text, {
      x,
      y,
      size,
      font,
      color: rgb(0.6, 0.6, 0.6),
      opacity: 0.35,
      rotate: degrees(45),
    });
  }
  return Buffer.from(await doc.save());
}
```

Run: `npm run test:unit --workspace=backend -- pdfWatermark` — Expected: PASS.

- [ ] **Step 3: Write the failing preview service test**

`backend/src/__tests__/unit/invoicePreview.test.ts`:

```ts
import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import PizZip from 'pizzip';
import type { InvoiceContent } from 'shared';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { createInvoicePreview } from '../../services/invoicePreview';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.resolve(__dirname, '../../../../e2e/fixture/Rechnung.docx');

const content: InvoiceContent = {
  salutation: 'Frau',
  name: 'Anna Alt',
  street: 'Hauptstr. 1',
  city: '12345 Berlin',
  title: 'Raummiete',
  lineItems: [{ text: 'Raummiete Oktober', priceInCents: 10000 }],
  vat: 19,
  directDebit: false,
  email: 'anna@example.org',
  emailSalutation: 'Hallo',
};

async function onePagePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]);
  return Buffer.from(await doc.save());
}

/** A preview generator whose "LibreOffice" keeps the DOCX it was given. */
function previewWithFakeConverter() {
  const seen: { docx: Buffer | null; templatePath: string | null } = {
    docx: null,
    templatePath: null,
  };
  const generate = createInvoicePreview({
    convert: async (docx) => {
      seen.docx = docx;
      return onePagePdf();
    },
    readTemplate: async (storedPath) => {
      seen.templatePath = storedPath;
      return fs.promises.readFile(templatePath);
    },
  });
  return { generate, seen };
}

function textOf(docx: Buffer): string {
  return new PizZip(docx)
    .file('word/document.xml')!
    .asText()
    .replace(/<[^>]+>/g, '');
}

describe('invoice preview', () => {
  it('fills the template with the draft, today and "Preview" as the number', async () => {
    const { generate, seen } = previewWithFakeConverter();

    const pdf = await generate('templates/t.docx', content, new Date('2026-10-12T12:00:00Z'));

    expect(seen.templatePath).toBe('templates/t.docx');
    const text = textOf(seen.docx!);
    expect(text).toContain('Anna Alt');
    expect(text).toContain('Raummiete Oktober');
    expect(text).toContain('Preview');
    expect(text).toContain('12.10.2026');
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
    expect(pdf.length).toBeGreaterThan((await onePagePdf()).length); // the watermark was added
  });

  it('also previews a draft that only has a name', async () => {
    const { generate } = previewWithFakeConverter();
    const incomplete: InvoiceContent = {
      ...content,
      street: '',
      city: '',
      title: '',
      lineItems: [{ text: '', priceInCents: 0 }],
      email: '',
      emailSalutation: '',
    };
    const pdf = await generate('templates/t.docx', incomplete, new Date('2026-10-12T12:00:00Z'));
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
  });

  it('passes a failed conversion on', async () => {
    const generate = createInvoicePreview({
      convert: async () => {
        throw new Error('libreoffice crashed');
      },
      readTemplate: async () => fs.promises.readFile(templatePath),
    });
    await expect(generate('templates/t.docx', content, new Date())).rejects.toThrow(
      'libreoffice crashed',
    );
  });
});
```

Run: `npm run test:unit --workspace=backend -- invoicePreview` — Expected: FAIL (module missing).

- [ ] **Step 4: Implement the preview service**

`backend/src/services/invoicePreview.ts`:

```ts
import fs from 'fs';
import type { InvoiceContent } from 'shared';
import { toAbsolutePath } from '../config.js';
import { buildInvoiceDocx, docxToPdf } from './pdfGeneration.js';
import { addWatermark } from './pdfWatermark.js';

/** Stands where the invoice number will be, and across every page as the watermark. */
export const PREVIEW_LABEL = 'Preview';

/**
 * Builds "show this draft as it would look as an invoice". The PDF is only returned: no invoice
 * number is taken and nothing is written to the data directory.
 */
export function createInvoicePreview(deps: {
  convert: (docx: Buffer) => Promise<Buffer>;
  readTemplate: (storedPath: string) => Promise<Buffer>;
}): (templatePath: string, content: InvoiceContent, today: Date) => Promise<Buffer> {
  return async (templatePath, content, today) => {
    const docx = buildInvoiceDocx(await deps.readTemplate(templatePath), {
      salutation: content.salutation,
      name: content.name,
      street: content.street,
      city: content.city,
      invoiceDate: today,
      title: content.title,
      invoiceNumber: PREVIEW_LABEL,
      vat: content.vat,
      emailSalutation: content.emailSalutation,
      directDebit: content.directDebit,
      lineItems: content.lineItems,
    });
    return addWatermark(await deps.convert(docx), PREVIEW_LABEL);
  };
}

export const generateInvoicePreview = createInvoicePreview({
  convert: docxToPdf,
  readTemplate: (storedPath) => fs.promises.readFile(toAbsolutePath(storedPath)),
});
```

Run: `npm run test:unit --workspace=backend -- invoicePreview` — Expected: PASS.

- [ ] **Step 5: Write the failing route test**

`backend/src/__tests__/integration/invoiceDraftPreview.test.ts`:

```ts
import supertest from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// LibreOffice is not part of these tests: the route is checked against a stand-in generator
const { previewMock } = vi.hoisted(() => ({ previewMock: vi.fn() }));
vi.mock('../../services/invoicePreview', () => ({ generateInvoicePreview: previewMock }));

import { createApp } from '../../app';
import { initializeApp } from '../../init';
import { prisma } from '../../prismaClient';
import { useCleanDatabase } from './helpers';

let request: ReturnType<typeof supertest>;

beforeAll(async () => {
  await initializeApp();
  request = supertest(createApp());
});

useCleanDatabase();

const PDF = Buffer.from('%PDF-1.7 preview');

function binary(
  res: NodeJS.ReadableStream,
  callback: (err: Error | null, body: Buffer) => void,
): void {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

const inputs = {
  salutation: 'Frau',
  name: 'Anna Alt',
  street: 'Hauptstr. 1',
  city: '12345 Berlin',
  title: 'Raummiete',
  lineItems: [{ text: 'Raummiete Oktober', priceInCents: 10000 }],
  vat: 19,
  directDebit: false,
  email: 'anna@example.org',
  emailSalutation: 'Hallo',
};

async function seedTemplate() {
  await prisma.template.create({
    data: {
      type: 'RECHNUNG',
      version: 1,
      fileName: 'template.docx',
      filePath: 'templates/template.docx',
      active: true,
    },
  });
}

async function createDraft(): Promise<number> {
  const res = await request.post('/api/invoice-draft').send({
    recipientData: { name: 'Anna Alt', street: 'Hauptstr. 1', city: '12345 Berlin' },
    inputs,
  });
  return res.body.draftId;
}

beforeEach(() => {
  previewMock.mockReset().mockResolvedValue(PDF);
});

describe('GET /api/invoice-draft/:id/preview', () => {
  it('answers the preview PDF of the saved draft', async () => {
    await seedTemplate();
    const id = await createDraft();

    const res = await request.get(`/api/invoice-draft/${id}/preview`).buffer(true).parse(binary);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe('inline; filename="invoice-preview.pdf"');
    expect((res.body as Buffer).equals(PDF)).toBe(true);
    expect(previewMock).toHaveBeenCalledWith('templates/template.docx', inputs, expect.any(Date));
  });

  it('takes no invoice number and keeps the draft', async () => {
    await seedTemplate();
    const id = await createDraft();
    await request.get(`/api/invoice-draft/${id}/preview`);

    expect(await prisma.invoice.count()).toBe(0);
    expect(await prisma.invoiceRevision.count()).toBe(0);
    expect(await prisma.invoiceDraft.count()).toBe(1);
  });

  it('answers 400 without an active invoice template', async () => {
    const id = await createDraft();
    const res = await request.get(`/api/invoice-draft/${id}/preview`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('No active invoice template found');
    expect(previewMock).not.toHaveBeenCalled();
  });

  it('answers 500 with a plain message when the PDF cannot be generated', async () => {
    await seedTemplate();
    const id = await createDraft();
    previewMock.mockRejectedValue(new Error('libreoffice: secret path /app/data'));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request.get(`/api/invoice-draft/${id}/preview`);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Preview could not be generated' });
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it('answers 404 for a missing draft and 400 for an invalid id', async () => {
    expect((await request.get('/api/invoice-draft/99999/preview')).status).toBe(404);
    expect((await request.get('/api/invoice-draft/abc/preview')).status).toBe(400);
  });
});
```

Run: `npm run test:integration --workspace=backend -- invoiceDraftPreview` — Expected: FAIL (404).

- [ ] **Step 6: Route**

In `backend/src/routes/invoiceDraft.ts` import
`{ generateInvoicePreview } from '../services/invoicePreview.js'` and add after `GET /:id`:

```ts
// GET /api/invoice-draft/:id/preview — the saved draft as a watermarked PDF; stores nothing
invoiceDraftRouter.get('/:id/preview', async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: 'Invalid ID' });
    return;
  }
  const draft = await prisma.invoiceDraft.findUnique({ where: { id } });
  if (!draft) {
    res.status(404).json({ error: 'Draft not found' });
    return;
  }
  const invoiceTemplate = await prisma.template.findFirst({
    where: { type: 'RECHNUNG', active: true },
  });
  if (!invoiceTemplate) {
    res.status(400).json({ error: 'No active invoice template found' });
    return;
  }

  let pdf: Buffer;
  try {
    pdf = await generateInvoicePreview(
      invoiceTemplate.filePath,
      draftToContent(draft),
      todayAsInvoiceDate(),
    );
  } catch (error) {
    console.error(`[invoice-draft] Preview generation failed for draft ${id}`, error);
    res.status(500).json({ error: 'Preview could not be generated' });
    return;
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="invoice-preview.pdf"');
  res.send(pdf);
});
```

- [ ] **Step 7: Verify and commit**

Run: `npm run test:integration --workspace=backend -- invoiceDraftPreview` — Expected: PASS.
Run: `npm run lint && npm run test:unit && npm run test:integration` — Expected: PASS.

```bash
git add backend
git commit -m "feat: preview a draft as a watermarked pdf" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The email text editor component

**Files:**

- Create: `frontend/src/components/InvoiceEmailText.vue`
- Test: `frontend/src/__tests__/InvoiceEmailText.test.ts`

**Interfaces:**

- Consumes: `POST /api/email-settings/invoice-text`; `EmailTextValues`, `InvoiceEmailText`
  (shared); `requestJson`; `useNotify`.
- Produces: `<InvoiceEmailText v-model:subject v-model:body v-model:invalid :source :disabled />`
  with test ids `email-subject`, `email-body`, `error-email-subject`, `reset-email-text`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/__tests__/InvoiceEmailText.test.ts`:

```ts
import { flushPromises, mount } from '@vue/test-utils';
import type { EmailTextValues } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';
import InvoiceEmailText from '../components/InvoiceEmailText.vue';
import { withPrimeVue } from './helpers/primeVue';

const { notify } = vi.hoisted(() => ({
  notify: { success: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../composables/useNotify', () => ({ useNotify: () => notify }));

const source: EmailTextValues & { street: string } = {
  emailSalutation: 'Hallo Anna',
  name: 'Anna Alt',
  title: 'Raummiete',
  email: 'anna@example.org',
  street: 'not part of the request',
};

let reply: { status: number; body?: unknown };
const fetchMock = vi.fn(async () => ({
  ok: reply.status < 400,
  status: reply.status,
  json: () => Promise.resolve(reply.body),
}));

/** A parent that holds the three models, as the form and the invoice page do. */
function mountEditor(options: { subject?: string; body?: string; disabled?: boolean } = {}) {
  const subject = ref(options.subject ?? 'Rechnung {number}');
  const body = ref(options.body ?? 'Hallo,\n\nanbei.');
  const invalid = ref(false);
  const Parent = defineComponent({
    setup: () => () =>
      h(InvoiceEmailText, {
        subject: subject.value,
        'onUpdate:subject': (value: string) => (subject.value = value),
        body: body.value,
        'onUpdate:body': (value: string) => (body.value = value),
        invalid: invalid.value,
        'onUpdate:invalid': (value: boolean) => (invalid.value = value),
        source,
        disabled: options.disabled ?? false,
      }),
  });
  const wrapper = mount(Parent, { attachTo: document.body, global: withPrimeVue() });
  return { wrapper, subject, body, invalid };
}

beforeEach(() => {
  reply = { status: 200, body: { emailSubject: 'Neu {number}', emailBody: 'Neuer Text' } };
  fetchMock.mockClear();
  Object.values(notify).forEach((fn) => fn.mockReset());
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('InvoiceEmailText', () => {
  it('shows subject and text and passes edits on', async () => {
    const { wrapper, subject, body } = mountEditor();
    const subjectInput = wrapper.find('[data-testid="email-subject"]');
    const bodyInput = wrapper.find('[data-testid="email-body"]');
    expect((subjectInput.element as HTMLInputElement).value).toBe('Rechnung {number}');
    expect((bodyInput.element as HTMLTextAreaElement).value).toBe('Hallo,\n\nanbei.');

    await subjectInput.setValue('Mein Betreff');
    await bodyInput.setValue('Mein Text');
    expect(subject.value).toBe('Mein Betreff');
    expect(body.value).toBe('Mein Text');
  });

  it('says that {number} is filled in when the email is sent', () => {
    const { wrapper } = mountEditor();
    expect(wrapper.text()).toContain(
      '{number} is replaced by the invoice number when the email is sent.',
    );
  });

  it('reports a blank subject', async () => {
    const { wrapper, invalid } = mountEditor();
    expect(invalid.value).toBe(false);
    expect(wrapper.find('[data-testid="error-email-subject"]').exists()).toBe(false);

    await wrapper.find('[data-testid="email-subject"]').setValue('   ');
    await flushPromises();
    expect(invalid.value).toBe(true);
    expect(wrapper.find('[data-testid="error-email-subject"]').text()).toBe(
      'Email subject is required',
    );
  });

  it('resets both fields from the template, built from the given values', async () => {
    const { wrapper, subject, body } = mountEditor();

    await wrapper.find('[data-testid="reset-email-text"]').trigger('click');
    await flushPromises();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/email-settings/invoice-text');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      emailSalutation: 'Hallo Anna',
      name: 'Anna Alt',
      title: 'Raummiete',
      email: 'anna@example.org',
    });
    expect(subject.value).toBe('Neu {number}');
    expect(body.value).toBe('Neuer Text');
  });

  it('keeps the fields and says so when the reset fails', async () => {
    reply = { status: 500, body: {} };
    const { wrapper, subject, body } = mountEditor();

    await wrapper.find('[data-testid="reset-email-text"]').trigger('click');
    await flushPromises();

    expect(notify.error).toHaveBeenCalledWith('Email text could not be loaded from the template');
    expect(subject.value).toBe('Rechnung {number}');
    expect(body.value).toBe('Hallo,\n\nanbei.');
  });

  it('is read-only when disabled', () => {
    const { wrapper } = mountEditor({ disabled: true });
    expect(wrapper.find('[data-testid="email-subject"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="email-body"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="reset-email-text"]').exists()).toBe(false);
  });
});
```

Run: `npm run test:unit --workspace=frontend -- InvoiceEmailText` — Expected: FAIL (component
missing).

- [ ] **Step 2: Implement the component**

`frontend/src/components/InvoiceEmailText.vue`:

```vue
<script setup lang="ts">
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Textarea from 'primevue/textarea';
import {
  MAX_EMAIL_BODY_LENGTH,
  MAX_EMAIL_SUBJECT_LENGTH,
  type EmailTextValues,
  type InvoiceEmailText,
} from 'shared';
import { computed, ref, watchEffect } from 'vue';
import { useNotify } from '../composables/useNotify';
import { requestJson } from '../utils/requestJson';

const props = defineProps<{
  /** What "Reset from template" fills the placeholders with. */
  source: EmailTextValues;
  disabled?: boolean;
}>();
const subject = defineModel<string>('subject', { required: true });
const body = defineModel<string>('body', { required: true });
/** True while the text cannot be saved (blank subject). */
const invalid = defineModel<boolean>('invalid', { default: false });

const RESET_FAILED = 'Email text could not be loaded from the template';

const notify = useNotify();
const resetting = ref(false);
const subjectMissing = computed(() => subject.value.trim() === '');
watchEffect(() => {
  invalid.value = subjectMissing.value;
});

/** Builds the text anew from the template; the surrounding form or card saves it. */
async function resetFromTemplate() {
  resetting.value = true;
  try {
    const { emailSalutation, name, title, email } = props.source;
    const res = await requestJson('/api/email-settings/invoice-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailSalutation, name, title, email }),
    });
    if (!res.ok) {
      notify.error(RESET_FAILED);
      return;
    }
    const text = res.body as unknown as InvoiceEmailText;
    subject.value = text.emailSubject;
    body.value = text.emailBody;
  } catch {
    notify.error(RESET_FAILED);
  } finally {
    resetting.value = false;
  }
}
</script>

<template>
  <div class="stack">
    <div class="field">
      <label for="invoice-email-subject">Email Subject</label>
      <InputText
        id="invoice-email-subject"
        v-model="subject"
        :disabled="disabled"
        :invalid="subjectMissing"
        :maxlength="MAX_EMAIL_SUBJECT_LENGTH"
        fluid
        data-testid="email-subject"
      />
      <Message
        v-if="subjectMissing"
        severity="error"
        size="small"
        variant="simple"
        data-testid="error-email-subject"
      >
        Email subject is required
      </Message>
    </div>
    <div class="field">
      <label for="invoice-email-body">Email Text</label>
      <Textarea
        id="invoice-email-body"
        v-model="body"
        :disabled="disabled"
        :maxlength="MAX_EMAIL_BODY_LENGTH"
        rows="8"
        fluid
        data-testid="email-body"
      />
      <small class="muted">
        {number} is replaced by the invoice number when the email is sent.
      </small>
    </div>
    <div v-if="!disabled" class="row">
      <Button
        label="Reset from template"
        icon="pi pi-refresh"
        severity="secondary"
        outlined
        :loading="resetting"
        data-testid="reset-email-text"
        @click="resetFromTemplate"
      />
    </div>
  </div>
</template>
```

- [ ] **Step 3: Verify and commit**

Run: `npm run test:unit --workspace=frontend -- InvoiceEmailText` — Expected: PASS, no Vue
warnings in the output.
Run: `npm run lint && npm run test:unit && npm run test:integration` — Expected: PASS.

```bash
git add frontend/src
git commit -m "feat: add an editor for the invoice email text" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Draft form and draft list

**Files:**

- Modify: `frontend/src/views/InvoiceFormView.vue`, `frontend/src/views/InvoiceView.vue`
- Test: `frontend/src/__tests__/InvoiceFormView.test.ts`, `frontend/src/__tests__/InvoiceView.test.ts`

**Interfaces:**

- Consumes: Task 5 component; `InvoiceDraftDto.emailSubject/emailBody` (Task 2); `PUT
/api/invoice-draft/:id` with `emailText` (Task 2); `GET /api/invoice-draft/:id/preview` (Task 4).
- Produces: test ids `preview-draft` (form button and list row button).

- [ ] **Step 1: Write the failing form tests**

In `frontend/src/__tests__/InvoiceFormView.test.ts`, inside
`describe('InvoiceFormView — draft mode', …)` (it mounts the form for draft 42 with
`replies['GET /api/invoice-draft/42']` answering `draftDto`; reuse its existing setup and helpers
`mountForm`, `bodyOf`, `calls`), add:

```ts
it('shows the stored email text of a saved draft and sends edits with the save', async () => {
  replies['PUT /api/invoice-draft/42'] = { status: 200, body: { draftId: 42 } };
  const wrapper = await mountForm();
  const subject = wrapper.find('[data-testid="email-subject"]');
  expect((subject.element as HTMLInputElement).value).toBe(draftDto.emailSubject);

  await subject.setValue('Mein Betreff {number}');
  await wrapper.find('[data-testid="email-body"]').setValue('Mein Text');
  await wrapper.find('form').trigger('submit');
  await flushPromises();

  expect(bodyOf('PUT /api/invoice-draft/42').emailText).toEqual({
    emailSubject: 'Mein Betreff {number}',
    emailBody: 'Mein Text',
  });
});

it('counts an edited email text as unsaved changes', async () => {
  const wrapper = await mountForm();
  confirmAction.mockResolvedValue(false);
  expect(await tryLeave()).toBe(true);

  await wrapper.find('[data-testid="email-body"]').setValue('Geändert');
  expect(await tryLeave()).toBe(false);
});

it('does not save a draft whose email subject is blank', async () => {
  const wrapper = await mountForm();
  await wrapper.find('[data-testid="email-subject"]').setValue(' ');
  await flushPromises();
  await wrapper.find('form').trigger('submit');
  await flushPromises();
  expect(calls()).not.toContain('PUT /api/invoice-draft/42');
});

it('opens the preview of the saved draft in a new tab', async () => {
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  const wrapper = await mountForm();

  await wrapper.find('[data-testid="preview-draft"]').trigger('click');

  expect(open).toHaveBeenCalledWith('/api/invoice-draft/42/preview', '_blank');
  open.mockRestore();
});

it('locks the preview while the form has unsaved changes', async () => {
  const wrapper = await mountForm();
  const preview = () => wrapper.find('[data-testid="preview-draft"]');
  expect(preview().attributes('disabled')).toBeUndefined();

  vm(wrapper).inputs.title = 'Neuer Titel';
  await flushPromises();

  expect(preview().attributes('disabled')).toBeDefined();
  expect(preview().attributes('title')).toBe('Save the draft to preview it');
});
```

And in the first `describe` of the file (the "new invoice" mode), add:

```ts
it('shows neither the email text nor a preview for a new invoice', async () => {
  const wrapper = await mountForm();
  expect(wrapper.find('[data-testid="email-subject"]').exists()).toBe(false);
  expect(wrapper.find('[data-testid="preview-draft"]').exists()).toBe(false);
});
```

If a helper in this file has a different name or signature than used above (e.g. how draft mode is
set up or how the leave guard is run), keep the assertions and adapt the calls to the file's
helpers.

In `frontend/src/__tests__/InvoiceView.test.ts`, inside `describe('InvoiceView', …)`:

```ts
it('opens the preview of a draft from the list without opening the draft', async () => {
  drafts = [
    {
      id: 9,
      recipientName: 'Dora Draft',
      title: 'Kurs',
      amountCents: 5950,
      updatedAt: '2026-10-01T10:00:00Z',
    },
  ];
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  const wrapper = await mountView();

  await wrapper.find('[data-testid="preview-draft"]').trigger('click');

  expect(open).toHaveBeenCalledWith('/api/invoice-draft/9/preview', '_blank');
  expect(push).not.toHaveBeenCalled();
  open.mockRestore();
});
```

Run: `npm run test:unit --workspace=frontend -- InvoiceFormView InvoiceView`
Expected: the new tests FAIL (elements not found).

- [ ] **Step 2: Draft form**

In `frontend/src/views/InvoiceFormView.vue`:

Script:

- add `InvoiceEmailText` to the `shared` type import and
  `import InvoiceEmailTextEditor from '../components/InvoiceEmailText.vue';`
- state, next to `inputs`:

```ts
/** Email subject and text of a saved draft; a new draft gets them from the template on save. */
const emailText = ref<InvoiceEmailText>({ emailSubject: '', emailBody: '' });
const emailTextInvalid = ref(false);
```

- include the text in the snapshot and expose the dirty state:

```ts
function formSnapshot(): string {
  return JSON.stringify([inputs.value, recipient.value?.id ?? null, emailText.value]);
}
const savedSnapshot = ref(formSnapshot());
const hasUnsavedChanges = computed(() => formSnapshot() !== savedSnapshot.value);
const { allowLeave } = useUnsavedChangesGuard(() => hasUnsavedChanges.value);
```

- in `loadDraft()`, after `inputs.value = …`:

```ts
emailText.value = { emailSubject: data.emailSubject, emailBody: data.emailBody };
```

- in `recipientRequestBody()`, before `return body`:

```ts
// Only a saved draft carries an email text; a new one gets it from the template on the server
if (isDraft && draftLoaded.value) body.emailText = emailText.value;
```

- in `saveDraft()`, after the `validate(false)` line:

```ts
if (isDraft && emailTextInvalid.value) return null;
```

- add:

```ts
function openPreview() {
  window.open(`/api/invoice-draft/${draftId}/preview`, '_blank');
}
```

Template:

- after the existing `<FormSection title="Email">…</FormSection>`:

```vue
<FormSection v-if="isDraft && draftLoaded" title="Email Text">
        <InvoiceEmailTextEditor
          v-model:subject="emailText.emailSubject"
          v-model:body="emailText.emailBody"
          v-model:invalid="emailTextInvalid"
          :source="inputs"
        />
      </FormSection>
```

- in `.form-actions`, before the "Save Draft" button:

```vue
<Button
  v-if="isDraft && draftLoaded"
  label="Preview"
  icon="pi pi-eye"
  severity="secondary"
  outlined
  :disabled="hasUnsavedChanges"
  :title="hasUnsavedChanges ? 'Save the draft to preview it' : undefined"
  data-testid="preview-draft"
  @click="openPreview"
/>
```

- [ ] **Step 3: Draft list**

In `frontend/src/views/InvoiceView.vue` add

```ts
function openDraftPreview(draftId: number) {
  window.open(`/api/invoice-draft/${draftId}/preview`, '_blank');
}
```

and, as the last column of the drafts `DataTable`:

```vue
<Column header-style="width: 7rem">
            <template #body="{ data }">
              <Button
                label="Preview"
                icon="pi pi-eye"
                size="small"
                text
                data-testid="preview-draft"
                @click.stop="openDraftPreview(data.id)"
              />
            </template>
          </Column>
```

- [ ] **Step 4: Verify and commit**

Run: `npm run test:unit --workspace=frontend -- InvoiceFormView InvoiceView` — Expected: PASS.
Run: `npm run lint && npm run test:unit && npm run test:integration` — Expected: PASS.

```bash
git add frontend/src
git commit -m "feat: edit the email text of a draft and preview the draft" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Email card on the invoice page

**Files:**

- Modify: `frontend/src/views/InvoiceDetailView.vue`
- Test: `frontend/src/__tests__/InvoiceDetailView.test.ts`

**Interfaces:**

- Consumes: Task 5 component; `InvoiceDto.emailSubject/emailBody` (Task 2);
  `PATCH /api/invoice/:id/email-text` (Task 3); `useUnsavedChangesGuard`.
- Produces: test ids `save-email-text`, `save-email-text-hint`.

- [ ] **Step 1: Write the failing tests**

In `frontend/src/__tests__/InvoiceDetailView.test.ts`:

- the page now registers a leave guard; extend the `vue-router` mock like the form test does:

```ts
const { leaveGuards } = vi.hoisted(() => ({ leaveGuards: [] as Array<() => unknown> }));
vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRoute: vi.fn(),
  useRouter: vi.fn(),
  onBeforeRouteLeave: (guard: () => unknown) => leaveGuards.push(guard),
}));
```

- add inside `describe('InvoiceDetailView', …)`:

```ts
const EDITED = { emailSubject: 'Mein Betreff {number}', emailBody: 'Mein Text' };

async function editEmailText(wrapper: VueWrapper) {
  await wrapper.find('[data-testid="email-subject"]').setValue(EDITED.emailSubject);
  await wrapper.find('[data-testid="email-body"]').setValue(EDITED.emailBody);
  await flushPromises();
}

it('shows the email text of the invoice', async () => {
  const wrapper = await mountView();
  const invoice = makeInvoice();
  expect((wrapper.find('[data-testid="email-subject"]').element as HTMLInputElement).value).toBe(
    invoice.emailSubject,
  );
  expect((wrapper.find('[data-testid="email-body"]').element as HTMLTextAreaElement).value).toBe(
    invoice.emailBody,
  );
  expect(wrapper.find('[data-testid="save-email-text"]').attributes('disabled')).toBeDefined();
});

it('saves an edited email text', async () => {
  replies['PATCH /api/invoice/1/email-text'] = { status: 200, body: EDITED };
  const wrapper = await mountView();
  await editEmailText(wrapper);

  await wrapper.find('[data-testid="save-email-text"]').trigger('click');
  await flushPromises();

  const patch = fetchMock.mock.calls.find(([url]) => url === '/api/invoice/1/email-text');
  expect(patch?.[1]?.method).toBe('PATCH');
  expect(JSON.parse(String(patch?.[1]?.body))).toEqual(EDITED);
  expect(notify.success).toHaveBeenCalledWith('Email text saved');
  expect(wrapper.find('[data-testid="save-email-text"]').attributes('disabled')).toBeDefined();
});

it('keeps the edits and reports the error when saving fails', async () => {
  replies['PATCH /api/invoice/1/email-text'] = {
    status: 400,
    body: { error: 'Email subject is required' },
  };
  const wrapper = await mountView();
  await editEmailText(wrapper);

  await wrapper.find('[data-testid="save-email-text"]').trigger('click');
  await flushPromises();

  expect(notify.error).toHaveBeenCalledWith('Email subject is required');
  expect((wrapper.find('[data-testid="email-body"]').element as HTMLTextAreaElement).value).toBe(
    EDITED.emailBody,
  );
});

it('locks sending while the email text has unsaved edits', async () => {
  const wrapper = await mountView();
  expect(wrapper.find('[data-testid="send-test-email"]').attributes('disabled')).toBeUndefined();
  expect(wrapper.find('[data-testid="save-email-text-hint"]').exists()).toBe(false);

  await editEmailText(wrapper);

  expect(wrapper.find('[data-testid="send-email"]').attributes('disabled')).toBeDefined();
  expect(wrapper.find('[data-testid="send-test-email"]').attributes('disabled')).toBeDefined();
  expect(wrapper.find('[data-testid="save-email-text-hint"]').text()).toBe(
    'Save the email text first',
  );
});

it('keeps unsaved email text when the invoice is reloaded', async () => {
  replies['PATCH /api/invoice/1/paid'] = { status: 200, body: { id: 1, paid: true } };
  const wrapper = await mountView();
  await editEmailText(wrapper);

  // Marking as paid reloads the invoice, like the PDF polling does
  replies['GET /api/invoice/1'] = { status: 200, body: makeInvoice({ paid: true }) };
  await wrapper.find('[data-testid="mark-paid"]').trigger('click');
  await flushPromises();

  expect(wrapper.find('[data-testid="payment-status"]').text()).toBe('Paid');
  expect((wrapper.find('[data-testid="email-body"]').element as HTMLTextAreaElement).value).toBe(
    EDITED.emailBody,
  );
});

it('asks before leaving with an unsaved email text', async () => {
  const wrapper = await mountView();
  const tryLeave = () => leaveGuards[leaveGuards.length - 1]();
  expect(await tryLeave()).toBe(true);

  await editEmailText(wrapper);
  confirmAction.mockResolvedValue(false);
  expect(await tryLeave()).toBe(false);
});

it('shows the email text of a cancelled invoice read-only', async () => {
  replies['GET /api/invoice/1'] = { status: 200, body: makeInvoice({ status: 'STORNIERT' }) };
  const wrapper = await mountView();
  expect(wrapper.find('[data-testid="email-subject"]').attributes('disabled')).toBeDefined();
  expect(wrapper.find('[data-testid="save-email-text"]').exists()).toBe(false);
  expect(wrapper.find('[data-testid="reset-email-text"]').exists()).toBe(false);
});
```

The default fixture must show the send buttons for these tests: `makeInvoice()` uses a revision
with `pdfStatus: 'OK'`, an email address and `emailStatus: 'NOT_SENT'` (it does today); the test
file's `mountView` stubs nothing of the new component.

Run: `npm run test:unit --workspace=frontend -- InvoiceDetailView` — Expected: the new tests FAIL.

- [ ] **Step 2: Implement**

In `frontend/src/views/InvoiceDetailView.vue`:

Script:

- imports: `type InvoiceEmailText` from `'shared'`,
  `InvoiceEmailTextEditor from '../components/InvoiceEmailText.vue'`,
  `{ useUnsavedChangesGuard } from '../composables/useUnsavedChangesGuard'`.
- state and logic, after `openPanels`:

```ts
const emailText = ref<InvoiceEmailText>({ emailSubject: '', emailBody: '' });
const savedEmailText = ref<InvoiceEmailText>({ emailSubject: '', emailBody: '' });
const emailTextInvalid = ref(false);
const emailTextDirty = computed(
  () =>
    emailText.value.emailSubject !== savedEmailText.value.emailSubject ||
    emailText.value.emailBody !== savedEmailText.value.emailBody,
);
useUnsavedChangesGuard(() => emailTextDirty.value);

/** What "Reset from template" builds the text from: the revision that would be sent. */
const emailTextSource = computed(
  () =>
    invoice.value?.activeRevision?.inputs ??
    invoice.value?.revisions[0]?.inputs ?? { emailSalutation: '', name: '', title: '', email: '' },
);
```

- in `loadData()`, right after `invoice.value = (await res.json()) as InvoiceDto;`:

```ts
// The page reloads itself while a PDF is pending: never overwrite a text being edited
if (!emailTextDirty.value) {
  const loaded = {
    emailSubject: invoice.value.emailSubject,
    emailBody: invoice.value.emailBody,
  };
  emailText.value = { ...loaded };
  savedEmailText.value = loaded;
}
```

- add:

```ts
async function saveEmailText() {
  const text = { ...emailText.value };
  const ok = await run(
    'email-text',
    () =>
      fetch(`/api/invoice/${id}/email-text`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(text),
      }),
    (body) => body.error || 'Error saving the email text',
  );
  if (ok) {
    savedEmailText.value = text;
    notify.success('Email text saved');
  }
}
```

Template:

- between the facts `<Card>` and the "Revisions" section:

```vue
<section class="stack gap-sm">
        <h3 class="section-title">Email</h3>
        <Card>
          <template #content>
            <div class="stack">
              <InvoiceEmailTextEditor
                v-model:subject="emailText.emailSubject"
                v-model:body="emailText.emailBody"
                v-model:invalid="emailTextInvalid"
                :source="emailTextSource"
                :disabled="!isActive"
              />
              <div v-if="isActive" class="row">
                <Button
                  label="Save"
                  icon="pi pi-save"
                  :disabled="!emailTextDirty || emailTextInvalid"
                  :loading="busy['email-text']"
                  data-testid="save-email-text"
                  @click="saveEmailText"
                />
              </div>
            </div>
          </template>
        </Card>
      </section>
```

- the "Send Test Email" button gets `:disabled="emailTextDirty"`; the "Send via Email" button's
  `:disabled` becomes `!rev.inputs.email.trim() || emailTextDirty`; directly after the
  `no-email-hint` `<small>` add:

```vue
<small
  v-if="emailTextDirty && rev.pdfStatus === 'OK' && isActive && isLatest(rev)"
  class="muted"
  data-testid="save-email-text-hint"
>
                    Save the email text first
                  </small>
```

- [ ] **Step 3: Verify and commit**

Run: `npm run test:unit --workspace=frontend -- InvoiceDetailView` — Expected: PASS, no Vue
warnings.
Run: `npm run lint && npm run test:unit && npm run test:integration` — Expected: PASS.

```bash
git add frontend/src
git commit -m "feat: edit the email text on the invoice page" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: End-to-end test and docs

**Files:**

- Create: `e2e/tests/invoice-email-text.spec.ts`
- Modify: `docs/EMAIL_SERVICE.md`, `AGENTS.md`

- [ ] **Step 1: Write the spec**

`e2e/tests/invoice-email-text.spec.ts`:

```ts
import { BACKEND_URL, uploadInvoiceTemplate } from './helpers';

async function acceptConfirm(label: string) {
  const accept = await $('.p-confirmdialog').$(`button=${label}`);
  await accept.waitForClickable({ timeout: 5000 });
  await accept.click();
}

describe('Invoice email text and draft preview', () => {
  let draftId = 0;

  before(async function () {
    this.timeout(60000);
    await uploadInvoiceTemplate();
    const res = await fetch(`${BACKEND_URL}/api/invoice-draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputs: {
          salutation: 'Frau',
          name: 'E2E Entwurf GmbH',
          street: 'Entwurfsweg 1',
          city: 'Entwurfsstadt',
          title: 'E2E Kursgebühr',
          lineItems: [{ text: 'Kursgebühr', priceInCents: 5000 }],
          vat: 19,
          directDebit: false,
          email: 'entwurf@example.com',
          emailSalutation: 'Sehr geehrte Damen und Herren',
        },
        recipientData: {
          name: 'E2E Entwurf GmbH',
          street: 'Entwurfsweg 1',
          city: 'Entwurfsstadt',
        },
      }),
    });
    expect(res.status).toBe(201);
    draftId = (await res.json()).draftId;
  });

  it('keeps an edited email text with the draft', async function () {
    this.timeout(30000);
    await browser.url(`/invoice/draft/${draftId}`);
    const body = await $('[data-testid="email-body"]');
    await body.waitForDisplayed({ timeout: 10000 });
    await expect(body).toHaveValue(expect.stringContaining('{number}'));

    await body.setValue('E2E Text für Rechnung {number}');
    await $('[data-testid="save-draft"]').click();
    await expect($('[data-testid="preview-draft"]')).toBeEnabled();

    await browser.refresh();
    await expect($('[data-testid="email-body"]')).toHaveValue('E2E Text für Rechnung {number}');
  });

  it('answers a preview PDF for the draft without creating an invoice', async function () {
    this.timeout(60000);
    const res = await fetch(`${BACKEND_URL}/api/invoice-draft/${draftId}/preview`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    const pdf = Buffer.from(await res.arrayBuffer());
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');

    const invoices = await (await fetch(`${BACKEND_URL}/api/invoice?withCancelled=true`)).json();
    expect(invoices).toHaveLength(0);
  });

  it('takes the text over when the draft becomes an invoice', async function () {
    this.timeout(60000);
    await browser.url(`/invoice/draft/${draftId}`);
    const activate = await $('[data-testid="activate-draft"]');
    await activate.waitForClickable({ timeout: 10000 });
    await activate.click();
    await acceptConfirm('Activate');

    await (await $('h2*=Invoice ')).waitForDisplayed({ timeout: 20000 });
    await expect($('[data-testid="email-body"]')).toHaveValue('E2E Text für Rechnung {number}');
  });
});
```

- [ ] **Step 2: Run the e2e suite against scratch servers only**

Never against ports 3000/5173 and never via `npm test` / `e2e/run-tests.sh`. Start a backend in
its own Docker compose project on a scratch port (`Dockerfile.dev`, port `127.0.0.1:3996:3000`,
`E2E_RESET_ENABLED=true`, a scratch data dir; the controller supplies the compose file), build the
frontend and serve it with `vite preview --port 5179 --strictPort` with
`VITE_API_TARGET=http://localhost:3996`, record the process group id of what you start, then:

```bash
cd e2e && E2E_BACKEND_URL=http://localhost:3996 E2E_FRONTEND_URL=http://localhost:5179 \
  npx wdio run wdio.conf.ts
```

Expected: all spec files pass, including `invoice-email-text.spec.ts`. Stop only what you started.

- [ ] **Step 3: Docs**

In `docs/EMAIL_SERVICE.md`:

- replace the sentence "Templates support `{salutation}`, `{name}`, `{number}`, `{title}` and
  `{email}`, filled from the revision. …" by:

```
Templates support `{salutation}`, `{name}`, `{number}`, `{title}` and `{email}`. Mails are plain
text with the revision PDF attached as `<number>.pdf`.

## Text per invoice

The templates are only the starting point. When a draft is first saved or an invoice is created,
subject and text are built from them (`services/invoiceEmailText.ts`) and stored on the draft or
invoice (`emailSubject`, `emailBody`); every placeholder is filled in except `{number}`. From then
on only the user changes the text: in the form of a saved draft, or in the "Email" card on the
invoice page (`PATCH /api/invoice/:id/email-text`). "Reset from template" builds it anew
(`POST /api/email-settings/invoice-text`). Saving a draft again or creating a new revision keeps
the text; activating a draft copies it to the invoice.

Sending uses the stored text and fills in `{number}` — nothing else. Invoices from before this
existed have no stored text; they are sent with what the templates give at that moment.
```

- under "Frontend" add: "While the email card has unsaved edits, both send buttons are disabled."

In `AGENTS.md`, in the list under "Modifying Invoice/Receipt Logic", add:

```
- The email text of an invoice is stored on the invoice or draft; a new revision or re-saving a
  draft must not change it
```

- [ ] **Step 4: Verify and commit**

Run: `npm run lint && npm run test:unit && npm run test:integration` — Expected: PASS.

```bash
git add e2e/tests/invoice-email-text.spec.ts docs/EMAIL_SERVICE.md AGENTS.md
git commit -m "test: cover the invoice email text and draft preview end to end" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
