# Email Sending for Invoices — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add SMTP-based email sending for invoice PDFs with configurable templates, dev-mode test address override, and a test email button.

**Architecture:** New `emailService.ts` handles SMTP via nodemailer with variable substitution. New `emailSettings.ts` route manages SMTP/template settings via the existing `SystemSetting` key-value store. Two new columns on `InvoiceRevision` track email send status. Frontend adds an email settings section to the invoice settings page and a send button to the invoice detail page.

**Tech Stack:** Node.js, Express, Prisma/SQLite, nodemailer, Vue 3, TypeScript

## Global Constraints

- Use `nodemailer` for SMTP (added to `backend/package.json`)
- Settings stored in existing `SystemSetting` key-value table
- Dev override: when `NODE_ENV !== 'production'` AND `emailTestAddress` is set, redirect all invoice emails to the test address
- Email templates use `{salutation}`, `{name}`, `{number}`, `{email}` variables
- Follow existing code patterns: same route structure, same DTO pattern, same save pattern (explicit save button → PUT)
- All new columns default to safe values (`NOT_SENT`, `null`)

---

### Task 1: Prisma Schema — Add email status columns to InvoiceRevision

**Files:**

- Modify: `backend/prisma/schema.prisma:142-169`

**Interfaces:**

- Produces: Two new fields on `InvoiceRevision`: `emailStatus String @default("NOT_SENT")`, `emailError String?`

- [ ] **Step 1: Add fields to InvoiceRevision model**

In `backend/prisma/schema.prisma`, add after `filePath String?`:

```prisma
  emailStatus   String   @default("NOT_SENT")
  emailError    String?
```

- [ ] **Step 2: Run Prisma migration**

```bash
cd backend && npx prisma migrate dev --name add_invoice_email_status
```

Expected: Migration created and applied successfully.

- [ ] **Step 3: Verify generated types include new fields**

```bash
cd backend && npx prisma generate
```

Check `backend/prisma/generated/models.ts` — `InvoiceRevision` should include `emailStatus: string` and `emailError: string | null`.

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "feat: add emailStatus and emailError columns to InvoiceRevision"
```

---

### Task 2: Shared types — Add EmailSettings and extend InvoiceRevisionDto

**Files:**

- Modify: `shared/src/index.ts`

**Interfaces:**

- Produces: `EmailSettings` interface, `InvoiceRevisionDto` gains `emailStatus` and `emailError` fields

- [ ] **Step 1: Add EmailSettings interface**

In `shared/src/index.ts`, after the `SystemSettings` interface, add:

```ts
export interface EmailSettings {
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

- [ ] **Step 2: Add email fields to InvoiceRevisionDto**

In the `InvoiceRevisionDto` interface, add after `pdfTechError`:

```ts
emailStatus: 'NOT_SENT' | 'SENT' | 'FAILED';
emailError: string | null;
```

- [ ] **Step 3: Verify typecheck**

```bash
npm run typecheck --workspace=shared
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add shared/src/index.ts
git commit -m "feat: add EmailSettings type and email fields to InvoiceRevisionDto"
```

---

### Task 3: Install nodemailer dependency

**Files:**

- Modify: `backend/package.json`

**Interfaces:**

- Produces: `nodemailer` available as import

- [ ] **Step 1: Install nodemailer**

```bash
npm install nodemailer --workspace=backend
```

- [ ] **Step 2: Install @types/nodemailer**

```bash
npm install @types/nodemailer --save-dev --workspace=backend
```

- [ ] **Step 3: Commit**

```bash
git add backend/package.json package-lock.json
git commit -m "chore: add nodemailer dependency"
```

---

### Task 4: Email service — sendInvoiceEmail and sendTestEmail

**Files:**

- Create: `backend/src/services/emailService.ts`

**Interfaces:**

- Consumes: `EmailSettings` from shared, `PrismaClient` from generated client, `emailStatus`/`emailError` fields on `InvoiceRevision`
- Produces:
  - `sendInvoiceEmail(prisma: PrismaClient, revisionId: number): Promise<{ success: boolean; error?: string }>`
  - `sendTestEmail(prisma: PrismaClient): Promise<{ success: boolean; error?: string }>`

- [ ] **Step 1: Write the service file**

Create `backend/src/services/emailService.ts`:

```ts
import nodemailer from 'nodemailer';
import type { PrismaClient } from '../../prisma/generated/client.js';
import { toAbsolutePath } from '../config.js';
import fs from 'fs';

function getSetting(rows: { key: string; value: string }[], key: string): string {
  return rows.find((r) => r.key === key)?.value ?? '';
}

function replaceVariables(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{${key}}`, value);
  }
  return result;
}

export async function sendInvoiceEmail(
  prisma: PrismaClient,
  revisionId: number,
): Promise<{ success: boolean; error?: string }> {
  const revision = await prisma.invoiceRevision.findUnique({
    where: { id: revisionId },
    include: { invoice: true },
  });

  if (!revision) {
    return { success: false, error: 'Revision not found' };
  }

  if (revision.pdfStatus !== 'OK' || !revision.filePath) {
    return { success: false, error: 'No PDF available for this revision' };
  }

  const settings = await prisma.systemSetting.findMany();

  const smtpHost = getSetting(settings, 'smtpHost');
  const smtpPort = parseInt(getSetting(settings, 'smtpPort') || '587', 10);
  const smtpUser = getSetting(settings, 'smtpUser');
  const smtpPassword = getSetting(settings, 'smtpPassword');
  const smtpSecure = getSetting(settings, 'smtpSecure') === 'true';
  const emailSubject = getSetting(settings, 'emailSubject') || 'Ihre Rechnung {number}';
  const emailBody =
    getSetting(settings, 'emailBody') ||
    '{salutation}\n\nanbei erhalten Sie Ihre Rechnung {number}.\n\nMit freundlichen Grüßen';
  const testAddress = getSetting(settings, 'emailTestAddress');

  if (!smtpHost || !smtpUser || !smtpPassword) {
    return { success: false, error: 'SMTP settings are not configured' };
  }

  const vars: Record<string, string> = {
    salutation: revision.emailSalutation,
    name: revision.name,
    number: revision.invoice.number,
    email: revision.email,
  };

  let to = revision.email;
  let body = replaceVariables(emailBody, vars);
  const subject = replaceVariables(emailSubject, vars);

  const isDev = process.env.NODE_ENV !== 'production';
  if (isDev && testAddress) {
    body = `[DEV OVERRIDE — Original recipient: ${revision.name} <${revision.email}>]\n\n${body}`;
    to = testAddress;
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: {
      user: smtpUser,
      pass: smtpPassword,
    },
  });

  try {
    const absolutePath = toAbsolutePath(revision.filePath);
    await transporter.sendMail({
      from: smtpUser,
      to,
      subject,
      text: body,
      attachments: [
        {
          filename: `${revision.invoice.number.replace(/\s*\/\s*/g, '-')}.pdf`,
          path: absolutePath,
        },
      ],
    });

    await prisma.invoiceRevision.update({
      where: { id: revisionId },
      data: { emailStatus: 'SENT', emailError: null },
    });

    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    await prisma.invoiceRevision.update({
      where: { id: revisionId },
      data: { emailStatus: 'FAILED', emailError: errorMessage },
    });

    return { success: false, error: errorMessage };
  }
}

export async function sendTestEmail(
  prisma: PrismaClient,
): Promise<{ success: boolean; error?: string }> {
  const settings = await prisma.systemSetting.findMany();

  const smtpHost = getSetting(settings, 'smtpHost');
  const smtpPort = parseInt(getSetting(settings, 'smtpPort') || '587', 10);
  const smtpUser = getSetting(settings, 'smtpUser');
  const smtpPassword = getSetting(settings, 'smtpPassword');
  const smtpSecure = getSetting(settings, 'smtpSecure') === 'true';
  const testAddress = getSetting(settings, 'emailTestAddress');

  if (!smtpHost || !smtpUser || !smtpPassword) {
    return { success: false, error: 'SMTP settings are not configured' };
  }

  if (!testAddress) {
    return { success: false, error: 'Test email address is not configured' };
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: {
      user: smtpUser,
      pass: smtpPassword,
    },
  });

  try {
    await transporter.sendMail({
      from: smtpUser,
      to: testAddress,
      subject: 'MV Dashboard — Test Email',
      text: 'This is a test email from the MV Dashboard email configuration.\n\nIf you receive this, your SMTP settings are correct.',
    });

    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return { success: false, error: errorMessage };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/services/emailService.ts
git commit -m "feat: add email service with sendInvoiceEmail and sendTestEmail"
```

---

### Task 5: Email settings route — CRUD + test endpoint

**Files:**

- Create: `backend/src/routes/emailSettings.ts`

**Interfaces:**

- Consumes: `sendTestEmail` from `emailService.ts`, `SystemSetting` model
- Produces: Express router with GET `/`, PUT `/`, POST `/test`

- [ ] **Step 1: Write the route file**

Create `backend/src/routes/emailSettings.ts`:

```ts
import { Router } from 'express';
import type { EmailSettings } from 'shared';
import { prisma } from '../prismaClient.js';
import { sendTestEmail } from '../services/emailService.js';

export const emailSettingsRouter = Router();

const SETTINGS_KEYS: (keyof EmailSettings)[] = [
  'smtpHost',
  'smtpPort',
  'smtpUser',
  'smtpPassword',
  'smtpSecure',
  'emailSubject',
  'emailBody',
  'emailTestAddress',
];

emailSettingsRouter.get('/', async (_req, res) => {
  const rows = await prisma.systemSetting.findMany();
  const result: Partial<EmailSettings> = {};
  for (const row of rows) {
    if (SETTINGS_KEYS.includes(row.key as keyof EmailSettings)) {
      (result as Record<string, string>)[row.key] = row.value;
    }
  }
  res.json(result);
});

emailSettingsRouter.put('/', async (req, res) => {
  const body = req.body as Partial<EmailSettings>;

  const updates = SETTINGS_KEYS.filter((k) => body[k] !== undefined).map((key) =>
    prisma.systemSetting.upsert({
      where: { key },
      update: { value: body[key] as string },
      create: { key, value: body[key] as string },
    }),
  );

  await Promise.all(updates);
  res.json({ message: 'Email settings saved' });
});

emailSettingsRouter.post('/test', async (_req, res) => {
  const result = await sendTestEmail(prisma);
  if (result.success) {
    res.json({ message: 'Test email sent successfully' });
  } else {
    res.status(400).json({ error: result.error });
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/routes/emailSettings.ts
git commit -m "feat: add email settings route with test endpoint"
```

---

### Task 6: Register email settings route and add invoice send-email route

**Files:**

- Modify: `backend/src/routes/index.ts`
- Modify: `backend/src/routes/invoice.ts`

**Interfaces:**

- Consumes: `emailSettingsRouter` from Task 5, `sendInvoiceEmail` from Task 4
- Produces: `/api/email-settings` routes, `/api/invoice/revision/:revisionId/send-email` route, updated `revisionToDto`

- [ ] **Step 1: Register email settings router in index.ts**

In `backend/src/routes/index.ts`, add the import and registration:

Add import near other route imports:

```ts
import { emailSettingsRouter } from './emailSettings.js';
```

Add registration near other `router.use` calls:

```ts
router.use('/email-settings', emailSettingsRouter);
```

- [ ] **Step 2: Update revisionToDto in invoice.ts to include email status fields**

In `backend/src/routes/invoice.ts`, update the `revisionToDto` function parameter type and return value.

Change the parameter destructure to include the new fields — add `emailStatus: string; emailError: string | null;` to the parameter type. Then add to the return object after `filePath`:

In the return object, add after `filePath: rev.filePath,`:

```ts
    emailStatus: rev.emailStatus as 'NOT_SENT' | 'SENT' | 'FAILED',
    emailError: rev.emailError,
```

- [ ] **Step 3: Add send-email route BEFORE the /:id route**

In `backend/src/routes/invoice.ts`, add before the `// GET /api/invoice/:id` comment:

```ts
// POST /api/invoice/revision/:revisionId/send-email
// NOTE: This route MUST come before /:id to avoid matching "send-email" as an id
invoiceRouter.post('/revision/:revisionId/send-email', async (req, res) => {
  const id = parseInt(req.params.revisionId);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid revision ID' });
    return;
  }

  const result = await sendInvoiceEmail(prisma, id);
  if (result.success) {
    res.json({ emailStatus: 'SENT' as const, emailError: null });
  } else {
    res.status(400).json({ emailStatus: 'FAILED' as const, emailError: result.error });
  }
});
```

Add the import for `sendInvoiceEmail` near the top of the file:

```ts
import { sendInvoiceEmail } from '../services/emailService.js';
```

- [ ] **Step 4: Verify typecheck**

```bash
npm run typecheck --workspace=backend
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/index.ts backend/src/routes/invoice.ts
git commit -m "feat: add email settings route registration and invoice send-email endpoint"
```

---

### Task 7: Frontend — Email settings section in InvoiceSettingsView

**Files:**

- Modify: `frontend/src/views/InvoiceSettingsView.vue`

**Interfaces:**

- Consumes: `EmailSettings` from shared, `/api/email-settings` GET/PUT, `/api/email-settings/test` POST
- Produces: Email settings UI section between template section and recipient management

- [ ] **Step 1: Add email settings state and functions to the script section**

In the `<script setup lang="ts">` block of `frontend/src/views/InvoiceSettingsView.vue`, add after the `import { computed, onMounted, ref, watch } from 'vue';` line:

Add the `EmailSettings` import by extending the existing shared import:
Change `import type { InvoiceRecipientDto, TemplateDto } from 'shared';` to:

```ts
import type { EmailSettings, InvoiceRecipientDto, TemplateDto } from 'shared';
```

Add after the `uploadLoading` ref declaration (around line 30):

```ts
// ── Email Settings ─────────────────────────────

const emailSettings = ref<EmailSettings>({
  smtpHost: '',
  smtpPort: '587',
  smtpUser: '',
  smtpPassword: '',
  smtpSecure: 'false',
  emailSubject: '',
  emailBody: '',
  emailTestAddress: '',
});
const emailSaving = ref(false);
const emailSaveSuccess = ref('');
const emailSaveError = ref('');
const emailTestLoading = ref(false);
const emailTestResult = ref<{ success: boolean; message: string } | null>(null);

async function loadEmailSettings() {
  try {
    const res = await fetch('/api/email-settings');
    if (res.ok) {
      const data = await res.json();
      Object.assign(emailSettings.value, data);
    }
  } catch {
    // ignore
  }
}

async function saveEmailSettings() {
  emailSaving.value = true;
  emailSaveSuccess.value = '';
  emailSaveError.value = '';
  try {
    const res = await fetch('/api/email-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(emailSettings.value),
    });
    if (!res.ok) throw new Error();
    emailSaveSuccess.value = 'Email settings saved';
  } catch {
    emailSaveError.value = 'Error saving email settings';
  } finally {
    emailSaving.value = false;
  }
}

async function sendTestEmail() {
  emailTestLoading.value = true;
  emailTestResult.value = null;
  try {
    const res = await fetch('/api/email-settings/test', { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      emailTestResult.value = { success: true, message: data.message || 'Test email sent' };
    } else {
      emailTestResult.value = {
        success: false,
        message: data.error || 'Failed to send test email',
      };
    }
  } catch {
    emailTestResult.value = { success: false, message: 'Network error' };
  } finally {
    emailTestLoading.value = false;
  }
}
```

Add `loadEmailSettings()` to the `onMounted` call, after `loadRecipients();`:

```ts
onMounted(() => {
  loadTemplate();
  loadRecipients();
  loadEmailSettings();
});
```

- [ ] **Step 2: Add email settings template section**

In the template, add the email settings section between the template upload section (closing `</div>` of the template card) and the `<!-- Recipient Management -->` comment.

Add after `</div>` of the template section (`</div>` that closes the template card's outer div) and before `<!-- Recipient Management -->`:

```html
<!-- Email Settings -->
<div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mt-6">
  <h3 class="font-semibold text-gray-800 mb-4">Email Settings</h3>

  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    <div>
      <label class="block text-sm font-medium text-gray-700 mb-1">SMTP Host</label>
      <input
        v-model="emailSettings.smtpHost"
        type="text"
        placeholder="smtp.example.com"
        class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
    <div>
      <label class="block text-sm font-medium text-gray-700 mb-1">SMTP Port</label>
      <input
        v-model="emailSettings.smtpPort"
        type="text"
        placeholder="587"
        class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
    <div>
      <label class="block text-sm font-medium text-gray-700 mb-1">SMTP User</label>
      <input
        v-model="emailSettings.smtpUser"
        type="text"
        placeholder="user@example.com"
        class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
    <div>
      <label class="block text-sm font-medium text-gray-700 mb-1">SMTP Password</label>
      <input
        v-model="emailSettings.smtpPassword"
        type="password"
        placeholder="••••••••"
        class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  </div>

  <div class="mt-4">
    <label class="inline-flex items-center gap-2 cursor-pointer">
      <input
        v-model="emailSettings.smtpSecure"
        type="checkbox"
        true-value="true"
        false-value="false"
        class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
      />
      <span class="text-sm text-gray-700">Use TLS (Secure)</span>
    </label>
  </div>

  <div class="mt-4">
    <label class="block text-sm font-medium text-gray-700 mb-1">
      Email Subject
      <span class="text-xs text-gray-400">({number}, {salutation}, {name}, {email})</span>
    </label>
    <input
      v-model="emailSettings.emailSubject"
      type="text"
      placeholder="Ihre Rechnung {number}"
      class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  </div>

  <div class="mt-4">
    <label class="block text-sm font-medium text-gray-700 mb-1">
      Email Body
      <span class="text-xs text-gray-400">({salutation}, {name}, {number}, {email})</span>
    </label>
    <textarea
      v-model="emailSettings.emailBody"
      rows="5"
      placeholder="{salutation}&#10;&#10;anbei erhalten Sie Ihre Rechnung {number}.&#10;&#10;Mit freundlichen Grüßen"
      class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
    ></textarea>
  </div>

  <div class="mt-4">
    <label class="block text-sm font-medium text-gray-700 mb-1">
      Test Email Address
      <span class="text-xs text-gray-400">(dev: all invoices redirected here)</span>
    </label>
    <input
      v-model="emailSettings.emailTestAddress"
      type="email"
      placeholder="test@example.com"
      class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  </div>

  <div class="flex items-center gap-3 mt-4">
    <button
      type="button"
      class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
      :disabled="emailSaving"
      @click="saveEmailSettings"
    >
      {{ emailSaving ? 'Saving…' : 'Save Email Settings' }}
    </button>
    <button
      type="button"
      class="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
      :disabled="emailTestLoading"
      @click="sendTestEmail"
    >
      <span
        v-if="emailTestLoading"
        class="animate-spin rounded-full h-3 w-3 border-2 border-gray-400 border-b-transparent inline-block mr-1"
      ></span>
      {{ emailTestLoading ? 'Sending…' : 'Send Test Email' }}
    </button>
  </div>

  <p v-if="emailSaveSuccess" class="text-green-600 text-xs mt-2">{{ emailSaveSuccess }}</p>
  <p v-if="emailSaveError" class="text-red-600 text-xs mt-2">{{ emailSaveError }}</p>
  <div
    v-if="emailTestResult"
    :class="['text-xs mt-2', emailTestResult.success ? 'text-green-600' : 'text-red-600']"
  >
    {{ emailTestResult.message }}
  </div>
</div>
```

- [ ] **Step 3: Verify typecheck**

```bash
npm run typecheck --workspace=frontend
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/views/InvoiceSettingsView.vue
git commit -m "feat: add email settings section to invoice settings page"
```

---

### Task 8: Frontend — Send via Email button in InvoiceDetailView

**Files:**

- Modify: `frontend/src/views/InvoiceDetailView.vue`

**Interfaces:**

- Consumes: `POST /api/invoice/revision/:revisionId/send-email`, `emailStatus`/`emailError` fields on `InvoiceRevisionDto`
- Produces: "Send via Email" button in revision actions area

- [ ] **Step 1: Add send-email state and function to script**

In the `<script setup lang="ts">` block of `frontend/src/views/InvoiceDetailView.vue`, add after the `retryLoading` ref:

```ts
const sendEmailLoading = ref<Record<number, boolean>>({});
const sendEmailSuccess = ref<Record<number, string>>({});
const sendEmailError = ref<Record<number, string>>({});
```

Add the `sendEmail` function after the `retryPdf` function:

```ts
async function sendEmail(revisionId: number) {
  sendEmailSuccess.value[revisionId] = '';
  sendEmailError.value[revisionId] = '';
  sendEmailLoading.value[revisionId] = true;

  try {
    const res = await fetch(`/api/invoice/revision/${revisionId}/send-email`, { method: 'POST' });
    const result = await res.json();

    if (res.ok) {
      sendEmailSuccess.value[revisionId] = 'Email sent successfully';
      await loadData();
    } else {
      sendEmailError.value[revisionId] = result.error || 'Error sending email';
    }
  } catch {
    sendEmailError.value[revisionId] = 'Network error';
  } finally {
    sendEmailLoading.value[revisionId] = false;
  }
}
```

- [ ] **Step 2: Add Send Email button in the template**

In the template, in the revision actions area (where "Download PDF" and "PDF neu generieren" buttons are), add after the retry PDF error paragraph:

```html
<button
  v-if="rev.pdfStatus === 'OK' && rev.emailStatus !== 'SENT'"
  class="text-green-600 hover:underline text-sm"
  :disabled="sendEmailLoading[rev.id]"
  @click="sendEmail(rev.id)"
>
  {{ sendEmailLoading[rev.id] ? 'Sending…' : 'Send via Email' }}
</button>
<span v-if="rev.emailStatus === 'SENT'" class="text-green-600 text-xs font-medium"
  >Email Sent ✓</span
>
<span v-if="rev.emailStatus === 'FAILED'" class="text-red-600 text-xs"
  >Email failed{{ rev.emailError ? ': ' + rev.emailError : '' }}</span
>
<p v-if="sendEmailSuccess[rev.id]" class="text-green-600 text-xs">{{ sendEmailSuccess[rev.id] }}</p>
<p v-if="sendEmailError[rev.id]" class="text-red-600 text-xs">{{ sendEmailError[rev.id] }}</p>
```

- [ ] **Step 3: Verify typecheck**

```bash
npm run typecheck --workspace=frontend
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/views/InvoiceDetailView.vue
git commit -m "feat: add send via email button to invoice detail page"
```

---

### Task 9: Integration test for email settings and send-email endpoints

**Files:**

- Create/modify: `backend/src/__tests__/integration/` (add email tests)

**Interfaces:**

- Consumes: `/api/email-settings` GET/PUT/POST test, `/api/invoice/revision/:id/send-email`

- [ ] **Step 1: Write integration tests**

Create `backend/src/__tests__/integration/email.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { initializeApp } from '../../init.js';
import { prisma } from '../../prismaClient.js';
import type { Express } from 'express';

let app: Express;

beforeAll(async () => {
  await initializeApp();
  app = createApp();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Email Settings API', () => {
  it('GET /api/email-settings returns empty settings by default', async () => {
    const res = await request(app).get('/api/email-settings');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('smtpHost');
  });

  it('PUT /api/email-settings saves settings', async () => {
    const res = await request(app)
      .put('/api/email-settings')
      .send({ smtpHost: 'smtp.test.com', smtpPort: '587', emailSubject: 'Test {number}' });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Email settings saved');
  });

  it('GET /api/email-settings returns saved settings', async () => {
    const res = await request(app).get('/api/email-settings');
    expect(res.status).toBe(200);
    expect(res.body.smtpHost).toBe('smtp.test.com');
    expect(res.body.emailSubject).toBe('Test {number}');
  });

  it('POST /api/email-settings/test fails without valid SMTP config', async () => {
    const res = await request(app).post('/api/email-settings/test');
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});
```

- [ ] **Step 2: Run integration tests**

```bash
npm run test:integration --workspace=backend -- --reporter=verbose
```

Expected: Email settings tests pass (the test endpoint will return 400 since no real SMTP is configured, which is correct).

- [ ] **Step 3: Commit**

```bash
git add backend/src/__tests__/integration/email.test.ts
git commit -m "test: add integration tests for email settings"
```
