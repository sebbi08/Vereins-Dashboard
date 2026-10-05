# PrimeVue Rewrite — Plan 2: Invoices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the four invoice screens — list (with drafts), detail, form (incl. draft mode, revisions, copies, instructor prefill) and invoice settings — with PrimeVue 5, plus the shared list/table helpers that the donation-receipt screens (plan 3) reuse.

**Architecture:** Pure helpers (`utils/format.ts` dates, `utils/statusTags.ts`, `utils/tableFilters.ts` with two custom DataTable match modes) and small shared components (`StatusTag`, `AmountRangeFilter`, `TemplateCard`) plus a `useBatchDownload` composable are built first and unit-tested. Each screen is then rewritten on top of them and the plan-1 building blocks (`PageHeader`, `FormSection`, `TABLE_DEFAULTS`, `globalFilter`, `useNotify`, `useConfirmAction`, `layout.css`). Lists load everything once and filter in the browser; toasts and confirm dialogs replace banners, `alert()` and `confirm()`.

**Tech Stack:** Vue 3 `<script setup>` + TypeScript, PrimeVue 5.0.2 (DataTable, Column, Accordion, Tabs, Dialog, FileUpload, AutoComplete, DatePicker, InputNumber, Select, ToggleSwitch, Textarea, Tag, Message), Vitest + @vue/test-utils + jsdom.

**Spec:** `docs/superpowers/specs/2026-10-05-primevue-frontend-design.md` (sections “Screens → List pages / Detail pages / Forms / Settings pages”)

**Series:** plan 2 of 5 on branch `feat/primevue` (merged once after plan 5). Plan 1 (foundation) is done.

## Global Constraints

- Work only in the worktree `.claude/worktrees/feat-primevue` on branch `feat/primevue`. Never touch `master` or other branches; never push.
- Verification after every task: `npm run lint && npm run test:unit && npm run test:integration` (all pass, zero lint warnings).
- No backend/API changes. Lists load `/api/invoice?withCancelled=true` and `/api/invoice-draft` once and filter in the browser.
- Explicit component imports (`import DataTable from 'primevue/datatable'`). No deprecated v5 components (`InputMask` component, `MultiSelect`, `Password`, …). Use `InputText type="password"` for passwords.
- Rewritten files must not contain Tailwind classes. Use `src/assets/layout.css` helpers (`.page`, `.stack`, `.row`, `.row--between`, `.grid-2`, `.gap-xs|sm|md|lg`, `.muted`, `.field`) and `<style scoped>` with PrimeVue CSS variables (`--p-text-muted-color`, `--p-content-border-color`, `--p-content-background`, `--p-red-500`, …).
- Use plan-1 building blocks: `PageHeader` (`data-testid="page-title"` on `<h2>`), `FormSection`, `TABLE_DEFAULTS` (spread with `v-bind`), `globalFilter()`, `useNotify()` (`success|info|warn|error` — `warn` added in Task 1), `useConfirmAction()` (`confirmAction({ message, header?, acceptLabel?, rejectLabel?, danger? }): Promise<boolean>`).
- Feedback: success/error/warning messages are toasts via `useNotify`; field validation errors appear under the field as `Message severity="error" size="small" variant="simple"`; `window.confirm` / `alert` are not used anywhere in rewritten files.
- Dates: `dd.mm.yyyy` display via `formatDate`; DatePicker models are `Date`; API strings stay `YYYY-MM-DD` (convert with `toIsoDate` / `fromIsoDate`). Money: integer cents in the model; `InputNumber mode="currency" currency="EUR" locale="de-DE"` edits euros.
- Keep these user-visible texts/selectors (e2e relies on them; e2e itself is updated in plan 5): heading `Invoices`; buttons `Settings`, `New Invoice`, `Save Template`; a search input whose placeholder contains `Search`; detail heading starting with `Invoice ` (h2); revision label `Revision N` in its own `<span>`; settings heading `Invoice Settings`; template preview dialog title `Invoice Preview` as an `<h3>`; file input `input[type="file"][accept*=".docx"]`; the preview `<iframe>`; a `<p>` with `Invoice (.docx)`; `<p>` texts `No template uploaded` and `Version …` on the template card.
- Tests mock `useNotify` / `useConfirmAction` / `useBatchDownload` with `vi.hoisted` + `vi.mock`, mount with `global: withPrimeVue(...)`, stub `RouterLink` as `{ template: '<a><slot /></a>' }` where no router is installed, and mount components with teleported overlays (`Dialog`) using `attachTo: document.body`.
- Commit messages: conventional commits with lower-case subjects (commitlint), ending with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **Clicking a row's checkbox or "Copy" button** → selects / copies only; it must not also open the invoice. Test: Task 3.
2. **Batch download where the server rejects some invoices** → a toast names how many and why, and exactly those rows are deselected; the rest stay selected. Test: Task 2 (composable) and Task 3 (view).
3. **Date filter around time zones** → an invoice dated 1 March appears for a range ending 1 March regardless of the browser's offset (API dates are UTC midnight). Test: Task 1 (`inDateRange`).
4. **Typing a price as euros with decimals** (12,50) → stored as 1250 cents; gross recomputes with VAT (19 % → 14,88 €). Test: Task 5.
5. **Enter pressed inside a draft** → saves the draft only (never creates an invoice), and a draft that failed to load can't be saved. Test: Task 5.

---

## File Structure

| File                                                     | Responsibility                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/utils/format.ts` (modify)                  | + `formatDate`, `formatDateTime`, `toIsoDate`, `fromIsoDate`                                                                                                                                                                                                                                                                                         |
| `frontend/src/utils/statusTags.ts` (new)                 | Labels/severities for document, revision, PDF and email states; status filter options                                                                                                                                                                                                                                                                |
| `frontend/src/utils/tableFilters.ts` (new)               | `AMOUNT_RANGE` / `DATE_RANGE` match modes registered with PrimeVue `FilterService`; pure `inAmountRange` / `inDateRange`                                                                                                                                                                                                                             |
| `frontend/src/composables/useNotify.ts` (modify)         | + `warn`                                                                                                                                                                                                                                                                                                                                             |
| `frontend/src/components/ui/StatusTag.vue` (new)         | `<Tag>` from a `StatusTag`                                                                                                                                                                                                                                                                                                                           |
| `frontend/src/components/ui/AmountRangeFilter.vue` (new) | Two currency inputs (from/to) for a DataTable filter cell                                                                                                                                                                                                                                                                                            |
| `frontend/src/composables/useBatchDownload.ts` (new)     | POST ids, save ZIP, toast + return rejected ids                                                                                                                                                                                                                                                                                                      |
| `frontend/src/components/TemplateCard.vue` (new)         | One template: info, download, upload → preview dialog → save; current preview                                                                                                                                                                                                                                                                        |
| `frontend/src/views/InvoiceView.vue` (rewrite)           | Drafts table + invoices DataTable                                                                                                                                                                                                                                                                                                                    |
| `frontend/src/views/InvoiceDetailView.vue` (rewrite)     | Summary card + revisions accordion + actions                                                                                                                                                                                                                                                                                                         |
| `frontend/src/views/InvoiceFormView.vue` (rewrite)       | New / copy / revision / draft / prefill form                                                                                                                                                                                                                                                                                                         |
| `frontend/src/views/InvoiceSettingsView.vue` (rewrite)   | Tabs: template, email, recipients                                                                                                                                                                                                                                                                                                                    |
| `frontend/src/directives/autogrow.ts` (delete)           | Replaced by `Textarea autoResize`                                                                                                                                                                                                                                                                                                                    |
| Tests                                                    | `format.test.ts`, `statusTags.test.ts` (new), `tableFilters.test.ts` (new), `useNotify.test.ts`, `useBatchDownload.test.ts` (new), `AmountRangeFilter.test.ts` (new), `TemplateCard.test.ts` (new), `InvoiceView.test.ts` (rewrite), `InvoiceDetailView.test.ts` (rewrite), `InvoiceFormView.test.ts` (rewrite), `InvoiceSettingsView.test.ts` (new) |

---

### Task 1: Formatting, status and table-filter helpers

**Files:**

- Modify: `frontend/src/utils/format.ts`, `frontend/src/composables/useNotify.ts`
- Create: `frontend/src/utils/statusTags.ts`, `frontend/src/utils/tableFilters.ts`, `frontend/src/components/ui/StatusTag.vue`
- Test: `frontend/src/__tests__/format.test.ts` (append), `frontend/src/__tests__/statusTags.test.ts`, `frontend/src/__tests__/tableFilters.test.ts`, `frontend/src/__tests__/useNotify.test.ts` (update)

**Interfaces:**

- Produces:
  - `formatDate(iso: string): string` (`dd.mm.yyyy`, de-DE), `formatDateTime(iso: string): string` (de-DE short date + time), `toIsoDate(date: Date): string` (local calendar date → `YYYY-MM-DD`), `fromIsoDate(value: string): Date | null` (`YYYY-MM-DD…` → local midnight; anything else → `null`)
  - `type TagSeverity = 'success' | 'secondary' | 'info' | 'warn' | 'danger'`; `interface StatusTag { label: string; severity: TagSeverity }`
  - `documentStatusTag(status: string)`, `revisionStatusTag(status: string)`, `pdfStatusTag(status: string)`, `emailStatusTag(status: string)` → `StatusTag`
  - `DOCUMENT_STATUS_OPTIONS`, `EMAIL_STATUS_OPTIONS`: `{ label: string; value: string }[]`
  - `AMOUNT_RANGE = 'amountRange'`, `DATE_RANGE = 'dateRange'`; `type AmountRange = [number | null, number | null] | null` (euros); `type DateRange = (Date | null)[] | null`; `inAmountRange(cents: number, range: AmountRange | undefined): boolean`; `inDateRange(iso: string, range: DateRange | undefined): boolean` — both registered with `FilterService` when the module is imported
  - `<StatusTag :tag="StatusTag" />`
  - `useNotify().warn(detail)` → toast `{ severity: 'warn', summary: 'Warning', detail, life: 6000 }`

Status mapping (exact):

| Function            | Input → label / severity                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| `documentStatusTag` | `AKTIV` → Active / success; `STORNIERT` → Cancelled / secondary                                    |
| `revisionStatusTag` | `AKTIV` → Current / info; `ERSETZT` → Superseded / secondary                                       |
| `pdfStatusTag`      | `OK` → PDF ready / success; `PENDING` → PDF pending / secondary; `FAILED` → PDF failed / danger    |
| `emailStatusTag`    | `SENT` → Email sent / success; `FAILED` → Email failed / danger; `NOT_SENT` → Not sent / secondary |
| any unknown value   | label = the value itself, severity secondary                                                       |

- [ ] **Step 1: Write the failing tests**

Append to `frontend/src/__tests__/format.test.ts` (extend the import from `../utils/format` with `formatDate, formatDateTime, fromIsoDate, toIsoDate`):

```ts
describe('date helpers', () => {
  it('formats ISO strings as German dates', () => {
    expect(formatDate('2026-03-01T00:00:00.000Z')).toBe('01.03.2026');
    expect(formatDate('2026-12-24')).toBe('24.12.2026');
  });

  it('formats date and time', () => {
    expect(formatDateTime('2026-03-01T09:05:00')).toMatch(/^01\.03\.26,? 09:05$/);
  });

  it('converts a local date to YYYY-MM-DD', () => {
    expect(toIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(toIsoDate(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });

  it('parses YYYY-MM-DD to local midnight', () => {
    const date = fromIsoDate('2026-03-01');
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(2);
    expect(date?.getDate()).toBe(1);
    expect(date?.getHours()).toBe(0);
    expect(fromIsoDate('2026-03-01T00:00:00.000Z')?.getDate()).toBe(1);
  });

  it.each(['', 'abc', '01.03.2026'])('returns null for %j', (value) => {
    expect(fromIsoDate(value)).toBeNull();
  });
});
```

Create `frontend/src/__tests__/statusTags.test.ts`:

```ts
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import StatusTag from '../components/ui/StatusTag.vue';
import {
  DOCUMENT_STATUS_OPTIONS,
  documentStatusTag,
  EMAIL_STATUS_OPTIONS,
  emailStatusTag,
  pdfStatusTag,
  revisionStatusTag,
} from '../utils/statusTags';
import { withPrimeVue } from './helpers/primeVue';

describe('status tags', () => {
  it.each([
    [documentStatusTag, 'AKTIV', 'Active', 'success'],
    [documentStatusTag, 'STORNIERT', 'Cancelled', 'secondary'],
    [revisionStatusTag, 'AKTIV', 'Current', 'info'],
    [revisionStatusTag, 'ERSETZT', 'Superseded', 'secondary'],
    [pdfStatusTag, 'OK', 'PDF ready', 'success'],
    [pdfStatusTag, 'PENDING', 'PDF pending', 'secondary'],
    [pdfStatusTag, 'FAILED', 'PDF failed', 'danger'],
    [emailStatusTag, 'SENT', 'Email sent', 'success'],
    [emailStatusTag, 'FAILED', 'Email failed', 'danger'],
    [emailStatusTag, 'NOT_SENT', 'Not sent', 'secondary'],
  ])('%o maps %s', (fn, status, label, severity) => {
    expect(fn(status)).toEqual({ label, severity });
  });

  it('falls back to the raw value', () => {
    expect(documentStatusTag('WEIRD')).toEqual({ label: 'WEIRD', severity: 'secondary' });
  });

  it('offers filter options', () => {
    expect(DOCUMENT_STATUS_OPTIONS).toEqual([
      { label: 'Active', value: 'AKTIV' },
      { label: 'Cancelled', value: 'STORNIERT' },
    ]);
    expect(EMAIL_STATUS_OPTIONS.map((o) => o.value)).toEqual(['NOT_SENT', 'SENT', 'FAILED']);
  });

  it('renders a PrimeVue tag', () => {
    const wrapper = mount(StatusTag, {
      props: { tag: { label: 'Active', severity: 'success' } },
      global: withPrimeVue(),
    });
    expect(wrapper.text()).toBe('Active');
    expect(wrapper.classes().join(' ')).toContain('p-tag-success');
  });
});
```

Create `frontend/src/__tests__/tableFilters.test.ts`:

```ts
import { FilterService } from '@primevue/core/api';
import { describe, expect, it } from 'vitest';
import { AMOUNT_RANGE, DATE_RANGE, inAmountRange, inDateRange } from '../utils/tableFilters';

describe('inAmountRange (range in euros, value in cents)', () => {
  it.each([
    [5000, null, true],
    [5000, [null, null], true],
    [5000, [50, null], true],
    [4999, [50, null], false],
    [5000, [null, 50], true],
    [5001, [null, 50], false],
    [1250, [12.5, 12.5], true],
  ] as const)('%i in %j → %s', (cents, range, expected) => {
    expect(inAmountRange(cents, range as never)).toBe(expected);
  });
});

describe('inDateRange (API dates are UTC midnight ISO strings)', () => {
  const march1 = '2026-03-01T00:00:00.000Z';

  it('accepts everything without a range', () => {
    expect(inDateRange(march1, null)).toBe(true);
    expect(inDateRange(march1, [])).toBe(true);
    expect(inDateRange(march1, [null, null])).toBe(true);
  });

  it('includes both ends by calendar day', () => {
    expect(inDateRange(march1, [new Date(2026, 2, 1), new Date(2026, 2, 1)])).toBe(true);
    expect(inDateRange(march1, [new Date(2026, 1, 1), new Date(2026, 2, 1, 23, 0)])).toBe(true);
    expect(inDateRange(march1, [new Date(2026, 2, 2), null])).toBe(false);
    expect(inDateRange(march1, [null, new Date(2026, 1, 28)])).toBe(false);
  });

  it('treats a range with only a start as open-ended', () => {
    expect(inDateRange(march1, [new Date(2026, 0, 1)])).toBe(true);
  });
});

describe('registration', () => {
  it('registers both match modes with PrimeVue', () => {
    expect(FilterService.filters[AMOUNT_RANGE]).toBeTypeOf('function');
    expect(FilterService.filters[DATE_RANGE]).toBeTypeOf('function');
    expect(FilterService.filters[AMOUNT_RANGE](1000, [20, null])).toBe(false);
  });
});
```

In `frontend/src/__tests__/useNotify.test.ts`, add `notify.warn('Careful');` after `notify.info('Heads up');` and insert into the expected array (between info and error):

```ts
      { severity: 'warn', summary: 'Warning', detail: 'Careful', life: 6000 },
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit --workspace=frontend -- format statusTags tableFilters useNotify`
Expected: FAIL (missing exports/modules, `warn` not a function).

- [ ] **Step 3: Implement**

Append to `frontend/src/utils/format.ts`:

```ts
/** Calendar date of an ISO string, German format (e.g. 01.03.2026). */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(iso),
  );
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** Local calendar date as YYYY-MM-DD (what the API expects for date-only fields). */
export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** YYYY-MM-DD (optionally followed by a time) → local midnight of that calendar day. */
export function fromIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}
```

Note: `formatDate('2026-12-24')` parses as UTC midnight; in any European time zone (UTC+0…+3) that is still the 24th. `formatDate` is only used for API date strings, which are UTC-midnight values of the intended day.

Create `frontend/src/utils/statusTags.ts`:

```ts
export type TagSeverity = 'success' | 'secondary' | 'info' | 'warn' | 'danger';

export interface StatusTag {
  label: string;
  severity: TagSeverity;
}

function lookup(map: Record<string, StatusTag>, status: string): StatusTag {
  return map[status] ?? { label: status, severity: 'secondary' };
}

const DOCUMENT: Record<string, StatusTag> = {
  AKTIV: { label: 'Active', severity: 'success' },
  STORNIERT: { label: 'Cancelled', severity: 'secondary' },
};

const REVISION: Record<string, StatusTag> = {
  AKTIV: { label: 'Current', severity: 'info' },
  ERSETZT: { label: 'Superseded', severity: 'secondary' },
};

const PDF: Record<string, StatusTag> = {
  OK: { label: 'PDF ready', severity: 'success' },
  PENDING: { label: 'PDF pending', severity: 'secondary' },
  FAILED: { label: 'PDF failed', severity: 'danger' },
};

const EMAIL: Record<string, StatusTag> = {
  SENT: { label: 'Email sent', severity: 'success' },
  FAILED: { label: 'Email failed', severity: 'danger' },
  NOT_SENT: { label: 'Not sent', severity: 'secondary' },
};

export const documentStatusTag = (status: string) => lookup(DOCUMENT, status);
export const revisionStatusTag = (status: string) => lookup(REVISION, status);
export const pdfStatusTag = (status: string) => lookup(PDF, status);
export const emailStatusTag = (status: string) => lookup(EMAIL, status);

export const DOCUMENT_STATUS_OPTIONS = [
  { label: 'Active', value: 'AKTIV' },
  { label: 'Cancelled', value: 'STORNIERT' },
];

export const EMAIL_STATUS_OPTIONS = [
  { label: 'Not sent', value: 'NOT_SENT' },
  { label: 'Sent', value: 'SENT' },
  { label: 'Failed', value: 'FAILED' },
];
```

Create `frontend/src/utils/tableFilters.ts`:

```ts
import { FilterService } from '@primevue/core/api';
import { toIsoDate } from './format';

/** DataTable match modes for range filters (registered globally on import). */
export const AMOUNT_RANGE = 'amountRange';
export const DATE_RANGE = 'dateRange';

/** [from, to] in euros; either end may be null. */
export type AmountRange = [number | null, number | null] | null;
/** DatePicker range model: [start, end?]; either may be null. */
export type DateRange = (Date | null)[] | null;

export function inAmountRange(cents: number, range: AmountRange | undefined): boolean {
  if (!range) return true;
  const [from, to] = range;
  if (from !== null && cents < Math.round(from * 100)) return false;
  if (to !== null && cents > Math.round(to * 100)) return false;
  return true;
}

/** Compares calendar days; `iso` is an API date (UTC midnight of the intended day). */
export function inDateRange(iso: string, range: DateRange | undefined): boolean {
  if (!range || range.length === 0) return true;
  const day = iso.slice(0, 10);
  const [from, to] = range;
  if (from && day < toIsoDate(from)) return false;
  if (to && day > toIsoDate(to)) return false;
  return true;
}

FilterService.register(AMOUNT_RANGE, (value: number, filter: AmountRange) =>
  inAmountRange(value, filter),
);
FilterService.register(DATE_RANGE, (value: string, filter: DateRange) =>
  inDateRange(value, filter),
);
```

Create `frontend/src/components/ui/StatusTag.vue`:

```vue
<script setup lang="ts">
import Tag from 'primevue/tag';
import type { StatusTag } from '../../utils/statusTags';

defineProps<{ tag: StatusTag }>();
</script>

<template>
  <Tag :value="tag.label" :severity="tag.severity" />
</template>
```

In `frontend/src/composables/useNotify.ts` add (between `info` and `error`):

```ts
    warn: (detail: string) =>
      toast.add({ severity: 'warn', summary: 'Warning', detail, life: 6000 }),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit --workspace=frontend -- format statusTags tableFilters useNotify`
Expected: PASS. If `formatDateTime`'s exact shape differs in Node's ICU (e.g. no comma), the regex already allows an optional comma; report any other difference instead of loosening further.

- [ ] **Step 5: Full verification and commit**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS.

```bash
git add frontend/src/utils/format.ts frontend/src/utils/statusTags.ts frontend/src/utils/tableFilters.ts frontend/src/components/ui/StatusTag.vue frontend/src/composables/useNotify.ts frontend/src/__tests__/format.test.ts frontend/src/__tests__/statusTags.test.ts frontend/src/__tests__/tableFilters.test.ts frontend/src/__tests__/useNotify.test.ts
git commit -m "feat: add date, status tag and table range filter helpers

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Batch download composable and amount range filter

**Files:**

- Create: `frontend/src/composables/useBatchDownload.ts`, `frontend/src/components/ui/AmountRangeFilter.vue`
- Test: `frontend/src/__tests__/useBatchDownload.test.ts`, `frontend/src/__tests__/AmountRangeFilter.test.ts`

**Interfaces:**

- Consumes: `useNotify` (`error`), `AmountRange` (Task 1)
- Produces:
  - `interface BatchDownloadOptions { url: string; fallbackFileName: string; singular: string; plural: string }`
  - `useBatchDownload(options): { download(ids: number[]): Promise<number[]>; downloading: Ref<boolean> }` — resolves with the ids the server rejected (to deselect); `[]` otherwise
  - `<AmountRangeFilter :model-value="AmountRange | undefined" label="Amount" @update:model-value />` — emits `[from, to]` (euros) or `null` when both are empty; inputs `data-testid="amount-from"` / `"amount-to"`

Rejection reasons (exact): `CANCELLED` → `cancelled`, `PDF_NOT_READY` → `PDF not ready`, `NOT_FOUND` → `not found`, anything else → `invalid`. Message: `` `${count} ${count > 1 ? plural : singular} cannot be downloaded: ${reason}. ${count > 1 ? 'They have' : 'It has'} been deselected.` ``. Other failures: `Download failed. Please try again.`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/__tests__/useBatchDownload.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBatchDownload } from '../composables/useBatchDownload';

const { notify } = vi.hoisted(() => ({
  notify: { success: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../composables/useNotify', () => ({ useNotify: () => notify }));

const options = {
  url: '/api/invoice/download-batch',
  fallbackFileName: 'rechnungen.zip',
  singular: 'invoice',
  plural: 'invoices',
};

function okResponse(disposition?: string): Response {
  return {
    ok: true,
    blob: () => Promise.resolve(new Blob(['zip'])),
    headers: new Headers(disposition ? { 'Content-Disposition': disposition } : {}),
  } as unknown as Response;
}

function errorResponse(body: unknown): Response {
  return { ok: false, json: () => Promise.resolve(body) } as unknown as Response;
}

let savedNames: string[];

beforeEach(() => {
  savedNames = [];
  Object.values(notify).forEach((fn) => fn.mockReset());
  vi.stubGlobal('fetch', vi.fn());
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:zip');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    savedNames.push(this.download);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useBatchDownload', () => {
  it('does nothing without ids', async () => {
    const result = await useBatchDownload(options).download([]);
    expect(result).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('posts the ids and saves the zip under the server file name', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse('attachment; filename="invoices-2026.zip"'));

    const result = await useBatchDownload(options).download([1, 2]);

    expect(fetch).toHaveBeenCalledWith('/api/invoice/download-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [1, 2] }),
    });
    expect(savedNames).toEqual(['invoices-2026.zip']);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:zip');
    expect(result).toEqual([]);
  });

  it('falls back to the default file name', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse());
    await useBatchDownload(options).download([1]);
    expect(savedNames).toEqual(['rechnungen.zip']);
  });

  it('returns rejected ids and explains them (plural)', async () => {
    vi.mocked(fetch).mockResolvedValue(errorResponse({ error: 'PDF_NOT_READY', ids: [2, 3] }));

    const result = await useBatchDownload(options).download([1, 2, 3]);

    expect(result).toEqual([2, 3]);
    expect(notify.error).toHaveBeenCalledWith(
      '2 invoices cannot be downloaded: PDF not ready. They have been deselected.',
    );
    expect(savedNames).toEqual([]);
  });

  it.each([
    ['CANCELLED', 'cancelled'],
    ['NOT_FOUND', 'not found'],
    ['SOMETHING', 'invalid'],
  ])('explains %s for a single invoice', async (code, reason) => {
    vi.mocked(fetch).mockResolvedValue(errorResponse({ error: code, ids: [4] }));

    await useBatchDownload(options).download([4]);

    expect(notify.error).toHaveBeenCalledWith(
      `1 invoice cannot be downloaded: ${reason}. It has been deselected.`,
    );
  });

  it('reports other failures', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(errorResponse({ error: 'Boom' }));
    expect(await useBatchDownload(options).download([1])).toEqual([]);
    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
    expect(await useBatchDownload(options).download([1])).toEqual([]);
    expect(notify.error).toHaveBeenCalledTimes(2);
    expect(notify.error).toHaveBeenLastCalledWith('Download failed. Please try again.');
  });

  it('flags the running download', async () => {
    let resolve: (value: Response) => void = () => {};
    vi.mocked(fetch).mockReturnValue(new Promise((r) => (resolve = r)));
    const batch = useBatchDownload(options);

    const pending = batch.download([1]);
    expect(batch.downloading.value).toBe(true);
    resolve(okResponse());
    await pending;
    expect(batch.downloading.value).toBe(false);
  });
});
```

Create `frontend/src/__tests__/AmountRangeFilter.test.ts`:

```ts
import { mount } from '@vue/test-utils';
import InputNumber from 'primevue/inputnumber';
import { describe, expect, it } from 'vitest';
import AmountRangeFilter from '../components/ui/AmountRangeFilter.vue';
import { withPrimeVue } from './helpers/primeVue';

function mountFilter(modelValue: [number | null, number | null] | null) {
  return mount(AmountRangeFilter, {
    props: { modelValue, label: 'Amount' },
    global: withPrimeVue(),
  });
}

describe('AmountRangeFilter', () => {
  it('renders from/to inputs with labels', () => {
    const wrapper = mountFilter(null);
    expect(wrapper.find('[data-testid="amount-from"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="amount-to"]').exists()).toBe(true);
    expect(wrapper.html()).toContain('Amount from');
    expect(wrapper.html()).toContain('Amount to');
  });

  it('emits the range when one end changes', () => {
    const wrapper = mountFilter(null);
    wrapper.findAllComponents(InputNumber)[0].vm.$emit('update:modelValue', 10);
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([[10, null]]);
  });

  it('keeps the other end', () => {
    const wrapper = mountFilter([10, null]);
    wrapper.findAllComponents(InputNumber)[1].vm.$emit('update:modelValue', 50);
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([[10, 50]]);
  });

  it('emits null when both ends are cleared', () => {
    const wrapper = mountFilter([10, null]);
    wrapper.findAllComponents(InputNumber)[0].vm.$emit('update:modelValue', null);
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([null]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit --workspace=frontend -- useBatchDownload AmountRangeFilter`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

Create `frontend/src/composables/useBatchDownload.ts`:

```ts
import { ref } from 'vue';
import { useNotify } from './useNotify';

export interface BatchDownloadOptions {
  url: string;
  fallbackFileName: string;
  singular: string;
  plural: string;
}

const REASONS: Record<string, string> = {
  CANCELLED: 'cancelled',
  PDF_NOT_READY: 'PDF not ready',
  NOT_FOUND: 'not found',
};

function fileNameFrom(disposition: string | null, fallback: string): string {
  const match = disposition?.match(/filename="(.+)"/);
  return match ? match[1] : fallback;
}

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/** Downloads the PDFs of several documents as one ZIP. */
export function useBatchDownload(options: BatchDownloadOptions) {
  const notify = useNotify();
  const downloading = ref(false);

  /** Resolves with the ids the server rejected, so the caller can deselect them. */
  async function download(ids: number[]): Promise<number[]> {
    if (ids.length === 0) return [];
    downloading.value = true;
    try {
      const res = await fetch(options.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; ids?: unknown };
        if (Array.isArray(body.ids)) {
          const rejected = body.ids as number[];
          const count = rejected.length;
          const reason = REASONS[body.error ?? ''] ?? 'invalid';
          notify.error(
            `${count} ${count > 1 ? options.plural : options.singular} cannot be downloaded: ${reason}. ${count > 1 ? 'They have' : 'It has'} been deselected.`,
          );
          return rejected;
        }
        notify.error('Download failed. Please try again.');
        return [];
      }
      saveBlob(
        await res.blob(),
        fileNameFrom(res.headers.get('Content-Disposition'), options.fallbackFileName),
      );
      return [];
    } catch {
      notify.error('Download failed. Please try again.');
      return [];
    } finally {
      downloading.value = false;
    }
  }

  return { download, downloading };
}
```

Create `frontend/src/components/ui/AmountRangeFilter.vue`:

```vue
<script setup lang="ts">
import InputNumber from 'primevue/inputnumber';
import type { AmountRange } from '../../utils/tableFilters';

const props = defineProps<{
  modelValue: AmountRange | undefined;
  label: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: AmountRange];
}>();

function update(index: 0 | 1, value: number | null) {
  const next: [number | null, number | null] = [
    props.modelValue?.[0] ?? null,
    props.modelValue?.[1] ?? null,
  ];
  next[index] = value;
  emit('update:modelValue', next[0] === null && next[1] === null ? null : next);
}
</script>

<template>
  <div class="amount-range">
    <InputNumber
      :model-value="modelValue?.[0] ?? null"
      mode="currency"
      currency="EUR"
      locale="de-DE"
      size="small"
      placeholder="from"
      :aria-label="`${label} from`"
      data-testid="amount-from"
      @update:model-value="(value: number | null) => update(0, value)"
    />
    <InputNumber
      :model-value="modelValue?.[1] ?? null"
      mode="currency"
      currency="EUR"
      locale="de-DE"
      size="small"
      placeholder="to"
      :aria-label="`${label} to`"
      data-testid="amount-to"
      @update:model-value="(value: number | null) => update(1, value)"
    />
  </div>
</template>

<style scoped>
.amount-range {
  display: flex;
  gap: 0.25rem;
  min-width: 12rem;
}

.amount-range :deep(input) {
  width: 6rem;
}
</style>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit --workspace=frontend -- useBatchDownload AmountRangeFilter`
Expected: PASS. If the `aria-label` lands on the InputNumber's inner `<input>` (expected) the `html()` assertions pass; if PrimeVue puts it elsewhere, keep the assertion on `wrapper.html()` (it searches the whole subtree).

- [ ] **Step 5: Full verification and commit**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS.

```bash
git add frontend/src/composables/useBatchDownload.ts frontend/src/components/ui/AmountRangeFilter.vue frontend/src/__tests__/useBatchDownload.test.ts frontend/src/__tests__/AmountRangeFilter.test.ts
git commit -m "feat: add batch download composable and amount range filter

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Invoice list

**Files:**

- Rewrite: `frontend/src/views/InvoiceView.vue`
- Rewrite: `frontend/src/__tests__/InvoiceView.test.ts`

**Interfaces:**

- Consumes: Tasks 1–2 helpers; `PageHeader`; `TABLE_DEFAULTS`, `globalFilter`; `useNotify`; `useAppStore().invoiceTemplateAvailable`
- Produces (test hooks): invoice rows have class `invoice-row`, draft rows `draft-row`; `data-testid`s `drafts-section`, `global-search`, `clear-filters`, `download-selected`, `new-invoice`, `copy-invoice`, `no-template-warning`; script bindings `filters` (DataTableFilterMeta), `selection` (InvoiceListItem[])

Behavior: default filter `status = AKTIV` (cancelled hidden); "Clear filters" restores the defaults; row click opens `/invoice/:id` unless the click came from a checkbox, button, link or input; draft row click opens `/invoice/draft/:id`; "Copy" opens `/invoice/new?copyFrom=:id`.

- [ ] **Step 1: Write the failing test**

Replace `frontend/src/__tests__/InvoiceView.test.ts` with:

```ts
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import type { DataTableFilterMeta } from 'primevue/datatable';
import type { InvoiceDraftListItem, InvoiceListItem } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRouter } from 'vue-router';
import { useAppStore } from '../stores/app';
import InvoiceView from '../views/InvoiceView.vue';
import { withPrimeVue } from './helpers/primeVue';

const { notify, download } = vi.hoisted(() => ({
  notify: { success: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  download: vi.fn(),
}));

vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRouter: vi.fn(),
}));
vi.mock('../composables/useNotify', () => ({ useNotify: () => notify }));
vi.mock('../composables/useBatchDownload', () => ({
  useBatchDownload: () => ({ download, downloading: false }),
}));

interface ViewVM {
  filters: DataTableFilterMeta;
  selection: InvoiceListItem[];
}

function vm(wrapper: VueWrapper): ViewVM {
  return wrapper.vm as unknown as ViewVM;
}

function invoice(overrides: Partial<InvoiceListItem>): InvoiceListItem {
  return {
    id: 1,
    number: '1 / 2026',
    status: 'AKTIV',
    recipientName: 'Anna Alt',
    amountCents: 11900,
    invoiceDate: '2026-01-15T00:00:00.000Z',
    createdAt: '2026-01-15T10:00:00.000Z',
    activeRevisionNumber: 1,
    emailStatus: 'NOT_SENT',
    ...overrides,
  };
}

const invoices: InvoiceListItem[] = [
  invoice({ id: 1 }),
  invoice({
    id: 2,
    number: '2 / 2026',
    recipientName: 'Bernd Bach',
    amountCents: 5950,
    invoiceDate: '2026-03-01T00:00:00.000Z',
    emailStatus: 'SENT',
  }),
  invoice({
    id: 3,
    number: '3 / 2026',
    recipientName: 'Clara Cord',
    amountCents: 23800,
    invoiceDate: '2026-02-10T00:00:00.000Z',
    status: 'STORNIERT',
  }),
];

let drafts: InvoiceDraftListItem[];
const push = vi.fn();

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: () => Promise.resolve(body) } as Response;
}

async function mountView() {
  const wrapper = mount(InvoiceView, {
    global: withPrimeVue({ stubs: { RouterLink: { template: '<a><slot /></a>' } } }),
  });
  await flushPromises();
  return wrapper;
}

function rows(wrapper: VueWrapper) {
  return wrapper.findAll('.invoice-row');
}

async function setFilter(wrapper: VueWrapper, field: string, value: unknown) {
  const current = vm(wrapper).filters[field] as { matchMode: string };
  vm(wrapper).filters = { ...vm(wrapper).filters, [field]: { ...current, value } };
  await flushPromises();
}

beforeEach(() => {
  drafts = [];
  push.mockReset();
  download.mockReset();
  Object.values(notify).forEach((fn) => fn.mockReset());
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url === '/api/invoice?withCancelled=true') return Promise.resolve(jsonResponse(invoices));
      if (url === '/api/invoice-draft') return Promise.resolve(jsonResponse(drafts));
      return Promise.resolve(jsonResponse({}, false));
    }),
  );
  vi.mocked(useRouter).mockReturnValue({ push } as unknown as ReturnType<typeof useRouter>);
  setActivePinia(createPinia());
  useAppStore().invoiceTemplateAvailable = true;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('InvoiceView', () => {
  it('loads all invoices (incl. cancelled) and drafts once', async () => {
    await mountView();
    expect(fetch).toHaveBeenCalledWith('/api/invoice?withCancelled=true');
    expect(fetch).toHaveBeenCalledWith('/api/invoice-draft');
  });

  it('shows the heading and actions', async () => {
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="page-title"]').text()).toBe('Invoices');
    expect(wrapper.text()).toContain('Settings');
    expect(wrapper.find('[data-testid="new-invoice"]').text()).toContain('New Invoice');
  });

  it('hides cancelled invoices by default', async () => {
    const wrapper = await mountView();
    expect(rows(wrapper)).toHaveLength(2);
    expect(wrapper.text()).not.toContain('Clara Cord');
  });

  it('shows cancelled invoices when the status filter is cleared', async () => {
    const wrapper = await mountView();
    await setFilter(wrapper, 'status', null);
    expect(rows(wrapper)).toHaveLength(3);
    expect(wrapper.text()).toContain('Cancelled');
  });

  it('searches by recipient or number', async () => {
    const wrapper = await mountView();
    await wrapper.find('[data-testid="global-search"]').setValue('bach');
    await flushPromises();
    expect(rows(wrapper)).toHaveLength(1);
    expect(rows(wrapper)[0].text()).toContain('Bernd Bach');
  });

  it('filters by amount range in euros', async () => {
    const wrapper = await mountView();
    await setFilter(wrapper, 'amountCents', [100, null]);
    expect(rows(wrapper)).toHaveLength(1);
    expect(rows(wrapper)[0].text()).toContain('Anna Alt');
  });

  it('filters by date range', async () => {
    const wrapper = await mountView();
    await setFilter(wrapper, 'invoiceDate', [new Date(2026, 1, 1), new Date(2026, 2, 1)]);
    expect(rows(wrapper)).toHaveLength(1);
    expect(rows(wrapper)[0].text()).toContain('Bernd Bach');
  });

  it('clears filters back to the defaults', async () => {
    const wrapper = await mountView();
    await wrapper.find('[data-testid="global-search"]').setValue('bach');
    await flushPromises();
    await wrapper.find('[data-testid="clear-filters"]').trigger('click');
    await flushPromises();
    expect(rows(wrapper)).toHaveLength(2);
    expect((wrapper.find('[data-testid="global-search"]').element as HTMLInputElement).value).toBe(
      '',
    );
  });

  it('shows amount, date, revision and status tags', async () => {
    const wrapper = await mountView();
    const first = rows(wrapper)[0].text();
    expect(first).toContain('1 / 2026');
    expect(first).toContain('119,00');
    expect(first).toContain('15.01.2026');
    expect(first).toContain('R1');
    expect(first).toContain('Active');
    expect(rows(wrapper)[1].text()).toContain('Email sent');
  });

  it('opens an invoice on row click', async () => {
    const wrapper = await mountView();
    await rows(wrapper)[1].trigger('click');
    expect(push).toHaveBeenCalledWith('/invoice/2');
  });

  it('does not open the invoice when its checkbox is clicked', async () => {
    const wrapper = await mountView();
    const checkbox = rows(wrapper)[0].find('input[type="checkbox"]');
    await checkbox.trigger('click');
    await flushPromises();
    expect(push).not.toHaveBeenCalled();
    expect(vm(wrapper).selection.map((i) => i.id)).toEqual([1]);
  });

  it('copies an invoice without opening it', async () => {
    const wrapper = await mountView();
    await wrapper.findAll('[data-testid="copy-invoice"]')[0].trigger('click');
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/invoice/new?copyFrom=1');
  });

  it('downloads the selection and deselects rejected invoices', async () => {
    download.mockResolvedValue([2]);
    const wrapper = await mountView();
    vm(wrapper).selection = [invoices[0], invoices[1]];
    await flushPromises();

    const button = wrapper.find('[data-testid="download-selected"]');
    expect(button.text()).toContain('Download selected (2)');
    await button.trigger('click');
    await flushPromises();

    expect(download).toHaveBeenCalledWith([1, 2]);
    expect(vm(wrapper).selection.map((i) => i.id)).toEqual([1]);
  });

  it('disables download without a selection', async () => {
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="download-selected"]').attributes('disabled')).toBeDefined();
  });

  it('shows drafts above the invoices and opens them', async () => {
    drafts = [
      {
        id: 9,
        recipientName: 'Dora Drei',
        title: '',
        amountCents: 1000,
        updatedAt: '2026-10-01T10:00:00Z',
      },
    ];
    const wrapper = await mountView();

    const section = wrapper.find('[data-testid="drafts-section"]');
    expect(section.text()).toContain('Drafts (1)');
    expect(section.text()).toContain('Dora Drei');
    expect(section.text()).toContain('—');
    await wrapper.find('.draft-row').trigger('click');
    expect(push).toHaveBeenCalledWith('/invoice/draft/9');
  });

  it('has no drafts section without drafts', async () => {
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="drafts-section"]').exists()).toBe(false);
  });

  it('warns and blocks new invoices without a template', async () => {
    useAppStore().invoiceTemplateAvailable = false;
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="no-template-warning"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="new-invoice"]').attributes('disabled')).toBeDefined();
  });

  it('reports a load error', async () => {
    vi.mocked(fetch).mockImplementation(() => Promise.reject(new Error('offline')));
    await mountView();
    expect(notify.error).toHaveBeenCalledWith('Error loading invoices');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit --workspace=frontend -- InvoiceView`
Expected: FAIL (old view has no `.invoice-row`, `filters`, testids).

- [ ] **Step 3: Rewrite the view**

Replace `frontend/src/views/InvoiceView.vue` with:

```vue
<script setup lang="ts">
import { FilterMatchMode } from '@primevue/core/api';
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable, {
  type DataTableFilterMeta,
  type DataTableFilterMetaData,
  type DataTableRowClickEvent,
} from 'primevue/datatable';
import DatePicker from 'primevue/datepicker';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import type { InvoiceDraftListItem, InvoiceListItem } from 'shared';
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import AmountRangeFilter from '../components/ui/AmountRangeFilter.vue';
import PageHeader from '../components/ui/PageHeader.vue';
import StatusTag from '../components/ui/StatusTag.vue';
import { useBatchDownload } from '../composables/useBatchDownload';
import { useNotify } from '../composables/useNotify';
import { useAppStore } from '../stores/app';
import { formatCents, formatDate } from '../utils/format';
import {
  DOCUMENT_STATUS_OPTIONS,
  documentStatusTag,
  EMAIL_STATUS_OPTIONS,
  emailStatusTag,
} from '../utils/statusTags';
import { globalFilter, TABLE_DEFAULTS } from '../utils/tableDefaults';
import { AMOUNT_RANGE, DATE_RANGE } from '../utils/tableFilters';

const router = useRouter();
const store = useAppStore();
const notify = useNotify();

const invoices = ref<InvoiceListItem[]>([]);
const drafts = ref<InvoiceDraftListItem[]>([]);
const loading = ref(false);
const selection = ref<InvoiceListItem[]>([]);

function defaultFilters(): DataTableFilterMeta {
  return {
    ...globalFilter(),
    number: { value: null, matchMode: FilterMatchMode.CONTAINS },
    recipientName: { value: null, matchMode: FilterMatchMode.CONTAINS },
    amountCents: { value: null, matchMode: AMOUNT_RANGE },
    invoiceDate: { value: null, matchMode: DATE_RANGE },
    emailStatus: { value: null, matchMode: FilterMatchMode.EQUALS },
    status: { value: 'AKTIV', matchMode: FilterMatchMode.EQUALS },
  };
}

const filters = ref<DataTableFilterMeta>(defaultFilters());

const globalSearch = computed<string>({
  get: () => ((filters.value.global as DataTableFilterMetaData).value as string | null) ?? '',
  set: (value) => {
    filters.value = {
      ...filters.value,
      global: { value: value || null, matchMode: FilterMatchMode.CONTAINS },
    };
  },
});

function clearFilters() {
  filters.value = defaultFilters();
}

const { download, downloading } = useBatchDownload({
  url: '/api/invoice/download-batch',
  fallbackFileName: 'rechnungen.zip',
  singular: 'invoice',
  plural: 'invoices',
});

async function downloadSelected() {
  const rejected = new Set(await download(selection.value.map((i) => i.id)));
  if (rejected.size > 0) selection.value = selection.value.filter((i) => !rejected.has(i.id));
}

async function loadInvoices() {
  loading.value = true;
  try {
    const res = await fetch('/api/invoice?withCancelled=true');
    if (!res.ok) throw new Error('load failed');
    invoices.value = await res.json();
  } catch {
    notify.error('Error loading invoices');
  } finally {
    loading.value = false;
  }
}

async function loadDrafts() {
  try {
    const res = await fetch('/api/invoice-draft');
    if (res.ok) drafts.value = await res.json();
  } catch {
    notify.error('Error loading drafts');
  }
}

onMounted(() => {
  void loadInvoices();
  void loadDrafts();
});

/** Clicks on checkboxes, buttons, links and inputs belong to that control, not to the row. */
function isControlClick(event: Event): boolean {
  const target = event.target as HTMLElement | null;
  return !!target?.closest('.p-checkbox, button, a, input');
}

function onInvoiceRowClick(event: DataTableRowClickEvent<InvoiceListItem>) {
  if (isControlClick(event.originalEvent)) return;
  router.push(`/invoice/${event.data.id}`);
}

function onDraftRowClick(event: DataTableRowClickEvent<InvoiceDraftListItem>) {
  if (isControlClick(event.originalEvent)) return;
  router.push(`/invoice/draft/${event.data.id}`);
}
</script>

<template>
  <div class="page">
    <PageHeader title="Invoices">
      <template #actions>
        <Button
          :label="`Download selected (${selection.length})`"
          icon="pi pi-download"
          severity="secondary"
          outlined
          :disabled="selection.length === 0"
          :loading="downloading"
          data-testid="download-selected"
          @click="downloadSelected"
        />
        <Button
          label="Settings"
          icon="pi pi-cog"
          severity="secondary"
          outlined
          @click="router.push('/invoice/settings')"
        />
        <Button
          label="New Invoice"
          icon="pi pi-plus"
          :disabled="!store.invoiceTemplateAvailable"
          :title="
            store.invoiceTemplateAvailable
              ? undefined
              : 'Please upload an invoice template in Settings first'
          "
          data-testid="new-invoice"
          @click="router.push('/invoice/new')"
        />
      </template>
    </PageHeader>

    <div class="stack">
      <Message
        v-if="store.invoiceTemplateAvailable === false"
        severity="warn"
        data-testid="no-template-warning"
      >
        No invoice template uploaded. Please upload a template before creating invoices.
        <RouterLink to="/invoice/settings">Go to Settings →</RouterLink>
      </Message>

      <section v-if="drafts.length > 0" data-testid="drafts-section" class="stack gap-sm">
        <h3 class="section-title">Drafts ({{ drafts.length }})</h3>
        <DataTable
          :value="drafts"
          data-key="id"
          size="small"
          row-hover
          :row-class="() => 'draft-row'"
          @row-click="onDraftRowClick"
        >
          <Column field="recipientName" header="Recipient" sortable />
          <Column field="title" header="Title">
            <template #body="{ data }">{{ data.title || '—' }}</template>
          </Column>
          <Column field="amountCents" header="Amount" sortable class="col-amount">
            <template #body="{ data }">{{ formatCents(data.amountCents) }}</template>
          </Column>
          <Column field="updatedAt" header="Last edited" sortable>
            <template #body="{ data }">{{ formatDate(data.updatedAt) }}</template>
          </Column>
          <Column header="Status">
            <template #body><Tag value="Draft" severity="warn" /></template>
          </Column>
        </DataTable>
      </section>

      <DataTable
        v-model:selection="selection"
        v-model:filters="filters"
        :value="invoices"
        data-key="id"
        v-bind="TABLE_DEFAULTS"
        :global-filter-fields="['number', 'recipientName']"
        :loading="loading"
        row-hover
        :row-class="() => 'invoice-row'"
        @row-click="onInvoiceRowClick"
      >
        <template #header>
          <div class="row row--between">
            <IconField>
              <InputIcon class="pi pi-search" />
              <InputText
                v-model="globalSearch"
                placeholder="Search by name or number…"
                aria-label="Search invoices"
                data-testid="global-search"
              />
            </IconField>
            <Button
              label="Clear filters"
              icon="pi pi-filter-slash"
              text
              data-testid="clear-filters"
              @click="clearFilters"
            />
          </div>
        </template>
        <template #empty>No invoices found.</template>

        <Column selection-mode="multiple" header-style="width: 3rem" />
        <Column field="number" header="Number" sortable :show-filter-menu="false">
          <template #body="{ data }">
            <RouterLink :to="`/invoice/${data.id}`" class="mono">{{ data.number }}</RouterLink>
          </template>
          <template #filter="{ filterModel, filterCallback }">
            <InputText
              v-model="filterModel.value"
              size="small"
              placeholder="Number"
              aria-label="Filter by number"
              @input="filterCallback()"
            />
          </template>
        </Column>
        <Column field="recipientName" header="Recipient" sortable :show-filter-menu="false">
          <template #filter="{ filterModel, filterCallback }">
            <InputText
              v-model="filterModel.value"
              size="small"
              placeholder="Recipient"
              aria-label="Filter by recipient"
              @input="filterCallback()"
            />
          </template>
        </Column>
        <Column
          field="amountCents"
          header="Amount"
          sortable
          :show-filter-menu="false"
          class="col-amount"
        >
          <template #body="{ data }">{{ formatCents(data.amountCents) }}</template>
          <template #filter="{ filterModel, filterCallback }">
            <AmountRangeFilter
              :model-value="filterModel.value"
              label="Amount"
              @update:model-value="
                (value) => {
                  filterModel.value = value;
                  filterCallback();
                }
              "
            />
          </template>
        </Column>
        <Column field="invoiceDate" header="Invoice Date" sortable :show-filter-menu="false">
          <template #body="{ data }">{{ formatDate(data.invoiceDate) }}</template>
          <template #filter="{ filterModel, filterCallback }">
            <DatePicker
              v-model="filterModel.value"
              selection-mode="range"
              :manual-input="false"
              date-format="dd.mm.yy"
              show-button-bar
              size="small"
              placeholder="Date range"
              aria-label="Filter by invoice date"
              @update:model-value="filterCallback()"
            />
          </template>
        </Column>
        <Column field="activeRevisionNumber" header="Rev.">
          <template #body="{ data }">R{{ data.activeRevisionNumber ?? '–' }}</template>
        </Column>
        <Column field="emailStatus" header="Email" :show-filter-menu="false">
          <template #body="{ data }"
            ><StatusTag :tag="emailStatusTag(data.emailStatus)"
          /></template>
          <template #filter="{ filterModel, filterCallback }">
            <Select
              v-model="filterModel.value"
              :options="EMAIL_STATUS_OPTIONS"
              option-label="label"
              option-value="value"
              placeholder="Any"
              show-clear
              size="small"
              aria-label="Filter by email status"
              @change="filterCallback()"
            />
          </template>
        </Column>
        <Column field="status" header="Status" :show-filter-menu="false">
          <template #body="{ data }"><StatusTag :tag="documentStatusTag(data.status)" /></template>
          <template #filter="{ filterModel, filterCallback }">
            <Select
              v-model="filterModel.value"
              :options="DOCUMENT_STATUS_OPTIONS"
              option-label="label"
              option-value="value"
              placeholder="All"
              show-clear
              size="small"
              aria-label="Filter by status"
              @change="filterCallback()"
            />
          </template>
        </Column>
        <Column header-style="width: 6rem">
          <template #body="{ data }">
            <Button
              label="Copy"
              icon="pi pi-copy"
              size="small"
              text
              data-testid="copy-invoice"
              @click.stop="router.push(`/invoice/new?copyFrom=${data.id}`)"
            />
          </template>
        </Column>
      </DataTable>
    </div>
  </div>
</template>

<style scoped>
.section-title {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.875rem;
}

:deep(.invoice-row),
:deep(.draft-row) {
  cursor: pointer;
}

:deep(.col-amount) {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
```

Notes for the implementer:

- `DataTableRowClickEvent` is generic in PrimeVue 5 (`DataTableRowClickEvent<T>`); if it is not, use `DataTableRowClickEvent` and cast `event.data as InvoiceListItem`.
- If vue-tsc rejects the inline arrow in the `AmountRangeFilter` handler, move it to a script function `setAmountFilter(filterModel: { value: unknown }, filterCallback: () => void, value: AmountRange)`.
- Keep `RouterLink` imported from `vue-router` (tests stub it by name).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit --workspace=frontend -- InvoiceView`
Expected: PASS. If a filter test fails because PrimeVue skips a custom match mode for a non-blank array value, check `node_modules/primevue/datatable` `filter()` and report the actual behavior before changing the approach.

- [ ] **Step 5: Full verification and commit**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS.

```bash
git add frontend/src/views/InvoiceView.vue frontend/src/__tests__/InvoiceView.test.ts
git commit -m "feat: rebuild invoice list with PrimeVue data table

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Invoice detail

**Files:**

- Rewrite: `frontend/src/views/InvoiceDetailView.vue`
- Rewrite: `frontend/src/__tests__/InvoiceDetailView.test.ts`

**Interfaces:**

- Consumes: `PageHeader`, `StatusTag` + tag functions, `formatCents`, `formatDate`, `formatDateTime`, `useNotify`, `useConfirmAction`
- Produces (test hooks): `data-testid`s `invoice-status`, `new-revision`, `duplicate`, `cancel-invoice`, `load-error`, `line-item-text` (span, exact text), `download-pdf`, `retry-pdf`, `send-test-email`, `send-email`; class `line-items__text` (`white-space: pre-line`)

Behavior (unchanged rules, new feedback):

- Header: `Invoice {number}`; actions Back → `/invoice`; New Revision (only `AKTIV`) → `/invoice/:id/revision`; Duplicate → `/invoice/new?copyFrom=:id`; Cancel invoice (only `AKTIV`) → **confirm** (danger) then `PATCH /api/invoice/:id/cancel`.
- Revisions in an `Accordion` (`multiple`, `lazy`), newest (`revisions[0]`) expanded on first load.
- Per revision: facts grid; failed-PDF message with optional tech details; line items; Download PDF (`pdfStatus === 'OK'`) → `window.open('/api/invoice/revision/:revId/download', '_blank')`; Regenerate PDF (`FAILED` and revision `AKTIV`) → `POST …/retry-pdf`; Send Test Email (PDF OK, invoice AKTIV, latest revision) → `POST …/send-test-email`; Send via Email (same + `emailStatus !== 'SENT'`) → **confirm** then `POST …/send-email`; email status tag when not `NOT_SENT`, plus the error text when `FAILED`.
- Toasts: cancel ok `Invoice cancelled` / error `err.error || 'Error cancelling'`; retry ok `PDF generated successfully` / error `result.error || 'Error on retry'`; email ok `Email sent successfully` / error `result.emailError || 'Error sending email'`; test ok `Test email sent to configured test address` / error `result.emailError || 'Error sending test email'`; network errors `Network error`. Reload after each success.

- [ ] **Step 1: Write the failing test**

Replace `frontend/src/__tests__/InvoiceDetailView.test.ts` with:

```ts
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import type { InvoiceDto, InvoiceRevisionDto } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRoute, useRouter } from 'vue-router';
import InvoiceDetailView from '../views/InvoiceDetailView.vue';
import { withPrimeVue } from './helpers/primeVue';

const { notify, confirmAction } = vi.hoisted(() => ({
  notify: { success: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  confirmAction: vi.fn(),
}));

vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRoute: vi.fn(),
  useRouter: vi.fn(),
}));
vi.mock('../composables/useNotify', () => ({ useNotify: () => notify }));
vi.mock('../composables/useConfirmAction', () => ({
  useConfirmAction: () => ({ confirmAction }),
}));

function revision(overrides: Partial<InvoiceRevisionDto>): InvoiceRevisionDto {
  return {
    id: 11,
    revisionNumber: 1,
    status: 'AKTIV',
    pdfStatus: 'OK',
    pdfError: null,
    pdfTechError: null,
    emailStatus: 'NOT_SENT',
    emailError: null,
    inputs: {
      salutation: '',
      name: 'Anna Alt',
      street: 'Hauptstr. 1',
      city: '12345 Berlin',
      invoiceDate: '2026-10-05T00:00:00.000Z',
      title: 'Raummiete',
      lineItems: [{ text: 'Raummiete 6 Monate\n7,5 h/Woche', priceInCents: 182813 }],
      vat: 19,
      directDebit: false,
      email: 'anna@example.org',
      emailSalutation: 'Hallo',
    },
    filePath: null,
    createdAt: '2026-10-05T10:00:00.000Z',
    ...overrides,
  };
}

function makeInvoice(overrides: Partial<InvoiceDto> = {}): InvoiceDto {
  return {
    id: 1,
    number: '1 / 2026',
    status: 'AKTIV',
    recipient: {
      id: 7,
      name: 'Anna Alt',
      street: 'Hauptstr. 1',
      city: '12345 Berlin',
      email: null,
      salutation: null,
    },
    invoiceDate: '2026-10-05T00:00:00.000Z',
    createdAt: '2026-10-05T10:00:00.000Z',
    activeRevision: null,
    revisions: [revision({})],
    ...overrides,
  };
}

type Reply = { status: number; body?: unknown };
let replies: Record<string, Reply>;
const push = vi.fn();

const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  const key = `${init?.method ?? 'GET'} ${url}`;
  const reply = replies[key];
  if (!reply) throw new Error(`Unexpected fetch: ${key}`);
  return {
    ok: reply.status < 400,
    status: reply.status,
    json: () => Promise.resolve(reply.body),
  } as Response;
});

function calls(): string[] {
  return fetchMock.mock.calls.map(([url, init]) => `${init?.method ?? 'GET'} ${url}`);
}

async function mountView(): Promise<VueWrapper> {
  const wrapper = mount(InvoiceDetailView, {
    global: withPrimeVue({ stubs: { RouterLink: { template: '<a><slot /></a>' } } }),
  });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  replies = { 'GET /api/invoice/1': { status: 200, body: makeInvoice() } };
  fetchMock.mockClear();
  push.mockReset();
  confirmAction.mockReset().mockResolvedValue(true);
  Object.values(notify).forEach((fn) => fn.mockReset());
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(useRoute).mockReturnValue({ params: { id: '1' } } as unknown as ReturnType<
    typeof useRoute
  >);
  vi.mocked(useRouter).mockReturnValue({ push } as unknown as ReturnType<typeof useRouter>);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('InvoiceDetailView', () => {
  it('shows number, status and the newest revision expanded', async () => {
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="page-title"]').text()).toBe('Invoice 1 / 2026');
    expect(wrapper.find('[data-testid="invoice-status"]').text()).toBe('Active');
    expect(wrapper.text()).toContain('Revision 1');
    expect(wrapper.text()).toContain('2.175,47');
  });

  it('keeps line breaks in line item texts', async () => {
    const wrapper = await mountView();
    const text = wrapper.find('[data-testid="line-item-text"]');
    expect(text.classes()).toContain('line-items__text');
    expect(text.element.textContent).toBe('Raummiete 6 Monate\n7,5 h/Woche');
  });

  it('expands only the newest of several revisions', async () => {
    replies['GET /api/invoice/1'] = {
      status: 200,
      body: makeInvoice({
        revisions: [
          revision({ id: 12, revisionNumber: 2 }),
          revision({ id: 11, revisionNumber: 1, status: 'ERSETZT' }),
        ],
      }),
    };
    const wrapper = await mountView();
    expect(wrapper.text()).toContain('Revision 2');
    expect(wrapper.text()).toContain('Revision 1');
    expect(wrapper.findAll('[data-testid="line-item-text"]')).toHaveLength(1);
  });

  it('cancels after confirmation and reloads', async () => {
    replies['PATCH /api/invoice/1/cancel'] = { status: 200, body: {} };
    const wrapper = await mountView();

    await wrapper.find('[data-testid="cancel-invoice"]').trigger('click');
    await flushPromises();

    expect(confirmAction).toHaveBeenCalledWith(expect.objectContaining({ danger: true }));
    expect(calls()).toEqual([
      'GET /api/invoice/1',
      'PATCH /api/invoice/1/cancel',
      'GET /api/invoice/1',
    ]);
    expect(notify.success).toHaveBeenCalledWith('Invoice cancelled');
  });

  it('does not cancel when the confirmation is declined', async () => {
    confirmAction.mockResolvedValue(false);
    const wrapper = await mountView();
    await wrapper.find('[data-testid="cancel-invoice"]').trigger('click');
    await flushPromises();
    expect(calls()).toEqual(['GET /api/invoice/1']);
  });

  it('shows the cancel error', async () => {
    replies['PATCH /api/invoice/1/cancel'] = { status: 400, body: { error: 'Already cancelled' } };
    const wrapper = await mountView();
    await wrapper.find('[data-testid="cancel-invoice"]').trigger('click');
    await flushPromises();
    expect(notify.error).toHaveBeenCalledWith('Already cancelled');
  });

  it('hides revision and cancel actions for cancelled invoices', async () => {
    replies['GET /api/invoice/1'] = { status: 200, body: makeInvoice({ status: 'STORNIERT' }) };
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="new-revision"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="cancel-invoice"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="duplicate"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="send-email"]').exists()).toBe(false);
  });

  it('sends the email only after confirmation', async () => {
    replies['POST /api/invoice/revision/11/send-email'] = { status: 200, body: {} };
    const wrapper = await mountView();

    confirmAction.mockResolvedValueOnce(false);
    await wrapper.find('[data-testid="send-email"]').trigger('click');
    await flushPromises();
    expect(calls()).not.toContain('POST /api/invoice/revision/11/send-email');

    await wrapper.find('[data-testid="send-email"]').trigger('click');
    await flushPromises();
    expect(calls()).toContain('POST /api/invoice/revision/11/send-email');
    expect(notify.success).toHaveBeenCalledWith('Email sent successfully');
  });

  it('sends a test email without confirmation', async () => {
    replies['POST /api/invoice/revision/11/send-test-email'] = {
      status: 400,
      body: { emailError: 'SMTP down' },
    };
    const wrapper = await mountView();
    await wrapper.find('[data-testid="send-test-email"]').trigger('click');
    await flushPromises();
    expect(confirmAction).not.toHaveBeenCalled();
    expect(notify.error).toHaveBeenCalledWith('SMTP down');
  });

  it('offers PDF regeneration for a failed PDF', async () => {
    replies['GET /api/invoice/1'] = {
      status: 200,
      body: makeInvoice({
        revisions: [
          revision({ pdfStatus: 'FAILED', pdfError: 'Template broken', pdfTechError: 'stack' }),
        ],
      }),
    };
    replies['POST /api/invoice/revision/11/retry-pdf'] = { status: 200, body: {} };
    const wrapper = await mountView();

    expect(wrapper.text()).toContain('Template broken');
    expect(wrapper.find('[data-testid="download-pdf"]').exists()).toBe(false);
    await wrapper.find('[data-testid="retry-pdf"]').trigger('click');
    await flushPromises();
    expect(notify.success).toHaveBeenCalledWith('PDF generated successfully');
  });

  it('opens the PDF download', async () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);
    const wrapper = await mountView();
    await wrapper.find('[data-testid="download-pdf"]').trigger('click');
    expect(open).toHaveBeenCalledWith('/api/invoice/revision/11/download', '_blank');
  });

  it('shows a load error', async () => {
    replies['GET /api/invoice/1'] = { status: 404, body: {} };
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="load-error"]').text()).toContain(
      'Invoice could not be loaded',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit --workspace=frontend -- InvoiceDetailView`
Expected: FAIL.

- [ ] **Step 3: Rewrite the view**

Replace `frontend/src/views/InvoiceDetailView.vue` with:

```vue
<script setup lang="ts">
import Accordion from 'primevue/accordion';
import AccordionContent from 'primevue/accordioncontent';
import AccordionHeader from 'primevue/accordionheader';
import AccordionPanel from 'primevue/accordionpanel';
import Button from 'primevue/button';
import Card from 'primevue/card';
import Message from 'primevue/message';
import type { InvoiceDto, InvoiceRevisionDto } from 'shared';
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageHeader from '../components/ui/PageHeader.vue';
import StatusTag from '../components/ui/StatusTag.vue';
import { useConfirmAction } from '../composables/useConfirmAction';
import { useNotify } from '../composables/useNotify';
import { formatCents, formatDate, formatDateTime } from '../utils/format';
import {
  documentStatusTag,
  emailStatusTag,
  pdfStatusTag,
  revisionStatusTag,
} from '../utils/statusTags';

const route = useRoute();
const router = useRouter();
const notify = useNotify();
const { confirmAction } = useConfirmAction();

const id = Number(route.params.id);

const invoice = ref<InvoiceDto | null>(null);
const loading = ref(false);
const loadError = ref('');
const openPanels = ref<number[]>([]);
const busy = ref<Record<string, boolean>>({});
const techOpen = ref<Record<number, boolean>>({});

const isActive = computed(() => invoice.value?.status === 'AKTIV');
const title = computed(() => (invoice.value ? `Invoice ${invoice.value.number}` : 'Invoice'));

async function loadData() {
  loading.value = invoice.value === null;
  try {
    const res = await fetch(`/api/invoice/${id}`);
    if (!res.ok) {
      loadError.value = 'Invoice could not be loaded';
      return;
    }
    invoice.value = (await res.json()) as InvoiceDto;
    if (openPanels.value.length === 0 && invoice.value.revisions.length > 0) {
      openPanels.value = [invoice.value.revisions[0].id];
    }
  } catch {
    loadError.value = 'Network error';
  } finally {
    loading.value = false;
  }
}

onMounted(loadData);

function grossCents(rev: InvoiceRevisionDto): number {
  const net = rev.inputs.lineItems.reduce((sum, p) => sum + p.priceInCents, 0);
  return net + Math.round(net * (rev.inputs.vat / 100));
}

function isLatest(rev: InvoiceRevisionDto): boolean {
  return invoice.value?.revisions[0]?.id === rev.id;
}

/** Runs one request per button with a busy flag; returns the parsed body on success. */
async function run(
  key: string,
  request: () => Promise<Response>,
  errorText: (body: Record<string, string>) => string,
) {
  busy.value = { ...busy.value, [key]: true };
  try {
    const res = await request();
    const body = (await res.json().catch(() => ({}))) as Record<string, string>;
    if (!res.ok) {
      notify.error(errorText(body));
      return false;
    }
    return true;
  } catch {
    notify.error('Network error');
    return false;
  } finally {
    busy.value = { ...busy.value, [key]: false };
  }
}

async function cancel() {
  if (!invoice.value) return;
  const confirmed = await confirmAction({
    message: `Cancel invoice ${invoice.value.number}? This cannot be undone.`,
    header: 'Cancel invoice',
    acceptLabel: 'Cancel invoice',
    rejectLabel: 'Keep invoice',
    danger: true,
  });
  if (!confirmed) return;
  const ok = await run(
    'cancel',
    () => fetch(`/api/invoice/${id}/cancel`, { method: 'PATCH' }),
    (body) => body.error || 'Error cancelling',
  );
  if (ok) {
    notify.success('Invoice cancelled');
    await loadData();
  }
}

async function retryPdf(rev: InvoiceRevisionDto) {
  const ok = await run(
    `retry-${rev.id}`,
    () => fetch(`/api/invoice/revision/${rev.id}/retry-pdf`, { method: 'POST' }),
    (body) => body.error || 'Error on retry',
  );
  if (ok) {
    notify.success('PDF generated successfully');
    await loadData();
  }
}

async function sendEmail(rev: InvoiceRevisionDto) {
  const confirmed = await confirmAction({
    message:
      'Send this invoice to the real recipient now? This action sends the email to the recipient address.',
    header: 'Send invoice',
    acceptLabel: 'Send email',
  });
  if (!confirmed) return;
  const ok = await run(
    `email-${rev.id}`,
    () => fetch(`/api/invoice/revision/${rev.id}/send-email`, { method: 'POST' }),
    (body) => body.emailError || 'Error sending email',
  );
  if (ok) {
    notify.success('Email sent successfully');
    await loadData();
  }
}

async function sendTestEmail(rev: InvoiceRevisionDto) {
  const ok = await run(
    `test-${rev.id}`,
    () => fetch(`/api/invoice/revision/${rev.id}/send-test-email`, { method: 'POST' }),
    (body) => body.emailError || 'Error sending test email',
  );
  if (ok) {
    notify.success('Test email sent to configured test address');
    await loadData();
  }
}

function downloadPdf(rev: InvoiceRevisionDto) {
  window.open(`/api/invoice/revision/${rev.id}/download`, '_blank');
}
</script>

<template>
  <div class="page">
    <PageHeader :title="title">
      <template #actions>
        <Button
          label="Back"
          icon="pi pi-arrow-left"
          text
          severity="secondary"
          @click="router.push('/invoice')"
        />
        <template v-if="invoice">
          <Button
            v-if="isActive"
            label="New Revision"
            icon="pi pi-pencil"
            data-testid="new-revision"
            @click="router.push(`/invoice/${id}/revision`)"
          />
          <Button
            label="Duplicate"
            icon="pi pi-copy"
            severity="secondary"
            outlined
            data-testid="duplicate"
            @click="router.push(`/invoice/new?copyFrom=${id}`)"
          />
          <Button
            v-if="isActive"
            label="Cancel invoice"
            icon="pi pi-ban"
            severity="danger"
            outlined
            :loading="busy.cancel"
            data-testid="cancel-invoice"
            @click="cancel"
          />
        </template>
      </template>
    </PageHeader>

    <p v-if="loading" class="muted">Loading…</p>
    <Message v-else-if="loadError" severity="error" data-testid="load-error">
      {{ loadError }}
    </Message>

    <div v-else-if="invoice" class="stack gap-lg">
      <Card>
        <template #content>
          <dl class="facts">
            <div>
              <dt>Status</dt>
              <dd>
                <StatusTag :tag="documentStatusTag(invoice.status)" data-testid="invoice-status" />
              </dd>
            </div>
            <div>
              <dt>Invoice Date</dt>
              <dd>{{ formatDate(invoice.invoiceDate) }}</dd>
            </div>
            <div>
              <dt>Created at</dt>
              <dd>{{ formatDateTime(invoice.createdAt) }}</dd>
            </div>
            <div>
              <dt>Recipient</dt>
              <dd>{{ invoice.recipient.name }}</dd>
            </div>
          </dl>
        </template>
      </Card>

      <section class="stack gap-sm">
        <h3 class="section-title">Revisions</h3>
        <p v-if="invoice.revisions.length === 0" class="muted">No revisions available</p>
        <Accordion v-else v-model:value="openPanels" multiple lazy>
          <AccordionPanel v-for="rev in invoice.revisions" :key="rev.id" :value="rev.id">
            <AccordionHeader>
              <span class="rev-header">
                <span class="rev-header__title">Revision {{ rev.revisionNumber }}</span>
                <StatusTag :tag="pdfStatusTag(rev.pdfStatus)" />
                <StatusTag :tag="revisionStatusTag(rev.status)" />
                <span class="muted rev-header__date">{{ formatDateTime(rev.createdAt) }}</span>
              </span>
            </AccordionHeader>
            <AccordionContent>
              <div class="stack">
                <dl class="facts facts--grid">
                  <div>
                    <dt>Recipient</dt>
                    <dd>{{ rev.inputs.name }}, {{ rev.inputs.street }}, {{ rev.inputs.city }}</dd>
                  </div>
                  <div>
                    <dt>Title</dt>
                    <dd>{{ rev.inputs.title }}</dd>
                  </div>
                  <div>
                    <dt>Salutation</dt>
                    <dd>{{ rev.inputs.salutation || '—' }}</dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd>{{ rev.inputs.email || '—' }}</dd>
                  </div>
                  <div>
                    <dt>Email Salutation</dt>
                    <dd>{{ rev.inputs.emailSalutation || '—' }}</dd>
                  </div>
                  <div>
                    <dt>Invoice Date</dt>
                    <dd>{{ formatDate(rev.inputs.invoiceDate) }}</dd>
                  </div>
                  <div>
                    <dt>VAT</dt>
                    <dd>{{ rev.inputs.vat }}%</dd>
                  </div>
                  <div>
                    <dt>Payment</dt>
                    <dd>{{ rev.inputs.directDebit ? 'Direct Debit' : 'Bank Transfer' }}</dd>
                  </div>
                  <div>
                    <dt>Amount (Gross)</dt>
                    <dd class="strong">{{ formatCents(grossCents(rev)) }}</dd>
                  </div>
                </dl>

                <Message v-if="rev.pdfStatus === 'FAILED'" severity="warn">
                  <div class="stack gap-sm">
                    <span>{{
                      rev.pdfError || 'PDF could not be generated. Please try again.'
                    }}</span>
                    <Button
                      v-if="rev.pdfTechError"
                      :label="techOpen[rev.id] ? 'Hide Details' : 'Show Details'"
                      size="small"
                      text
                      @click="techOpen[rev.id] = !techOpen[rev.id]"
                    />
                    <pre v-if="rev.pdfTechError && techOpen[rev.id]" class="tech-error">{{
                      rev.pdfTechError
                    }}</pre>
                  </div>
                </Message>

                <div class="line-items">
                  <p class="muted line-items__label">Line Items</p>
                  <div
                    v-for="(pos, idx) in rev.inputs.lineItems"
                    :key="idx"
                    class="line-items__row"
                  >
                    <span
                      data-testid="line-item-text"
                      class="line-items__text"
                      v-text="pos.text"
                    ></span>
                    <span class="line-items__price">{{ formatCents(pos.priceInCents) }}</span>
                  </div>
                </div>

                <div class="row gap-sm">
                  <Button
                    v-if="rev.pdfStatus === 'OK'"
                    label="Download PDF"
                    icon="pi pi-file-pdf"
                    size="small"
                    outlined
                    data-testid="download-pdf"
                    @click="downloadPdf(rev)"
                  />
                  <Button
                    v-if="rev.pdfStatus === 'FAILED' && rev.status === 'AKTIV'"
                    label="Regenerate PDF"
                    icon="pi pi-refresh"
                    size="small"
                    severity="warn"
                    outlined
                    :loading="busy[`retry-${rev.id}`]"
                    data-testid="retry-pdf"
                    @click="retryPdf(rev)"
                  />
                  <Button
                    v-if="rev.pdfStatus === 'OK' && isActive && isLatest(rev)"
                    label="Send Test Email"
                    icon="pi pi-send"
                    size="small"
                    severity="secondary"
                    outlined
                    :loading="busy[`test-${rev.id}`]"
                    data-testid="send-test-email"
                    @click="sendTestEmail(rev)"
                  />
                  <Button
                    v-if="
                      rev.pdfStatus === 'OK' &&
                      isActive &&
                      rev.emailStatus !== 'SENT' &&
                      isLatest(rev)
                    "
                    label="Send via Email"
                    icon="pi pi-envelope"
                    size="small"
                    :loading="busy[`email-${rev.id}`]"
                    data-testid="send-email"
                    @click="sendEmail(rev)"
                  />
                  <StatusTag
                    v-if="rev.emailStatus !== 'NOT_SENT'"
                    :tag="emailStatusTag(rev.emailStatus)"
                  />
                  <small v-if="rev.emailStatus === 'FAILED' && rev.emailError" class="error-text">
                    {{ rev.emailError }}
                  </small>
                </div>
              </div>
            </AccordionContent>
          </AccordionPanel>
        </Accordion>
      </section>
    </div>
  </div>
</template>

<style scoped>
.section-title {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
}

.facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
  gap: 1rem;
  margin: 0;
}

.facts--grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

@media (max-width: 767px) {
  .facts--grid {
    grid-template-columns: 1fr;
  }
}

.facts dt {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.facts dd {
  margin: 0.25rem 0 0;
}

.strong {
  font-weight: 600;
}

.rev-header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.rev-header__title {
  font-weight: 600;
}

.rev-header__date {
  font-size: 0.8125rem;
}

.line-items {
  border: 1px solid var(--p-content-border-color);
  border-radius: 0.5rem;
  padding: 0.75rem;
}

.line-items__label {
  margin: 0 0 0.5rem;
  font-size: 0.8125rem;
}

.line-items__row {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.25rem 0;
}

.line-items__row + .line-items__row {
  border-top: 1px solid var(--p-content-border-color);
}

.line-items__text {
  white-space: pre-line;
}

.line-items__price {
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.tech-error {
  white-space: pre-wrap;
  font-size: 0.75rem;
  margin: 0;
}

.error-text {
  color: var(--p-red-500);
}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit --workspace=frontend -- InvoiceDetailView`
Expected: PASS. If `lazy` still renders collapsed panel contents in jsdom (the "expands only the newest" test), keep the test and render the content conditionally with `v-if="openPanels.includes(rev.id)"` inside `AccordionContent`; report it.

- [ ] **Step 5: Full verification and commit**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS.

```bash
git add frontend/src/views/InvoiceDetailView.vue frontend/src/__tests__/InvoiceDetailView.test.ts
git commit -m "feat: rebuild invoice detail with revisions accordion and confirmations

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Invoice form (new, copy, revision, draft, instructor prefill)

**Files:**

- Rewrite: `frontend/src/views/InvoiceFormView.vue`
- Rewrite: `frontend/src/__tests__/InvoiceFormView.test.ts`
- Delete: `frontend/src/directives/autogrow.ts` (only user was this form)

**Interfaces:**

- Consumes: `PageHeader`, `FormSection`, `useNotify` (incl. `warn`), `useConfirmAction`, `formatCents`, `toIsoDate`, `fromIsoDate`, `useAppStore`
- Produces (test hooks): script bindings `inputs` (InvoiceInputs), `recipient`, `loadError`, `fieldErrors`; `data-testid`s `recipient-search` (AutoComplete root), `invoice-date` (DatePicker root, absent in draft mode), `draft-date-hint`, `line-item-text` (textarea), `line-item-price` (InputNumber root), `gross`, `error-name`, `error-title`, `error-line-items`, `load-error`, `save-draft`, `activate-draft`, `delete-draft`, `submit`

Behavior to keep (exactly as today):

- Mode detection from route (`params.id` → new revision, `query.copyFrom` → copy, `params.draftId` → draft, `query.fromInstructor` → prefill); redirect to `/invoice` when no invoice template.
- Copy uses today's date; revision keeps the revision's date; draft keeps today's date in the model but hides the date field ("Invoice date is set on activation").
- `recipientFieldsLocked = !isNewRevision && !isDraft && !!recipient && !newRecipient` (locked = disabled inputs).
- Request bodies (`recipientRequestBody`) and endpoints unchanged; new revision posts `{ inputs }` to `/api/invoice/:id/revision`.
- Draft mode: `<form novalidate>`, "Save Draft" is the submit button (`type="submit"`), Enter saves the draft (only when the draft loaded), never creates an invoice; "Save as Draft" in new mode is `type="button"`; Activate saves first then `POST …/activate` then opens `/invoice/:invoiceId`; Delete removes and returns to `/invoice`.
- Validation: create/revision require name, title, non-empty line item texts; draft save requires name only.

Changes:

- Messages → toasts: server errors `notify.error(result.error || 'Unknown error')`; network `Network error while saving|activating|deleting`; PDF failed after save `notify.warn(result.pdfError || 'PDF could not be generated.')`; success `notify.success('Invoice saved successfully.')` then navigate immediately (no 1 s delay); draft saved `notify.success('Draft saved.')`; prefill failure `notify.error('Could not load instructor data')`.
- Validation errors under the fields (`fieldErrors.name|title|lineItems`).
- Draft not found → `loadError = 'Draft not found'` shown as an error `Message`; no draft actions.
- `confirm()` → `confirmAction` (activate: header `Activate draft`, accept `Activate`; delete: header `Delete draft`, accept `Delete`, `danger: true`).
- Recipient search → `AutoComplete` (same endpoint `/api/invoice/recipient?search=`), option shows `name — street, city`.
- Price → `InputNumber` currency (euros ↔ cents); VAT → `Select` (7 %, 19 %); payment → `ToggleSwitch` "Direct debit"; gross is computed; line text → `Textarea autoResize`.

- [ ] **Step 1: Write the failing test**

Replace `frontend/src/__tests__/InvoiceFormView.test.ts` with:

```ts
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import AutoComplete from 'primevue/autocomplete';
import InputNumber from 'primevue/inputnumber';
import type {
  InstructorInvoicePrefillDto,
  InvoiceDraftDto,
  InvoiceInputs,
  InvoiceRecipientDto,
} from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRoute, useRouter } from 'vue-router';
import { useAppStore } from '../stores/app';
import InvoiceFormView from '../views/InvoiceFormView.vue';
import { withPrimeVue } from './helpers/primeVue';

const { notify, confirmAction } = vi.hoisted(() => ({
  notify: { success: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  confirmAction: vi.fn(),
}));

vi.mock('vue-router', () => ({ useRoute: vi.fn(), useRouter: vi.fn() }));
vi.mock('../composables/useNotify', () => ({ useNotify: () => notify }));
vi.mock('../composables/useConfirmAction', () => ({
  useConfirmAction: () => ({ confirmAction }),
}));

const mockPush = vi.fn();
const mockReplace = vi.fn();

interface FormVM {
  inputs: InvoiceInputs;
  recipient: InvoiceRecipientDto | null;
  loadError: string;
}

function vm(wrapper: VueWrapper): FormVM {
  return wrapper.vm as unknown as FormVM;
}

type Reply = { status: number; body?: unknown };
let replies: Record<string, Reply>;

const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  const key = `${init?.method ?? 'GET'} ${url}`;
  const reply = replies[key];
  if (!reply) throw new Error(`Unexpected fetch: ${key}`);
  return {
    ok: reply.status < 400,
    status: reply.status,
    json: () => Promise.resolve(reply.body),
  } as Response;
});

function calls(): string[] {
  return fetchMock.mock.calls.map(
    ([url, init]) => `${(init as RequestInit | undefined)?.method ?? 'GET'} ${url}`,
  );
}

function bodyOf(key: string): Record<string, unknown> {
  const call = fetchMock.mock.calls.find(
    ([url, init]) => `${(init as RequestInit | undefined)?.method ?? 'GET'} ${url}` === key,
  );
  return JSON.parse(String((call?.[1] as RequestInit).body));
}

const anna: InvoiceRecipientDto = {
  id: 7,
  name: 'Anna Alt',
  street: 'Hauptstr. 1',
  city: '12345 Berlin',
  email: 'anna@example.org',
  salutation: 'Frau',
};

const draftDto: InvoiceDraftDto = {
  id: 42,
  recipient: {
    id: 5,
    name: 'Draft Firma',
    street: 'Weg 1',
    city: 'Stadt',
    email: 'd@example.com',
    salutation: null,
  },
  inputs: {
    salutation: '',
    name: 'Draft Firma',
    street: 'Weg 1',
    city: 'Stadt',
    title: 'Draft Titel',
    lineItems: [{ text: 'Pos', priceInCents: 5000 }],
    vat: 19,
    directDebit: false,
    email: 'd@example.com',
    emailSalutation: 'Hallo',
  },
  createdAt: '2026-10-01T10:00:00Z',
  updatedAt: '2026-10-01T10:00:00Z',
};

const today = new Date().toISOString().split('T')[0];

function setRoute(params: Record<string, string>, query: Record<string, string> = {}) {
  vi.mocked(useRoute).mockReturnValue({ params, query } as unknown as ReturnType<typeof useRoute>);
}

async function mountForm() {
  const wrapper = mount(InvoiceFormView, { attachTo: document.body, global: withPrimeVue() });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  replies = {};
  fetchMock.mockClear();
  mockPush.mockClear();
  mockReplace.mockClear();
  confirmAction.mockReset().mockResolvedValue(true);
  Object.values(notify).forEach((fn) => fn.mockReset());
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(useRouter).mockReturnValue({
    push: mockPush,
    replace: mockReplace,
    back: vi.fn(),
  } as unknown as ReturnType<typeof useRouter>);
  setActivePinia(createPinia());
  useAppStore().invoiceTemplateAvailable = true;
  setRoute({});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('InvoiceFormView — new invoice', () => {
  it('redirects to the list without an invoice template', async () => {
    useAppStore().invoiceTemplateAvailable = false;
    await mountForm();
    expect(mockReplace).toHaveBeenCalledWith('/invoice');
  });

  it('shows date field, "Save as Draft" (plain button) and "Create Invoice"', async () => {
    const wrapper = await mountForm();
    expect(wrapper.find('[data-testid="invoice-date"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="save-draft"]').attributes('type')).toBe('button');
    expect(wrapper.find('[data-testid="submit"]').text()).toContain('Create Invoice');
    expect(wrapper.find('form').attributes('novalidate')).toBeUndefined();
    expect(wrapper.find('[data-testid="activate-draft"]').exists()).toBe(false);
  });

  it('"Save as Draft" posts to the draft endpoint and returns to the list', async () => {
    replies['POST /api/invoice-draft'] = { status: 201, body: { draftId: 1 } };
    const wrapper = await mountForm();
    vm(wrapper).inputs.name = 'Neue Firma';

    await wrapper.find('[data-testid="save-draft"]').trigger('click');
    await flushPromises();

    expect(calls()).toEqual(['POST /api/invoice-draft']);
    expect(bodyOf('POST /api/invoice-draft').recipientData).toMatchObject({ name: 'Neue Firma' });
    expect(mockPush).toHaveBeenCalledWith('/invoice');
  });

  it('"Save as Draft" requires a name', async () => {
    const wrapper = await mountForm();
    await wrapper.find('[data-testid="save-draft"]').trigger('click');
    await flushPromises();
    expect(calls()).toEqual([]);
    expect(wrapper.find('[data-testid="error-name"]').text()).toBe('Name is required');
  });

  it('creating requires title and line item texts', async () => {
    const wrapper = await mountForm();
    vm(wrapper).inputs.name = 'Neue Firma';
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(calls()).toEqual([]);
    expect(wrapper.find('[data-testid="error-title"]').text()).toBe('Title is required');
    expect(wrapper.find('[data-testid="error-line-items"]').text()).toBe(
      'All line items need text',
    );
  });

  it('creates the invoice and opens it', async () => {
    replies['POST /api/invoice'] = { status: 201, body: { invoiceId: 77, pdfStatus: 'OK' } };
    const wrapper = await mountForm();
    Object.assign(vm(wrapper).inputs, { name: 'Neue Firma', title: 'Miete' });
    vm(wrapper).inputs.lineItems[0].text = 'Raum';

    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(calls()).toEqual(['POST /api/invoice']);
    expect(notify.success).toHaveBeenCalledWith('Invoice saved successfully.');
    expect(mockPush).toHaveBeenCalledWith('/invoice/77');
  });

  it('warns when the PDF failed after saving', async () => {
    replies['POST /api/invoice'] = {
      status: 201,
      body: { invoiceId: 77, pdfStatus: 'FAILED', pdfError: 'LibreOffice missing' },
    };
    const wrapper = await mountForm();
    Object.assign(vm(wrapper).inputs, { name: 'Neue Firma', title: 'Miete' });
    vm(wrapper).inputs.lineItems[0].text = 'Raum';
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(notify.warn).toHaveBeenCalledWith('LibreOffice missing');
  });

  it('edits line item text in a textarea and keeps line breaks', async () => {
    replies['POST /api/invoice-draft'] = { status: 201, body: { draftId: 1 } };
    const wrapper = await mountForm();
    vm(wrapper).inputs.name = 'Neue Firma';

    const textarea = wrapper.find('[data-testid="line-item-text"]');
    expect(textarea.element.tagName).toBe('TEXTAREA');
    await textarea.setValue('Zeile 1\nZeile 2');
    await wrapper.find('[data-testid="save-draft"]').trigger('click');
    await flushPromises();

    const inputs = bodyOf('POST /api/invoice-draft').inputs as InvoiceInputs;
    expect(inputs.lineItems[0].text).toBe('Zeile 1\nZeile 2');
  });

  it('stores euro prices as cents and computes the gross amount', async () => {
    const wrapper = await mountForm();
    wrapper.findComponent(InputNumber).vm.$emit('update:modelValue', 12.5);
    await flushPromises();
    expect(vm(wrapper).inputs.lineItems[0].priceInCents).toBe(1250);
    expect(wrapper.find('[data-testid="gross"]').text()).toContain('14,88');

    vm(wrapper).inputs.vat = 7;
    await flushPromises();
    expect(wrapper.find('[data-testid="gross"]').text()).toContain('13,38');

    wrapper.findComponent(InputNumber).vm.$emit('update:modelValue', null);
    await flushPromises();
    expect(vm(wrapper).inputs.lineItems[0].priceInCents).toBe(0);
  });

  it('searches recipients and fills and locks the fields on selection', async () => {
    replies['GET /api/invoice/recipient?search=An'] = { status: 200, body: [anna] };
    const wrapper = await mountForm();
    const autocomplete = wrapper.findComponent(AutoComplete);

    autocomplete.vm.$emit('complete', { originalEvent: new Event('input'), query: 'An' });
    await flushPromises();
    expect(calls()).toEqual(['GET /api/invoice/recipient?search=An']);

    autocomplete.vm.$emit('option-select', { originalEvent: new Event('click'), value: anna });
    await flushPromises();

    expect(vm(wrapper).recipient?.id).toBe(7);
    expect(vm(wrapper).inputs).toMatchObject({
      name: 'Anna Alt',
      street: 'Hauptstr. 1',
      city: '12345 Berlin',
      email: 'anna@example.org',
      salutation: 'Frau',
    });
    expect(wrapper.find('#name').attributes('disabled')).toBeDefined();
  });
});

describe('InvoiceFormView — copy and revision', () => {
  const invoiceDto = {
    id: 3,
    recipient: anna,
    activeRevision: {
      inputs: { ...draftDto.inputs, invoiceDate: '2026-01-15T00:00:00.000Z', name: 'Anna Alt' },
    },
  };

  it('copies an invoice with today as date', async () => {
    setRoute({}, { copyFrom: '3' });
    replies['GET /api/invoice/3'] = { status: 200, body: invoiceDto };
    const wrapper = await mountForm();
    expect(wrapper.find('[data-testid="page-title"]').text()).toBe('Duplicate Invoice');
    expect(vm(wrapper).inputs.title).toBe('Draft Titel');
    expect(vm(wrapper).inputs.invoiceDate).toBe(today);
    expect(vm(wrapper).recipient?.id).toBe(7);
  });

  it('creates a revision with the revision date and posts only the inputs', async () => {
    setRoute({ id: '3' });
    replies['GET /api/invoice/3'] = { status: 200, body: invoiceDto };
    replies['POST /api/invoice/3/revision'] = { status: 201, body: { pdfStatus: 'OK' } };
    const wrapper = await mountForm();

    expect(wrapper.find('[data-testid="page-title"]').text()).toBe('Create New Revision');
    expect(vm(wrapper).inputs.invoiceDate).toBe('2026-01-15');
    expect(wrapper.find('[data-testid="recipient-search"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="save-draft"]').exists()).toBe(false);

    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(Object.keys(bodyOf('POST /api/invoice/3/revision'))).toEqual(['inputs']);
    expect(mockPush).toHaveBeenCalledWith('/invoice/3');
  });
});

describe('InvoiceFormView — draft mode', () => {
  beforeEach(() => {
    setRoute({ draftId: '42' });
    replies['GET /api/invoice-draft/42'] = { status: 200, body: draftDto };
  });

  it('loads the draft, hides the date field and shows draft actions', async () => {
    const wrapper = await mountForm();

    expect(vm(wrapper).inputs.title).toBe('Draft Titel');
    expect(vm(wrapper).inputs.name).toBe('Draft Firma');
    expect(wrapper.find('[data-testid="invoice-date"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="draft-date-hint"]').text()).toContain(
      'Invoice date is set on activation',
    );
    expect(wrapper.find('[data-testid="save-draft"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="activate-draft"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="delete-draft"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="submit"]').exists()).toBe(false);
  });

  it('keeps recipient fields editable', async () => {
    const wrapper = await mountForm();
    expect(wrapper.findAll('input[disabled]')).toHaveLength(0);
  });

  it('save-draft is the submit button in draft mode and saves exactly once', async () => {
    replies['PUT /api/invoice-draft/42'] = { status: 200, body: { draftId: 42 } };
    const wrapper = await mountForm();
    const button = wrapper.find('[data-testid="save-draft"]');
    expect(button.attributes('type')).toBe('submit');

    await button.trigger('click');
    await flushPromises();

    expect(calls().filter((c) => c.startsWith('PUT'))).toHaveLength(1);
  });

  it('incomplete draft: form has novalidate and save-draft PUTs exactly once', async () => {
    replies['GET /api/invoice-draft/42'] = {
      status: 200,
      body: {
        ...draftDto,
        recipient: { ...draftDto.recipient, street: '', city: '' },
        inputs: { ...draftDto.inputs, street: '', city: '', title: '' },
      },
    };
    replies['PUT /api/invoice-draft/42'] = { status: 200, body: { draftId: 42 } };
    const wrapper = await mountForm();

    expect(wrapper.find('form').attributes('novalidate')).toBeDefined();
    await wrapper.find('[data-testid="save-draft"]').trigger('click');
    await flushPromises();

    expect(calls().filter((c) => c.startsWith('PUT'))).toHaveLength(1);
  });

  it('shows an error when the draft does not exist', async () => {
    replies['GET /api/invoice-draft/42'] = { status: 404, body: { error: 'Draft not found' } };
    const wrapper = await mountForm();

    expect(wrapper.find('[data-testid="load-error"]').text()).toContain('Draft not found');
    expect(wrapper.find('[data-testid="activate-draft"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="save-draft"]').exists()).toBe(false);
  });

  it('Enter in a draft that failed to load saves nothing', async () => {
    replies['GET /api/invoice-draft/42'] = { status: 404, body: { error: 'Draft not found' } };
    const wrapper = await mountForm();
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(calls()).toEqual(['GET /api/invoice-draft/42']);
  });

  it('"Save Draft" PUTs with the linked recipient id and stays on the page', async () => {
    replies['PUT /api/invoice-draft/42'] = { status: 200, body: { draftId: 42 } };
    const wrapper = await mountForm();

    await wrapper.find('[data-testid="save-draft"]').trigger('click');
    await flushPromises();

    expect(calls()).toEqual(['GET /api/invoice-draft/42', 'PUT /api/invoice-draft/42']);
    expect(bodyOf('PUT /api/invoice-draft/42').recipientId).toBe(5);
    expect(notify.success).toHaveBeenCalledWith('Draft saved.');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('form submit (Enter) in draft mode saves the draft instead of creating an invoice', async () => {
    replies['PUT /api/invoice-draft/42'] = { status: 200, body: { draftId: 42 } };
    const wrapper = await mountForm();

    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(calls()).toEqual(['GET /api/invoice-draft/42', 'PUT /api/invoice-draft/42']);
  });

  it('Activate saves first, then activates and opens the new invoice', async () => {
    replies['PUT /api/invoice-draft/42'] = { status: 200, body: { draftId: 42 } };
    replies['POST /api/invoice-draft/42/activate'] = { status: 201, body: { invoiceId: 99 } };
    const wrapper = await mountForm();
    vm(wrapper).inputs.title = 'Geändert';

    await wrapper.find('[data-testid="activate-draft"]').trigger('click');
    await flushPromises();

    expect(confirmAction).toHaveBeenCalledWith(
      expect.objectContaining({ header: 'Activate draft', acceptLabel: 'Activate' }),
    );
    expect(calls()).toEqual([
      'GET /api/invoice-draft/42',
      'PUT /api/invoice-draft/42',
      'POST /api/invoice-draft/42/activate',
    ]);
    expect((bodyOf('PUT /api/invoice-draft/42').inputs as InvoiceInputs).title).toBe('Geändert');
    expect(mockPush).toHaveBeenCalledWith('/invoice/99');
  });

  it('Activate does nothing when the confirmation is cancelled', async () => {
    confirmAction.mockResolvedValue(false);
    const wrapper = await mountForm();

    await wrapper.find('[data-testid="activate-draft"]').trigger('click');
    await flushPromises();

    expect(calls()).toEqual(['GET /api/invoice-draft/42']);
  });

  it('Activate shows the server validation error and stays on the draft', async () => {
    replies['PUT /api/invoice-draft/42'] = { status: 200, body: { draftId: 42 } };
    replies['POST /api/invoice-draft/42/activate'] = {
      status: 400,
      body: { error: 'Street is required' },
    };
    const wrapper = await mountForm();

    await wrapper.find('[data-testid="activate-draft"]').trigger('click');
    await flushPromises();

    expect(notify.error).toHaveBeenCalledWith('Street is required');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('Delete asks, removes the draft and returns to the list', async () => {
    replies['DELETE /api/invoice-draft/42'] = { status: 204 };
    const wrapper = await mountForm();

    await wrapper.find('[data-testid="delete-draft"]').trigger('click');
    await flushPromises();

    expect(confirmAction).toHaveBeenCalledWith(expect.objectContaining({ danger: true }));
    expect(calls()).toContain('DELETE /api/invoice-draft/42');
    expect(mockPush).toHaveBeenCalledWith('/invoice');
  });
});

describe('InvoiceFormView — prefill from instructor', () => {
  const prefill: InstructorInvoicePrefillDto = {
    recipient: anna,
    title: 'Raummiete',
    lineItems: [{ text: 'Raummiete 6 Monate\n7,5 h/Woche', priceInCents: 175500 }],
  };

  beforeEach(() => {
    setRoute({}, { fromInstructor: '5' });
  });

  it('fills recipient, title, line item and today as invoice date', async () => {
    replies['GET /api/instructor/5/invoice-prefill'] = { status: 200, body: prefill };
    const wrapper = await mountForm();

    expect(vm(wrapper).recipient?.id).toBe(7);
    expect(vm(wrapper).inputs.name).toBe('Anna Alt');
    expect(vm(wrapper).inputs.title).toBe('Raummiete');
    expect(vm(wrapper).inputs.lineItems).toEqual(prefill.lineItems);
    expect(vm(wrapper).inputs.invoiceDate).toBe(today);
    expect(wrapper.find('[data-testid="save-draft"]').exists()).toBe(true);
  });

  it('reports a failed prefill', async () => {
    replies['GET /api/instructor/5/invoice-prefill'] = { status: 404, body: {} };
    await mountForm();
    expect(notify.error).toHaveBeenCalledWith('Could not load instructor data');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit --workspace=frontend -- InvoiceFormView`
Expected: FAIL.

- [ ] **Step 3: Rewrite the form**

Replace `frontend/src/views/InvoiceFormView.vue` with:

```vue
<script setup lang="ts">
import AutoComplete, {
  type AutoCompleteCompleteEvent,
  type AutoCompleteOptionSelectEvent,
} from 'primevue/autocomplete';
import Button from 'primevue/button';
import DatePicker from 'primevue/datepicker';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Select from 'primevue/select';
import Textarea from 'primevue/textarea';
import ToggleSwitch from 'primevue/toggleswitch';
import type {
  InstructorInvoicePrefillDto,
  InvoiceDraftDto,
  InvoiceInputs,
  InvoiceRecipientDto,
} from 'shared';
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import FormSection from '../components/ui/FormSection.vue';
import PageHeader from '../components/ui/PageHeader.vue';
import { useConfirmAction } from '../composables/useConfirmAction';
import { useNotify } from '../composables/useNotify';
import { useAppStore } from '../stores/app';
import { formatCents, fromIsoDate, toIsoDate } from '../utils/format';

const router = useRouter();
const route = useRoute();
const store = useAppStore();
const notify = useNotify();
const { confirmAction } = useConfirmAction();

const invoiceId = route.params.id ? parseInt(String(route.params.id)) : null;
const copyFromId = route.query.copyFrom ? parseInt(String(route.query.copyFrom)) : null;
const isNewRevision = !!invoiceId;
const isCopy = !!copyFromId;
const draftId = route.params.draftId ? parseInt(String(route.params.draftId)) : null;
const isDraft = !!draftId;
const draftLoaded = ref(false);
const fromInstructorId = route.query.fromInstructor
  ? parseInt(String(route.query.fromInstructor))
  : null;

const sending = ref(false);
const loadError = ref('');
type FieldKey = 'name' | 'title' | 'lineItems';
const fieldErrors = ref<Partial<Record<FieldKey, string>>>({});

const recipient = ref<InvoiceRecipientDto | null>(null);
const newRecipient = ref(false);
const recipientSearch = ref('');
const recipientSuggestions = ref<InvoiceRecipientDto[]>([]);
const recipientSearched = ref(false);

const recipientFieldsLocked = computed(
  () => !isNewRevision && !isDraft && !!recipient.value && !newRecipient.value,
);

const inputs = ref<InvoiceInputs>({
  salutation: '',
  name: '',
  street: '',
  city: '',
  invoiceDate: new Date().toISOString().split('T')[0],
  title: '',
  lineItems: [{ text: '', priceInCents: 0 }],
  vat: 19,
  directDebit: false,
  email: '',
  emailSalutation: 'Sehr geehrte Damen und Herren',
});

const VAT_OPTIONS = [
  { label: '7%', value: 7 },
  { label: '19%', value: 19 },
];

const pageTitle = computed(() =>
  isDraft
    ? 'Edit Draft'
    : isNewRevision
      ? 'Create New Revision'
      : isCopy
        ? 'Duplicate Invoice'
        : 'New Invoice',
);

const invoiceDateValue = computed<Date | null>({
  get: () => fromIsoDate(inputs.value.invoiceDate),
  set: (date) => {
    inputs.value.invoiceDate = date ? toIsoDate(date) : '';
  },
});

const grossCents = computed(() => {
  const net = inputs.value.lineItems.reduce((sum, p) => sum + p.priceInCents, 0);
  return net + Math.round(net * (inputs.value.vat / 100));
});

async function searchRecipient(event: AutoCompleteCompleteEvent) {
  const query = event.query.trim();
  if (!query) {
    recipientSuggestions.value = [];
    return;
  }
  try {
    const res = await fetch(`/api/invoice/recipient?search=${encodeURIComponent(query)}`);
    recipientSuggestions.value = res.ok ? await res.json() : [];
  } catch {
    recipientSuggestions.value = [];
  } finally {
    recipientSearched.value = true;
  }
}

function onRecipientInput(value: string | InvoiceRecipientDto | null) {
  recipientSearch.value = typeof value === 'string' ? value : (value?.name ?? '');
}

function selectRecipient(e: InvoiceRecipientDto) {
  recipient.value = e;
  newRecipient.value = false;
  recipientSearch.value = e.name;
  recipientSuggestions.value = [];
  inputs.value.name = e.name;
  inputs.value.street = e.street;
  inputs.value.city = e.city;
  inputs.value.email = e.email ?? '';
  inputs.value.salutation = e.salutation ?? '';
}

function onRecipientSelect(event: AutoCompleteOptionSelectEvent) {
  selectRecipient(event.value as InvoiceRecipientDto);
}

function addLineItem() {
  inputs.value.lineItems.push({ text: '', priceInCents: 0 });
}

function removeLineItem(index: number) {
  if (inputs.value.lineItems.length > 1) inputs.value.lineItems.splice(index, 1);
}

function setPrice(index: number, euros: number | null) {
  inputs.value.lineItems[index].priceInCents = euros === null ? 0 : Math.round(euros * 100);
}

async function loadRevision() {
  if (!invoiceId) return;
  const res = await fetch(`/api/invoice/${invoiceId}`);
  if (!res.ok) return;
  const data = await res.json();
  if (data.activeRevision) {
    const e = data.activeRevision.inputs as InvoiceInputs;
    inputs.value = {
      ...e,
      invoiceDate: e.invoiceDate.includes('T') ? e.invoiceDate.split('T')[0] : e.invoiceDate,
    };
  }
  if (data.recipient) {
    recipient.value = data.recipient;
    recipientSearch.value = data.recipient.name;
  }
}

async function copyFromInvoice() {
  if (!copyFromId) return;
  const res = await fetch(`/api/invoice/${copyFromId}`);
  if (!res.ok) return;
  const data = await res.json();
  if (data.activeRevision) {
    const e = data.activeRevision.inputs as InvoiceInputs;
    inputs.value = { ...e, invoiceDate: new Date().toISOString().split('T')[0] };
  }
  if (data.recipient) {
    recipient.value = data.recipient;
    recipientSearch.value = data.recipient.name;
    newRecipient.value = false;
  }
}

async function loadDraft() {
  if (!draftId) return;
  const res = await fetch(`/api/invoice-draft/${draftId}`);
  if (!res.ok) {
    loadError.value = 'Draft not found';
    return;
  }
  const data = (await res.json()) as InvoiceDraftDto;
  inputs.value = { ...data.inputs, invoiceDate: inputs.value.invoiceDate };
  recipient.value = data.recipient;
  recipientSearch.value = data.recipient.name;
  newRecipient.value = false;
  draftLoaded.value = true;
}

async function prefillFromInstructor() {
  if (!fromInstructorId) return;
  const res = await fetch(`/api/instructor/${fromInstructorId}/invoice-prefill`);
  if (!res.ok) {
    notify.error('Could not load instructor data');
    return;
  }
  const data = (await res.json()) as InstructorInvoicePrefillDto;
  selectRecipient(data.recipient);
  inputs.value.title = data.title;
  inputs.value.lineItems = data.lineItems;
  inputs.value.invoiceDate = new Date().toISOString().split('T')[0];
}

onMounted(async () => {
  if (store.invoiceTemplateAvailable === false) {
    router.replace('/invoice');
    return;
  }
  if (store.invoiceTemplateAvailable === null) {
    await store.checkTemplates();
    if (!store.invoiceTemplateAvailable) {
      router.replace('/invoice');
      return;
    }
  }

  if (isNewRevision) await loadRevision();
  else if (isCopy) await copyFromInvoice();
  else if (isDraft) await loadDraft();
  else if (fromInstructorId) await prefillFromInstructor();
});

function recipientRequestBody(): Record<string, unknown> {
  const body: Record<string, unknown> = { inputs: inputs.value };
  if (recipient.value && !newRecipient.value) {
    body.recipientId = recipient.value.id;
  } else {
    body.recipientData = {
      name: inputs.value.name,
      street: inputs.value.street,
      city: inputs.value.city,
      email: inputs.value.email,
      salutation: inputs.value.salutation,
    };
  }
  return body;
}

/** Drafts only need a name; invoices and revisions need title and line item texts too. */
function validate(complete: boolean): boolean {
  const errors: Partial<Record<FieldKey, string>> = {};
  if (!inputs.value.name.trim()) errors.name = 'Name is required';
  if (complete) {
    if (!inputs.value.title.trim()) errors.title = 'Title is required';
    if (inputs.value.lineItems.some((p) => !p.text.trim())) {
      errors.lineItems = 'All line items need text';
    }
  }
  fieldErrors.value = errors;
  return Object.keys(errors).length === 0;
}

async function submit() {
  if (!validate(true)) return;
  sending.value = true;
  try {
    const res = isNewRevision
      ? await fetch(`/api/invoice/${invoiceId}/revision`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inputs: inputs.value }),
        })
      : await fetch('/api/invoice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(recipientRequestBody()),
        });
    const result = await res.json();
    if (!res.ok) {
      notify.error(result.error || 'Unknown error');
      return;
    }
    if (result.pdfStatus === 'FAILED') {
      notify.warn(result.pdfError || 'PDF could not be generated.');
    } else {
      notify.success('Invoice saved successfully.');
    }
    router.push(`/invoice/${result.invoiceId ?? invoiceId}`);
  } catch {
    notify.error('Network error while saving');
  } finally {
    sending.value = false;
  }
}

/** Creates or updates the draft. Returns the draft id, or null on error. */
async function saveDraft(): Promise<number | null> {
  if (!validate(false)) return null;
  sending.value = true;
  try {
    const res = await fetch(isDraft ? `/api/invoice-draft/${draftId}` : '/api/invoice-draft', {
      method: isDraft ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(recipientRequestBody()),
    });
    const result = await res.json();
    if (!res.ok) {
      notify.error(result.error || 'Unknown error');
      return null;
    }
    return result.draftId as number;
  } catch {
    notify.error('Network error while saving');
    return null;
  } finally {
    sending.value = false;
  }
}

async function onSaveDraft() {
  const id = await saveDraft();
  if (id === null) return;
  if (isDraft) notify.success('Draft saved.');
  else router.push('/invoice');
}

async function activateDraft() {
  const today = new Intl.DateTimeFormat('de-DE').format(new Date());
  const confirmed = await confirmAction({
    message: `Assigns the next invoice number and today's date (${today}). Continue?`,
    header: 'Activate draft',
    acceptLabel: 'Activate',
  });
  if (!confirmed) return;

  const id = await saveDraft();
  if (id === null) return;

  sending.value = true;
  try {
    const res = await fetch(`/api/invoice-draft/${draftId}/activate`, { method: 'POST' });
    const result = await res.json();
    if (!res.ok) {
      notify.error(result.error || 'Unknown error');
      return;
    }
    router.push(`/invoice/${result.invoiceId}`);
  } catch {
    notify.error('Network error while activating');
  } finally {
    sending.value = false;
  }
}

async function deleteDraft() {
  const confirmed = await confirmAction({
    message: 'Delete this draft?',
    header: 'Delete draft',
    acceptLabel: 'Delete',
    danger: true,
  });
  if (!confirmed) return;
  sending.value = true;
  try {
    const res = await fetch(`/api/invoice-draft/${draftId}`, { method: 'DELETE' });
    if (!res.ok) {
      const result = await res.json().catch(() => ({}));
      notify.error(result.error || 'Unknown error');
      return;
    }
    router.push('/invoice');
  } catch {
    notify.error('Network error while deleting');
  } finally {
    sending.value = false;
  }
}

function onFormSubmit() {
  if (sending.value) return;
  if (isDraft) {
    // Enter in a draft must never create a real invoice; and never save a draft that failed to load
    if (draftLoaded.value) void onSaveDraft();
  } else {
    void submit();
  }
}
</script>

<template>
  <div class="page">
    <PageHeader :title="pageTitle">
      <template #actions>
        <Button
          label="Back"
          icon="pi pi-arrow-left"
          text
          severity="secondary"
          @click="router.back()"
        />
      </template>
    </PageHeader>

    <Message v-if="loadError" severity="error" data-testid="load-error" class="load-error">
      {{ loadError }}
    </Message>

    <form :novalidate="isDraft" @submit.prevent="onFormSubmit">
      <FormSection title="Recipient">
        <div v-if="!isNewRevision" class="field recipient-search">
          <label for="recipient-search">Search or create recipient</label>
          <AutoComplete
            :model-value="recipientSearch"
            input-id="recipient-search"
            data-testid="recipient-search"
            :suggestions="recipientSuggestions"
            option-label="name"
            placeholder="Enter name…"
            :delay="300"
            fluid
            @complete="searchRecipient"
            @option-select="onRecipientSelect"
            @update:model-value="onRecipientInput"
          >
            <template #option="{ option }">
              {{ option.name }} — {{ option.street }}, {{ option.city }}
            </template>
          </AutoComplete>
          <small
            v-if="
              recipientSearch &&
              recipientSearched &&
              recipientSuggestions.length === 0 &&
              !recipient
            "
            class="muted"
          >
            No recipient found. Fill in the fields below to create a new one.
          </small>
        </div>

        <div class="grid-2">
          <div class="field">
            <label for="salutation">Salutation</label>
            <InputText
              id="salutation"
              v-model="inputs.salutation"
              :disabled="recipientFieldsLocked"
              fluid
            />
          </div>
          <div class="field">
            <label for="name">Name</label>
            <InputText
              id="name"
              v-model="inputs.name"
              required
              :disabled="recipientFieldsLocked"
              :invalid="!!fieldErrors.name"
              fluid
            />
            <Message
              v-if="fieldErrors.name"
              severity="error"
              size="small"
              variant="simple"
              data-testid="error-name"
            >
              {{ fieldErrors.name }}
            </Message>
          </div>
          <div class="field">
            <label for="street">Street</label>
            <InputText
              id="street"
              v-model="inputs.street"
              required
              :disabled="recipientFieldsLocked"
              fluid
            />
          </div>
          <div class="field">
            <label for="city">City</label>
            <InputText
              id="city"
              v-model="inputs.city"
              required
              :disabled="recipientFieldsLocked"
              fluid
            />
          </div>
        </div>

        <p v-if="isNewRevision || isDraft" class="muted hint">
          Editing these recipient fields updates the linked recipient record for this invoice.
        </p>
      </FormSection>

      <FormSection title="Invoice">
        <div class="grid-2">
          <div class="field">
            <label for="title">Title</label>
            <InputText
              id="title"
              v-model="inputs.title"
              required
              :invalid="!!fieldErrors.title"
              fluid
            />
            <Message
              v-if="fieldErrors.title"
              severity="error"
              size="small"
              variant="simple"
              data-testid="error-title"
            >
              {{ fieldErrors.title }}
            </Message>
          </div>
          <div v-if="!isDraft" class="field">
            <label for="invoice-date">Invoice Date</label>
            <DatePicker
              v-model="invoiceDateValue"
              input-id="invoice-date"
              data-testid="invoice-date"
              date-format="dd.mm.yy"
              show-icon
              fluid
            />
          </div>
          <div v-else class="field">
            <label>Invoice Date</label>
            <p data-testid="draft-date-hint" class="muted draft-date-hint">
              Invoice date is set on activation
            </p>
          </div>
        </div>

        <div class="field line-items">
          <label>Line Items</label>
          <div v-for="(pos, idx) in inputs.lineItems" :key="idx" class="line-item">
            <Textarea
              v-model="pos.text"
              data-testid="line-item-text"
              rows="1"
              auto-resize
              :aria-label="`Line item ${idx + 1} text`"
              class="line-item__text"
            />
            <InputNumber
              :model-value="pos.priceInCents / 100"
              mode="currency"
              currency="EUR"
              locale="de-DE"
              :aria-label="`Line item ${idx + 1} price`"
              data-testid="line-item-price"
              class="line-item__price"
              @update:model-value="(value: number | null) => setPrice(idx, value)"
            />
            <Button
              v-if="inputs.lineItems.length > 1"
              icon="pi pi-times"
              text
              severity="danger"
              :aria-label="`Remove line item ${idx + 1}`"
              @click="removeLineItem(idx)"
            />
          </div>
          <Message
            v-if="fieldErrors.lineItems"
            severity="error"
            size="small"
            variant="simple"
            data-testid="error-line-items"
          >
            {{ fieldErrors.lineItems }}
          </Message>
          <div>
            <Button label="Add Line Item" icon="pi pi-plus" text @click="addLineItem" />
          </div>
        </div>

        <div class="totals">
          <div class="field">
            <label for="vat">VAT</label>
            <Select
              v-model="inputs.vat"
              input-id="vat"
              :options="VAT_OPTIONS"
              option-label="label"
              option-value="value"
              fluid
            />
          </div>
          <div class="field">
            <label for="direct-debit">Payment Method</label>
            <div class="row gap-sm">
              <ToggleSwitch v-model="inputs.directDebit" input-id="direct-debit" />
              <span>{{ inputs.directDebit ? 'Direct Debit' : 'Bank Transfer' }}</span>
            </div>
          </div>
          <div class="field">
            <label>Gross Amount</label>
            <p data-testid="gross" class="gross">{{ formatCents(grossCents) }}</p>
          </div>
        </div>
      </FormSection>

      <FormSection title="Email">
        <div class="grid-2">
          <div class="field">
            <label for="email">E-Mail</label>
            <InputText id="email" v-model="inputs.email" type="email" fluid />
          </div>
          <div class="field">
            <label for="email-salutation">Email Salutation</label>
            <InputText id="email-salutation" v-model="inputs.emailSalutation" fluid />
          </div>
        </div>
      </FormSection>

      <div class="form-actions">
        <Button
          v-if="isDraft && draftLoaded"
          label="Delete Draft"
          icon="pi pi-trash"
          text
          severity="danger"
          :disabled="sending"
          data-testid="delete-draft"
          class="form-actions__delete"
          @click="deleteDraft"
        />
        <Button label="Cancel" text severity="secondary" @click="router.back()" />
        <Button
          v-if="!isNewRevision && (!isDraft || draftLoaded)"
          :type="isDraft ? 'submit' : 'button'"
          :label="isDraft ? 'Save Draft' : 'Save as Draft'"
          severity="secondary"
          outlined
          :disabled="sending"
          data-testid="save-draft"
          @click="!isDraft && onSaveDraft()"
        />
        <Button
          v-if="isDraft && draftLoaded"
          :label="sending ? 'Activating…' : 'Activate'"
          :disabled="sending"
          data-testid="activate-draft"
          @click="activateDraft"
        />
        <Button
          v-if="!isDraft"
          type="submit"
          :label="
            sending
              ? isNewRevision
                ? 'Saving revision…'
                : 'Generating…'
              : isNewRevision
                ? 'Save Revision'
                : 'Create Invoice'
          "
          :disabled="sending"
          data-testid="submit"
        />
      </div>
    </form>
  </div>
</template>

<style scoped>
.load-error {
  margin-bottom: 1rem;
}

.recipient-search {
  margin-bottom: 1rem;
}

.hint {
  margin: 0.75rem 0 0;
  font-size: 0.8125rem;
}

.draft-date-hint {
  margin: 0.5rem 0 0;
}

.line-items {
  margin: 1rem 0;
}

.line-item {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}

.line-item__text {
  flex: 1;
  min-width: 0;
}

.line-item__price :deep(input) {
  width: 8rem;
  text-align: right;
}

.totals {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
}

@media (max-width: 767px) {
  .totals {
    grid-template-columns: 1fr;
  }
}

.gross {
  margin: 0;
  padding: 0.5rem 0;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.form-actions__delete {
  margin-right: auto;
}
</style>
```

Then delete the directive: `git rm frontend/src/directives/autogrow.ts` (verify with `grep -rn autogrow frontend/src` that nothing else imports it).

Notes for the implementer:

- PrimeVue `Button` forwards `type`; if the "save-draft is the submit button" test sees `type="button"`, pass it through pass-through options instead: `:pt="{ root: { type: isDraft ? 'submit' : 'button' } }"` (same for the `submit` button), and report it.
- The `@click="!isDraft && onSaveDraft()"` handler on a submit button in draft mode does nothing on click; the native submit (Enter or click) reaches `onFormSubmit` — this keeps "saves exactly once".

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit --workspace=frontend -- InvoiceFormView`
Expected: PASS.

- [ ] **Step 5: Full verification and commit**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS.

```bash
git add frontend/src/views/InvoiceFormView.vue frontend/src/__tests__/InvoiceFormView.test.ts
git rm frontend/src/directives/autogrow.ts
git commit -m "feat: rebuild invoice form with PrimeVue inputs, toasts and confirmations

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Template card (upload, preview, save)

**Files:**

- Create: `frontend/src/components/TemplateCard.vue`
- Test: `frontend/src/__tests__/TemplateCard.test.ts`

**Interfaces:**

- Consumes: `useNotify`, `formatDate`
- Produces: `<TemplateCard type="RECHNUNG" label="Invoice (.docx)" accept=".docx" preview-title="Invoice Preview" :template="TemplateDto | null" @uploaded />` — reused in plan 3 for `QUITTUNG` and `ANSCHREIBEN`
- Endpoints (unchanged): `POST /api/templates/:type/preview` (multipart `template`) → `{ data: base64 }`; `POST /api/templates/:type/upload` (multipart `template`); `GET /api/templates/preview/:type` → PDF blob; download link `/api/templates/:type/download`
- `data-testid`s: `template-card`, `template-version`, `template-missing`, `template-download`, `show-preview`, `save-template`; the dialog title is an `<h3>` with `previewTitle`

Behavior: selecting a file previews it (dialog with iframe of the data URL); "Save Template" uploads it, toasts `Template uploaded successfully`, closes the dialog and emits `uploaded`; preview/upload errors toast `Missing required fields: a, b` (when `missingRequiredFields` is present) or `err.error` or a fallback (`Preview could not be generated` / `Unknown error`); network errors toast `Network error generating preview` / `Network error uploading template`; "Show Current Preview" (disabled without template) opens the dialog with the stored preview (object URL, revoked on close) or the error `err.error || 'No preview available'` inside the dialog.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/__tests__/TemplateCard.test.ts`:

```ts
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import type { TemplateDto } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TemplateCard from '../components/TemplateCard.vue';
import { withPrimeVue } from './helpers/primeVue';

const { notify } = vi.hoisted(() => ({
  notify: { success: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../composables/useNotify', () => ({ useNotify: () => notify }));

const stored: TemplateDto = {
  id: 1,
  type: 'RECHNUNG',
  version: 3,
  fileName: 'rechnung.docx',
  active: true,
  uploadedAt: '2026-10-01T10:00:00.000Z',
};

let fetchMock: ReturnType<typeof vi.fn>;

function mountCard(template: TemplateDto | null = stored): VueWrapper {
  return mount(TemplateCard, {
    props: {
      type: 'RECHNUNG',
      label: 'Invoice (.docx)',
      accept: '.docx',
      previewTitle: 'Invoice Preview',
      template,
    },
    attachTo: document.body,
    global: withPrimeVue({ stubs: { transition: false } }),
  });
}

async function chooseFile(wrapper: VueWrapper, name = 'neu.docx') {
  const input = wrapper.find('input[type="file"]');
  const file = new File(['docx'], name, {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true });
  await input.trigger('change');
  await flushPromises();
  return file;
}

function dialogTitle(): string | null {
  return document.querySelector('h3.dialog-title')?.textContent ?? null;
}

beforeEach(() => {
  Object.values(notify).forEach((fn) => fn.mockReset());
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('TemplateCard', () => {
  it('shows label, version, upload date and download link', () => {
    const wrapper = mountCard();
    expect(wrapper.find('p.template-card__label').text()).toBe('Invoice (.docx)');
    expect(wrapper.find('[data-testid="template-version"]').text()).toBe(
      'Version 3 · uploaded on 01.10.2026',
    );
    expect(wrapper.find('[data-testid="template-download"]').attributes('href')).toBe(
      '/api/templates/RECHNUNG/download',
    );
    expect(wrapper.find('input[type="file"]').attributes('accept')).toBe('.docx');
  });

  it('shows the missing state and disables the current preview', () => {
    const wrapper = mountCard(null);
    expect(wrapper.find('[data-testid="template-missing"]').text()).toBe('No template uploaded');
    expect(wrapper.find('[data-testid="template-download"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="show-preview"]').attributes('disabled')).toBeDefined();
  });

  it('previews a chosen file and saves it', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: 'UERG' }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
    const wrapper = mountCard();

    await chooseFile(wrapper);

    expect(fetchMock.mock.calls[0][0]).toBe('/api/templates/RECHNUNG/preview');
    expect(dialogTitle()).toBe('Invoice Preview');
    expect(document.querySelector('iframe')?.getAttribute('src')).toBe(
      'data:application/pdf;base64,UERG',
    );

    (document.querySelector('[data-testid="save-template"]') as HTMLElement).click();
    await flushPromises();

    expect(fetchMock.mock.calls[1][0]).toBe('/api/templates/RECHNUNG/upload');
    expect(notify.success).toHaveBeenCalledWith('Template uploaded successfully');
    expect(wrapper.emitted('uploaded')).toHaveLength(1);
    expect(dialogTitle()).toBeNull();
  });

  it('explains missing template fields', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ missingRequiredFields: ['Name', 'ReNr'] }),
    });
    const wrapper = mountCard();
    await chooseFile(wrapper);
    expect(notify.error).toHaveBeenCalledWith('Missing required fields: Name, ReNr');
    expect(dialogTitle()).toBeNull();
  });

  it('reports an upload error and keeps the dialog open', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: 'UERG' }) })
      .mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({ error: 'Too large' }) });
    const wrapper = mountCard();
    await chooseFile(wrapper);
    (document.querySelector('[data-testid="save-template"]') as HTMLElement).click();
    await flushPromises();
    expect(notify.error).toHaveBeenCalledWith('Too large');
    expect(wrapper.emitted('uploaded')).toBeUndefined();
    expect(dialogTitle()).toBe('Invoice Preview');
  });

  it('shows the current preview without a save button', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, blob: () => Promise.resolve(new Blob(['pdf'])) });
    const wrapper = mountCard();

    await wrapper.find('[data-testid="show-preview"]').trigger('click');
    await flushPromises();

    expect(fetchMock.mock.calls[0][0]).toBe('/api/templates/preview/RECHNUNG');
    expect(document.querySelector('iframe')?.getAttribute('src')).toBe('blob:preview');
    expect(document.querySelector('[data-testid="save-template"]')).toBeNull();
  });

  it('shows the current preview error inside the dialog', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: 'Preview failed' }),
    });
    const wrapper = mountCard();
    await wrapper.find('[data-testid="show-preview"]').trigger('click');
    await flushPromises();
    expect(document.body.textContent).toContain('Preview failed');
    expect(document.querySelector('iframe')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit --workspace=frontend -- TemplateCard`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `frontend/src/components/TemplateCard.vue`:

```vue
<script setup lang="ts">
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import FileUpload, { type FileUploadSelectEvent } from 'primevue/fileupload';
import Message from 'primevue/message';
import ProgressSpinner from 'primevue/progressspinner';
import type { TemplateDto, TemplateType } from 'shared';
import { ref } from 'vue';
import { useNotify } from '../composables/useNotify';
import { formatDate } from '../utils/format';

const props = defineProps<{
  type: TemplateType;
  label: string;
  accept: string;
  previewTitle: string;
  template: TemplateDto | null;
}>();

const emit = defineEmits<{
  uploaded: [];
}>();

const notify = useNotify();

const dialogVisible = ref(false);
const previewLoading = ref(false);
const previewError = ref('');
const previewUrl = ref<string | null>(null);
const pendingFile = ref<File | null>(null);
const busy = ref(false);
const fileUpload = ref<{ clear: () => void } | null>(null);
let objectUrl: string | null = null;

type ErrorBody = { missingRequiredFields?: string[]; error?: string } | null;

function errorMessage(body: ErrorBody, fallback: string): string {
  if (body?.missingRequiredFields) {
    return `Missing required fields: ${body.missingRequiredFields.join(', ')}`;
  }
  return body?.error || fallback;
}

function releaseObjectUrl() {
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
}

function resetPreview() {
  previewError.value = '';
  previewUrl.value = null;
  releaseObjectUrl();
}

function closeDialog() {
  dialogVisible.value = false;
  pendingFile.value = null;
  resetPreview();
}

function templateForm(file: File): FormData {
  const formData = new FormData();
  formData.append('template', file);
  return formData;
}

async function onFileSelect(event: FileUploadSelectEvent) {
  const file = (event.files as File[])[0];
  fileUpload.value?.clear();
  if (!file) return;

  resetPreview();
  pendingFile.value = null;
  busy.value = true;
  try {
    const res = await fetch(`/api/templates/${props.type}/preview`, {
      method: 'POST',
      body: templateForm(file),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as ErrorBody;
      notify.error(errorMessage(body, 'Preview could not be generated'));
      return;
    }
    const result = (await res.json()) as { data: string };
    previewUrl.value = `data:application/pdf;base64,${result.data}`;
    pendingFile.value = file;
    dialogVisible.value = true;
  } catch {
    notify.error('Network error generating preview');
  } finally {
    busy.value = false;
  }
}

async function saveTemplate() {
  const file = pendingFile.value;
  if (!file) return;
  busy.value = true;
  try {
    const res = await fetch(`/api/templates/${props.type}/upload`, {
      method: 'POST',
      body: templateForm(file),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as ErrorBody;
      notify.error(errorMessage(body, 'Unknown error'));
      return;
    }
    notify.success('Template uploaded successfully');
    closeDialog();
    emit('uploaded');
  } catch {
    notify.error('Network error uploading template');
  } finally {
    busy.value = false;
  }
}

async function showCurrentPreview() {
  if (!props.template) return;
  resetPreview();
  pendingFile.value = null;
  previewLoading.value = true;
  dialogVisible.value = true;
  try {
    const res = await fetch(`/api/templates/preview/${props.type}`);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as ErrorBody;
      previewError.value = body?.error || 'No preview available';
      return;
    }
    objectUrl = URL.createObjectURL(await res.blob());
    previewUrl.value = objectUrl;
  } catch {
    previewError.value = 'Network error loading preview';
  } finally {
    previewLoading.value = false;
  }
}
</script>

<template>
  <div class="template-card" data-testid="template-card">
    <div class="template-card__info">
      <p class="template-card__label">{{ label }}</p>
      <p v-if="template" class="muted template-card__meta" data-testid="template-version">
        Version {{ template.version }} · uploaded on {{ formatDate(template.uploadedAt) }}
      </p>
      <p v-else class="template-card__missing" data-testid="template-missing">
        No template uploaded
      </p>
    </div>
    <div class="row gap-sm">
      <a
        v-if="template"
        :href="`/api/templates/${type}/download`"
        class="template-card__download"
        data-testid="template-download"
      >
        Download
      </a>
      <FileUpload
        ref="fileUpload"
        mode="basic"
        :accept="accept"
        custom-upload
        :choose-label="busy ? 'Uploading…' : 'Upload New Template'"
        :disabled="busy"
        @select="onFileSelect"
      />
      <Button
        label="Show Current Preview"
        icon="pi pi-eye"
        severity="secondary"
        outlined
        :disabled="!template"
        data-testid="show-preview"
        @click="showCurrentPreview"
      />
    </div>

    <Dialog
      v-model:visible="dialogVisible"
      modal
      :style="{ width: '56rem' }"
      :breakpoints="{ '960px': '95vw' }"
      @hide="closeDialog"
    >
      <template #header>
        <h3 class="dialog-title">{{ previewTitle }}</h3>
      </template>
      <div v-if="previewLoading" class="row gap-sm preview-loading">
        <ProgressSpinner style="width: 2rem; height: 2rem" />
        <span>Generating preview…</span>
      </div>
      <Message v-else-if="previewError" severity="error">{{ previewError }}</Message>
      <iframe
        v-else-if="previewUrl"
        :src="previewUrl"
        class="preview-frame"
        title="Template Preview"
      ></iframe>
      <p v-else class="muted">No preview available</p>
      <template v-if="previewUrl && !previewError && pendingFile" #footer>
        <Button label="Close" text severity="secondary" @click="closeDialog" />
        <Button
          label="Save Template"
          icon="pi pi-check"
          :loading="busy"
          data-testid="save-template"
          @click="saveTemplate"
        />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.template-card {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: 0.5rem;
}

.template-card__info {
  min-width: 0;
}

.template-card__label {
  margin: 0;
  font-weight: 500;
}

.template-card__meta,
.template-card__missing {
  margin: 0.25rem 0 0;
  font-size: 0.8125rem;
}

.template-card__missing {
  color: var(--p-orange-500);
}

.template-card__download {
  color: var(--p-primary-color);
}

.dialog-title {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
}

.preview-loading {
  padding: 2rem 0;
  justify-content: center;
}

.preview-frame {
  width: 100%;
  min-height: 60vh;
  border: 1px solid var(--p-content-border-color);
  border-radius: 0.5rem;
}
</style>
```

Notes for the implementer:

- If FileUpload in basic mode does not emit `select` for the jsdom `change` event, check `node_modules/primevue/fileupload` (`onFileSelect` reads `event.target.files` and validates `accept` by extension/MIME); adjust only the test's `File` (name/type) to satisfy that validation and report it.
- `fileUpload.value?.clear()` resets the chosen file so the same file can be chosen again.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit --workspace=frontend -- TemplateCard`
Expected: PASS.

- [ ] **Step 5: Full verification and commit**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS.

```bash
git add frontend/src/components/TemplateCard.vue frontend/src/__tests__/TemplateCard.test.ts
git commit -m "feat: add template card with preview dialog

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Invoice settings

**Files:**

- Rewrite: `frontend/src/views/InvoiceSettingsView.vue`
- Test: `frontend/src/__tests__/InvoiceSettingsView.test.ts`

**Interfaces:**

- Consumes: `TemplateCard` (Task 6), `PageHeader`, `useNotify`, `useAppStore().checkTemplates`
- Produces (test hooks): script bindings `emailSettings`, `recipients`; `data-testid`s `env-mode`, `save-email`, `test-email`, `recipient-search`, `recipient-count`, `recipients-table`; recipient rows class `recipient-row`

Behavior:

- Heading `Invoice Settings`; Back → `router.back()`.
- `Tabs` (default `template`): **Template & preview** (`TemplateCard type="RECHNUNG" label="Invoice (.docx)" accept=".docx" preview-title="Invoice Preview"`; on `uploaded` reload `/api/templates` and call `store.checkTemplates()` so the invoice list enables "New Invoice"), **Email**, **Recipients**.
- Email: load `GET /api/email-settings` and `GET /api/email-settings/mode`; fields SMTP Host, Port, User, Password (`InputText type="password"`), "Use TLS (Secure)" (`ToggleSwitch` with `true-value="true" false-value="false"`), Subject, Body (`Textarea`), Test Email Address; env tag `PROD` (success) / `DEV` (warn) when mode is known. Save → `PUT /api/email-settings` → toast `Email settings saved` / `Error saving email settings`. Send Test Email → `POST /api/email-settings/test` → toast success `data.message || 'Test email sent'` / error `data.error || 'Failed to send test email'` / `Network error`.
- Recipients: load `GET /api/invoice-recipient?all=true` (error toast `Error loading recipients`); search over name, street, city, email (case-insensitive); count text `N recipients` or `X of N recipients` while searching; `DataTable` with row editing (`edit-mode="row"`, editors for name, street, city, salutation, email; `row-editor` column); save → `PATCH /api/invoice-recipient/:id` with `{ name, street, city, email: email || null, salutation: salutation || null }` → replace the row by id, toast `Recipient saved`; failure toast `Error saving recipient`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/__tests__/InvoiceSettingsView.test.ts`:

```ts
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import DataTable from 'primevue/datatable';
import type { EmailSettings, InvoiceRecipientDto, TemplateDto } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRouter } from 'vue-router';
import TemplateCard from '../components/TemplateCard.vue';
import { useAppStore } from '../stores/app';
import InvoiceSettingsView from '../views/InvoiceSettingsView.vue';
import { withPrimeVue } from './helpers/primeVue';

const { notify } = vi.hoisted(() => ({
  notify: { success: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('vue-router', () => ({ useRouter: vi.fn() }));
vi.mock('../composables/useNotify', () => ({ useNotify: () => notify }));

interface ViewVM {
  emailSettings: EmailSettings;
  recipients: InvoiceRecipientDto[];
}

const template: TemplateDto = {
  id: 1,
  type: 'RECHNUNG',
  version: 2,
  fileName: 'r.docx',
  active: true,
  uploadedAt: '2026-10-01T10:00:00.000Z',
};

const recipients: InvoiceRecipientDto[] = [
  {
    id: 1,
    name: 'Anna Alt',
    street: 'Hauptstr. 1',
    city: 'Berlin',
    email: 'anna@x.de',
    salutation: null,
  },
  { id: 2, name: 'Bernd Bach', street: 'Weg 2', city: 'Hamburg', email: null, salutation: 'Herr' },
];

const emailSettings: EmailSettings = {
  smtpHost: 'smtp.example.org',
  smtpPort: '587',
  smtpUser: 'user',
  smtpPassword: 'secret',
  smtpSecure: 'true',
  emailSubject: 'Rechnung {number}',
  emailBody: 'Hallo',
  emailTestAddress: 'test@example.org',
};

type Reply = { status: number; body?: unknown };
let replies: Record<string, Reply>;

const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  const key = `${init?.method ?? 'GET'} ${url}`;
  const reply = replies[key];
  if (!reply) throw new Error(`Unexpected fetch: ${key}`);
  return {
    ok: reply.status < 400,
    status: reply.status,
    json: () => Promise.resolve(reply.body),
  } as Response;
});

function bodyOf(key: string): Record<string, unknown> {
  const call = fetchMock.mock.calls.find(
    ([url, init]) => `${init?.method ?? 'GET'} ${url}` === key,
  );
  return JSON.parse(String(call?.[1]?.body));
}

async function mountView(): Promise<VueWrapper> {
  const wrapper = mount(InvoiceSettingsView, { attachTo: document.body, global: withPrimeVue() });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  replies = {
    'GET /api/templates': { status: 200, body: [template] },
    'GET /api/email-settings': { status: 200, body: emailSettings },
    'GET /api/email-settings/mode': { status: 200, body: { mode: 'development' } },
    'GET /api/invoice-recipient?all=true': { status: 200, body: recipients },
  };
  fetchMock.mockClear();
  Object.values(notify).forEach((fn) => fn.mockReset());
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(useRouter).mockReturnValue({ back: vi.fn() } as unknown as ReturnType<
    typeof useRouter
  >);
  setActivePinia(createPinia());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('InvoiceSettingsView', () => {
  it('shows heading, tabs and the invoice template card', async () => {
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="page-title"]').text()).toBe('Invoice Settings');
    expect(wrapper.text()).toContain('Template & preview');
    expect(wrapper.text()).toContain('Email');
    expect(wrapper.text()).toContain('Recipients');
    const card = wrapper.findComponent(TemplateCard);
    expect(card.props()).toMatchObject({
      type: 'RECHNUNG',
      label: 'Invoice (.docx)',
      accept: '.docx',
    });
    expect(card.props('template')).toEqual(template);
  });

  it('reloads templates and the store after an upload', async () => {
    const wrapper = await mountView();
    const checkTemplates = vi.spyOn(useAppStore(), 'checkTemplates').mockResolvedValue();
    fetchMock.mockClear();

    wrapper.findComponent(TemplateCard).vm.$emit('uploaded');
    await flushPromises();

    expect(fetchMock.mock.calls.map(([url]) => url)).toContain('/api/templates');
    expect(checkTemplates).toHaveBeenCalled();
  });

  it('loads and saves the email settings', async () => {
    replies['PUT /api/email-settings'] = { status: 200, body: {} };
    const wrapper = await mountView();
    expect((wrapper.vm as unknown as ViewVM).emailSettings.smtpHost).toBe('smtp.example.org');
    expect(wrapper.find('[data-testid="env-mode"]').text()).toBe('DEV');

    await wrapper.find('#smtp-host').setValue('mail.example.org');
    await wrapper.find('[data-testid="save-email"]').trigger('click');
    await flushPromises();

    expect(bodyOf('PUT /api/email-settings')).toMatchObject({
      smtpHost: 'mail.example.org',
      smtpSecure: 'true',
    });
    expect(notify.success).toHaveBeenCalledWith('Email settings saved');
  });

  it('reports a failed save', async () => {
    replies['PUT /api/email-settings'] = { status: 500, body: {} };
    const wrapper = await mountView();
    await wrapper.find('[data-testid="save-email"]').trigger('click');
    await flushPromises();
    expect(notify.error).toHaveBeenCalledWith('Error saving email settings');
  });

  it.each([
    [
      { status: 200, body: { message: 'Sent to test@example.org' } },
      'success',
      'Sent to test@example.org',
    ],
    [{ status: 500, body: { error: 'Auth failed' } }, 'error', 'Auth failed'],
  ] as const)('sends a test email (%#)', async (reply, kind, message) => {
    replies['POST /api/email-settings/test'] = reply;
    const wrapper = await mountView();
    await wrapper.find('[data-testid="test-email"]').trigger('click');
    await flushPromises();
    expect(notify[kind]).toHaveBeenCalledWith(message);
  });

  it('lists and searches recipients', async () => {
    const wrapper = await mountView();
    expect(wrapper.findAll('.recipient-row')).toHaveLength(2);
    expect(wrapper.find('[data-testid="recipient-count"]').text()).toBe('2 recipients');

    await wrapper.find('[data-testid="recipient-search"]').setValue('hamburg');
    await flushPromises();

    expect(wrapper.findAll('.recipient-row')).toHaveLength(1);
    expect(wrapper.find('[data-testid="recipient-count"]').text()).toBe('1 of 2 recipients');
  });

  it('saves an edited recipient', async () => {
    replies['PATCH /api/invoice-recipient/2'] = {
      status: 200,
      body: { ...recipients[1], city: 'Bremen', email: null },
    };
    const wrapper = await mountView();
    const table = wrapper
      .findAllComponents(DataTable)
      .find((c) => c.attributes('data-testid') === 'recipients-table')!;

    table.vm.$emit('row-edit-save', {
      originalEvent: new Event('click'),
      data: recipients[1],
      newData: { ...recipients[1], city: 'Bremen', email: '' },
      index: 1,
    });
    await flushPromises();

    expect(bodyOf('PATCH /api/invoice-recipient/2')).toEqual({
      name: 'Bernd Bach',
      street: 'Weg 2',
      city: 'Bremen',
      email: null,
      salutation: 'Herr',
    });
    expect((wrapper.vm as unknown as ViewVM).recipients[1].city).toBe('Bremen');
    expect(notify.success).toHaveBeenCalledWith('Recipient saved');
  });

  it('reports a failed recipient save', async () => {
    replies['PATCH /api/invoice-recipient/1'] = { status: 400, body: {} };
    const wrapper = await mountView();
    const table = wrapper
      .findAllComponents(DataTable)
      .find((c) => c.attributes('data-testid') === 'recipients-table')!;
    table.vm.$emit('row-edit-save', {
      originalEvent: new Event('click'),
      data: recipients[0],
      newData: recipients[0],
      index: 0,
    });
    await flushPromises();
    expect(notify.error).toHaveBeenCalledWith('Error saving recipient');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit --workspace=frontend -- InvoiceSettingsView`
Expected: FAIL.

- [ ] **Step 3: Rewrite the view**

Replace `frontend/src/views/InvoiceSettingsView.vue` with:

```vue
<script setup lang="ts">
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable, { type DataTableRowEditSaveEvent } from 'primevue/datatable';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';
import InputText from 'primevue/inputtext';
import Tab from 'primevue/tab';
import TabList from 'primevue/tablist';
import TabPanel from 'primevue/tabpanel';
import TabPanels from 'primevue/tabpanels';
import Tabs from 'primevue/tabs';
import Tag from 'primevue/tag';
import Textarea from 'primevue/textarea';
import ToggleSwitch from 'primevue/toggleswitch';
import type { EmailSettings, InvoiceRecipientDto, TemplateDto } from 'shared';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import TemplateCard from '../components/TemplateCard.vue';
import PageHeader from '../components/ui/PageHeader.vue';
import { useNotify } from '../composables/useNotify';
import { useAppStore } from '../stores/app';

const router = useRouter();
const store = useAppStore();
const notify = useNotify();

// ── Template ─────────────────────────────
const template = ref<TemplateDto | null>(null);

async function loadTemplate() {
  const res = await fetch('/api/templates');
  if (res.ok) {
    const all = (await res.json()) as TemplateDto[];
    template.value = all.find((t) => t.type === 'RECHNUNG') ?? null;
  }
}

async function onTemplateUploaded() {
  await loadTemplate();
  await store.checkTemplates();
}

// ── Email ─────────────────────────────
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
const envMode = ref('');
const emailSaving = ref(false);
const emailTesting = ref(false);

async function loadEmailSettings() {
  try {
    const res = await fetch('/api/email-settings');
    if (res.ok) Object.assign(emailSettings.value, await res.json());
  } catch {
    // keep defaults
  }
}

async function loadEnvMode() {
  try {
    const res = await fetch('/api/email-settings/mode');
    if (res.ok) envMode.value = ((await res.json()) as { mode: string }).mode;
  } catch {
    // unknown mode: no tag
  }
}

async function saveEmailSettings() {
  emailSaving.value = true;
  try {
    const res = await fetch('/api/email-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(emailSettings.value),
    });
    if (!res.ok) throw new Error('save failed');
    notify.success('Email settings saved');
  } catch {
    notify.error('Error saving email settings');
  } finally {
    emailSaving.value = false;
  }
}

async function sendTestEmail() {
  emailTesting.value = true;
  try {
    const res = await fetch('/api/email-settings/test', { method: 'POST' });
    const data = (await res.json()) as { message?: string; error?: string };
    if (res.ok) notify.success(data.message || 'Test email sent');
    else notify.error(data.error || 'Failed to send test email');
  } catch {
    notify.error('Network error');
  } finally {
    emailTesting.value = false;
  }
}

// ── Recipients ─────────────────────────────
const recipients = ref<InvoiceRecipientDto[]>([]);
const recLoading = ref(false);
const recSearch = ref('');
const editingRows = ref<InvoiceRecipientDto[]>([]);

const filteredRecipients = computed(() => {
  const q = recSearch.value.trim().toLowerCase();
  if (!q) return recipients.value;
  return recipients.value.filter(
    (r) =>
      r.name.toLowerCase().includes(q) ||
      r.street.toLowerCase().includes(q) ||
      r.city.toLowerCase().includes(q) ||
      (r.email ?? '').toLowerCase().includes(q),
  );
});

const recipientCountText = computed(() =>
  recSearch.value.trim()
    ? `${filteredRecipients.value.length} of ${recipients.value.length} recipients`
    : `${recipients.value.length} recipients`,
);

async function loadRecipients() {
  recLoading.value = true;
  try {
    const res = await fetch('/api/invoice-recipient?all=true');
    if (!res.ok) throw new Error('load failed');
    recipients.value = await res.json();
  } catch {
    notify.error('Error loading recipients');
  } finally {
    recLoading.value = false;
  }
}

async function onRowEditSave(event: DataTableRowEditSaveEvent) {
  const edited = event.newData as InvoiceRecipientDto;
  try {
    const res = await fetch(`/api/invoice-recipient/${edited.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: edited.name,
        street: edited.street,
        city: edited.city,
        email: edited.email || null,
        salutation: edited.salutation || null,
      }),
    });
    if (!res.ok) throw new Error('save failed');
    const updated = (await res.json()) as InvoiceRecipientDto;
    recipients.value = recipients.value.map((r) => (r.id === updated.id ? updated : r));
    notify.success('Recipient saved');
  } catch {
    notify.error('Error saving recipient');
  }
}

onMounted(() => {
  void loadTemplate();
  void loadEmailSettings();
  void loadEnvMode();
  void loadRecipients();
});
</script>

<template>
  <div class="page">
    <PageHeader title="Invoice Settings">
      <template #actions>
        <Button
          label="Back"
          icon="pi pi-arrow-left"
          text
          severity="secondary"
          @click="router.back()"
        />
      </template>
    </PageHeader>

    <Tabs value="template">
      <TabList>
        <Tab value="template">Template &amp; preview</Tab>
        <Tab value="email">Email</Tab>
        <Tab value="recipients">Recipients</Tab>
      </TabList>
      <TabPanels>
        <TabPanel value="template">
          <TemplateCard
            type="RECHNUNG"
            label="Invoice (.docx)"
            accept=".docx"
            preview-title="Invoice Preview"
            :template="template"
            @uploaded="onTemplateUploaded"
          />
        </TabPanel>

        <TabPanel value="email">
          <div class="stack">
            <div class="row gap-sm">
              <h3 class="section-title">Email Settings</h3>
              <Tag
                v-if="envMode"
                :value="envMode === 'production' ? 'PROD' : 'DEV'"
                :severity="envMode === 'production' ? 'success' : 'warn'"
                data-testid="env-mode"
              />
            </div>
            <div class="grid-2">
              <div class="field">
                <label for="smtp-host">SMTP Host</label>
                <InputText
                  id="smtp-host"
                  v-model="emailSettings.smtpHost"
                  placeholder="smtp.example.com"
                  fluid
                />
              </div>
              <div class="field">
                <label for="smtp-port">SMTP Port</label>
                <InputText
                  id="smtp-port"
                  v-model="emailSettings.smtpPort"
                  placeholder="587"
                  fluid
                />
              </div>
              <div class="field">
                <label for="smtp-user">SMTP User</label>
                <InputText
                  id="smtp-user"
                  v-model="emailSettings.smtpUser"
                  placeholder="user@example.com"
                  fluid
                />
              </div>
              <div class="field">
                <label for="smtp-password">SMTP Password</label>
                <InputText
                  id="smtp-password"
                  v-model="emailSettings.smtpPassword"
                  type="password"
                  autocomplete="new-password"
                  fluid
                />
              </div>
            </div>
            <div class="row gap-sm">
              <ToggleSwitch
                v-model="emailSettings.smtpSecure"
                input-id="smtp-secure"
                true-value="true"
                false-value="false"
              />
              <label for="smtp-secure">Use TLS (Secure)</label>
            </div>
            <div class="field">
              <label for="email-subject">
                Email Subject
                <span class="muted">({number}, {salutation}, {name}, {title}, {email})</span>
              </label>
              <InputText
                id="email-subject"
                v-model="emailSettings.emailSubject"
                placeholder="Ihre Rechnung {number}"
                fluid
              />
            </div>
            <div class="field">
              <label for="email-body">
                Email Body
                <span class="muted">({salutation}, {name}, {number}, {title}, {email})</span>
              </label>
              <Textarea
                id="email-body"
                v-model="emailSettings.emailBody"
                rows="5"
                auto-resize
                fluid
              />
            </div>
            <div class="field">
              <label for="email-test-address">
                Test Email Address
                <span class="muted">(dev: all invoices redirected here)</span>
              </label>
              <InputText
                id="email-test-address"
                v-model="emailSettings.emailTestAddress"
                type="email"
                placeholder="test@example.com"
                fluid
              />
            </div>
            <div class="row gap-sm">
              <Button
                label="Save Email Settings"
                icon="pi pi-check"
                :loading="emailSaving"
                data-testid="save-email"
                @click="saveEmailSettings"
              />
              <Button
                label="Send Test Email"
                icon="pi pi-send"
                severity="secondary"
                outlined
                :loading="emailTesting"
                data-testid="test-email"
                @click="sendTestEmail"
              />
            </div>
          </div>
        </TabPanel>

        <TabPanel value="recipients">
          <DataTable
            v-model:editing-rows="editingRows"
            :value="filteredRecipients"
            data-key="id"
            edit-mode="row"
            size="small"
            :loading="recLoading"
            :row-class="() => 'recipient-row'"
            data-testid="recipients-table"
            @row-edit-save="onRowEditSave"
          >
            <template #header>
              <div class="row row--between">
                <IconField>
                  <InputIcon class="pi pi-search" />
                  <InputText
                    v-model="recSearch"
                    placeholder="Search recipients by name, street, or city…"
                    aria-label="Search recipients"
                    data-testid="recipient-search"
                  />
                </IconField>
                <span class="muted" data-testid="recipient-count">{{ recipientCountText }}</span>
              </div>
            </template>
            <template #empty>No recipients found.</template>
            <Column field="name" header="Name" sortable>
              <template #editor="{ data, field }">
                <InputText v-model="data[field]" size="small" fluid />
              </template>
            </Column>
            <Column field="street" header="Street">
              <template #editor="{ data, field }">
                <InputText v-model="data[field]" size="small" fluid />
              </template>
            </Column>
            <Column field="city" header="City" sortable>
              <template #editor="{ data, field }">
                <InputText v-model="data[field]" size="small" fluid />
              </template>
            </Column>
            <Column field="salutation" header="Salutation">
              <template #body="{ data }">{{ data.salutation ?? '–' }}</template>
              <template #editor="{ data, field }">
                <InputText v-model="data[field]" size="small" fluid />
              </template>
            </Column>
            <Column field="email" header="E-Mail">
              <template #body="{ data }">{{ data.email ?? '–' }}</template>
              <template #editor="{ data, field }">
                <InputText v-model="data[field]" type="email" size="small" fluid />
              </template>
            </Column>
            <Column :row-editor="true" header-style="width: 7rem" body-style="text-align: right" />
          </DataTable>
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>

<style scoped>
.section-title {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit --workspace=frontend -- InvoiceSettingsView`
Expected: PASS. Tabs render all panels by default (not `lazy`), so the email and recipient fields exist in the DOM without switching tabs; if PrimeVue 5 renders inactive panels lazily, switch the tab in the test by clicking the `Tab` with that label before asserting, and report it.

- [ ] **Step 5: Full verification and commit**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS.

```bash
git add frontend/src/views/InvoiceSettingsView.vue frontend/src/__tests__/InvoiceSettingsView.test.ts
git commit -m "feat: rebuild invoice settings with tabs, template card and recipient editing

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Browser verification of the invoice screens

**Files:** none (verification only; report defects precisely, do not fix).

- [ ] **Step 1: Suite and build**

Run: `npm run lint && npm run test:unit && npm run test:integration && npm run build`
Expected: all pass.

- [ ] **Step 2: Walkthrough (dev servers, scratch DB)**

Start (background) from the worktree, on ports that don't clash with the user's Docker app (3000/5173):

```bash
PORT=3996 DATABASE_URL="file:/tmp/primevue-invoices.sqlite" DATA_DIR=/tmp/primevue-invoices-data npm run dev --workspace=backend
VITE_API_TARGET=http://localhost:3996 npx --workspace=frontend vite --port 5179 --strictPort
```

(The backend `dev` script migrates the scratch DB itself.)

With Playwright MCP (`mcp__playwright__*`) at http://localhost:5179, in light mode, then repeat key screens in dark mode and at 390×844:

1. Invoices list without template: warning message, "New Invoice" disabled.
2. Invoice Settings → Template tab: upload `e2e/fixture/Rechnung.docx` → preview dialog with PDF iframe → Save Template → toast; card shows Version 1; "Show Current Preview" works. (LibreOffice is at `/usr/bin/libreoffice`.)
3. Email tab: fields load, Save shows a toast. Recipients tab: appears after step 4; edit a city inline and save.
4. New Invoice: search an unknown recipient, fill fields, title, two line items (one multi-line), price `12,50` → gross updates with VAT 19 %; toggle direct debit; Create Invoice → toast, detail page opens.
5. Detail: header `Invoice N / YYYY`, status Active, Revision 1 expanded, line breaks kept; Download PDF opens; Send Test Email shows a toast (error toast is fine without SMTP); Cancel invoice asks for confirmation (cancel once, then confirm) → status Cancelled.
6. List: default hides the cancelled invoice; status filter "All" shows it; global search; amount and date range filters; select two rows → "Download selected (2)" downloads a ZIP or shows the rejection toast for the cancelled one.
7. Copy an invoice → form titled "Duplicate Invoice" with today's date; "Save as Draft" → list shows the Drafts table; open draft → date hint, Enter in a text field saves the draft (toast "Draft saved."), Activate asks for confirmation and opens the new invoice.
8. Console: no errors other than the PrimeUI license warning.
9. Screenshots (list light/dark, detail, form, settings, mobile list) into `/home/sebastian/code/mv-dashboard/.claude/worktrees/feat-primevue/.superpowers/sdd/2026-10-05-primevue-2-invoices/screens/`; delete any `.playwright-mcp/` in the worktree.

Stop both servers; delete `/tmp/primevue-invoices.sqlite` and `/tmp/primevue-invoices-data`.

- [ ] **Step 3: Branch status**

Run: `git status --short && git log --oneline master..HEAD`
Expected: clean tree; plan-1 and plan-2 commits only.
