# PrimeVue Rewrite — Plan 3: Donation Receipts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the donation-receipt screens (list, detail, form, settings) and the `DonorAutocomplete` picker with PrimeVue 5, reusing the invoice building blocks from plan 2.

**Architecture:** Task 1 lifts the pieces both document types share out of the invoice screens: list filter state (`useTableFilters`), the row-click guard (`isControlClick`), the per-action request runner (`useActionRunner`), the failed-PDF notice (`PdfFailureNotice`), the toolbar status options, and the detail-page CSS. The invoice screens move onto these with their tests unchanged. The receipt screens are then built on the same helpers plus plan 2's `TemplateCard`, `useBatchDownload`, `StatusTag`, range filters and date helpers. Lists load everything once and filter in the browser; toasts and confirm dialogs replace banners, `alert()` and inline confirmations.

**Tech Stack:** Vue 3 `<script setup>` + TypeScript, PrimeVue 5.0.2 (DataTable, Column, AutoComplete, Accordion, Tabs, DatePicker, InputNumber, ToggleSwitch, SelectButton, Tag, Message), Vitest + @vue/test-utils + jsdom.

**Spec:** `docs/superpowers/specs/2026-10-05-primevue-frontend-design.md` (sections "Screens → List pages / Detail pages / Forms / Instructor components (DonorAutocomplete) / Settings pages")

**Series:** plan 3 of 5 on branch `feat/primevue`, which merges once after plan 5. Plans 1 (foundation) and 2 (invoices) are done.

## Global Constraints

- Work only in the worktree `.claude/worktrees/feat-primevue` on branch `feat/primevue`. Never touch `master` or other branches; never push.
- Verification after every task: `npm run lint && npm run test:unit && npm run test:integration` (all pass, zero lint warnings).
- No backend/API changes. The receipt list loads `/api/donation-receipt?withCancelled=true` once and filters in the browser.
- Explicit component imports (`import DataTable from 'primevue/datatable'`). No deprecated v5 components (`InputMask`, `MultiSelect`, `Password`, …).
- Rewritten files must not contain Tailwind classes. Use `src/assets/layout.css` helpers (`.page`, `.stack`, `.row`, `.row--between`, `.grid-2`, `.gap-xs|sm|md|lg`, `.muted`, `.field`, and from Task 1 `.section-title`, `.facts`, `.facts--grid`) and `<style scoped>` with PrimeVue CSS variables.
- Building blocks: `PageHeader` (`title`, optional `subtitle`, `#actions`; `<h2 data-testid="page-title">`), `FormSection` (`title`, default slot), `TABLE_DEFAULTS` (spread with `v-bind`), `globalFilter()`, `useNotify()` (`success|info|warn|error(detail)`), `useConfirmAction()` (`confirmAction({ message, header?, acceptLabel?, rejectLabel?, danger? }): Promise<boolean>`), `useBatchDownload({ url, fallbackFileName, singular, plural })` → `{ download(ids): Promise<number[] /* rejected */>, downloading }`, `StatusTag` (`:tag`), `documentStatusTag` / `revisionStatusTag` / `pdfStatusTag`, `AMOUNT_RANGE` / `DATE_RANGE` match modes, `AmountRangeFilter`, `TemplateCard` (`type`, `label`, `accept`, `previewTitle`, `template`; emits `uploaded`).
- Feedback: success/error/warning/info messages are toasts via `useNotify`; field validation errors appear under the field as `Message severity="error" size="small" variant="simple"`; rewritten files use neither `window.confirm` nor `alert`.
- Dates: display `formatDate` (calendar dates such as `donationDate`, `exemptionDate`), `formatDateTime` / `formatTimestampDate` (instants such as `createdAt`). DatePicker models are `Date`; API strings stay `YYYY-MM-DD`, converted with `toIsoDate` / `fromIsoDate`. "Today" is always `toIsoDate(new Date())`, never `toISOString()`. Money: integer cents in the model; `InputNumber mode="currency" currency="EUR" locale="de-DE"` edits euros.
- Keep these user-visible texts and selectors (e2e relies on them; e2e itself is updated in plan 5):
  - Headings: `Donation Receipts` and `Donation Receipt Settings` (both h2); `Association Data (Pre-fill)` and `Templates` (both h3).
  - Buttons: `Settings`, `New Receipt`, `Save` (association data), `Save Template`.
  - The list's search input placeholder contains `Search`.
  - Labels `Treasurer`, `Charitable Purpose`, `Tax Office`, `Tax Number`, `Assessment Period`, each with a `for` attribute that points at its input's `id`.
  - Template cards: `<p>` texts `Cover Letter (.docx)` and `Donation Receipt (.pdf)`; one `No template uploaded` per missing template; `Version …`.
  - Preview dialog titles `Cover Letter Preview` and `Receipt Preview`, each an `<h3>`.
  - File inputs `input[type="file"][accept*=".docx"]` and `[accept*=".pdf"]`, and the preview `<iframe>`.
- Known e2e breaks that plan 5 fixes (do not work around them here):
  - The two `input[type="date"]` list filters are replaced by a DatePicker range in the filter row.
  - `#withCancelled` is replaced by the status SelectButton `data-testid="status-filter"`.
  - The detail heading changes from `Receipt Details` to `Receipt {number}`.
  - Revision labels change from `R1` to `Revision 1`.
  - The settings success banner `.bg-green-50` is replaced by a toast.
  - Settings sections now sit in tabs, so inactive tabs are hidden.
- Tests mock `useNotify` / `useConfirmAction` / `useBatchDownload` with `vi.hoisted` + `vi.mock`. Components mount with `global: withPrimeVue(...)` (from `src/__tests__/helpers/primeVue.ts`). `RouterLink` is stubbed as `{ template: '<a><slot /></a>' }` where no router is installed. Views that rely on real DOM events (checkbox `change`, submit-button clicks) mount with `attachTo: document.body`. Auto-unmount and the `matchMedia` / `ResizeObserver` shims are in `src/__tests__/setup.ts`.
- Commit messages: conventional commits with lower-case subjects (commitlint), ending with exactly `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **Editing donor fields in a new revision.** The fields are editable, and the edited values are posted in `inputs` so the backend updates the linked donor in place (docs/RECIPIENT_MANAGEMENT.md). The current receipt form wrongly locks them. Test: Task 5.
2. **Typing in the donor search after picking a donor.** This clears the pick and unlocks the fields, and saving then sends `donorData` instead of the old `donorId`. Test: Task 2 (emits `null`) and Task 5 (unlock).
3. **Cover letter switched off.** Letter Salutation is no longer required. Switched on and empty, the field error shows and nothing is posted. Test: Task 5.
4. **Clearing the exemption date** (form and settings). An empty string is sent, never `null` or an invalid date. Test: Task 5 and Task 6.
5. **Uploading the receipt template in settings** enables "New Receipt" without a page reload (the app store is refreshed). Test: Task 6.

---

## File Structure

| File                                                                                              | Responsibility                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/composables/useTableFilters.ts` (new)                                               | DataTable filter state: defaults, global search, toolbar status filter, clear                                                                                                                                                                                                                                              |
| `frontend/src/utils/tableRowClick.ts` (new)                                                       | `isControlClick(event)`: clicks on controls must not open the row                                                                                                                                                                                                                                                          |
| `frontend/src/composables/useActionRunner.ts` (new)                                               | Per-action busy flags and request-or-error-toast helper for detail pages                                                                                                                                                                                                                                                   |
| `frontend/src/components/PdfFailureNotice.vue` (new)                                              | Failed-PDF warning with optional technical details toggle                                                                                                                                                                                                                                                                  |
| `frontend/src/utils/statusTags.ts` (modify)                                                       | + `DOCUMENT_STATUS_FILTER_OPTIONS` (Active / Cancelled / All)                                                                                                                                                                                                                                                              |
| `frontend/src/assets/layout.css` (modify)                                                         | + `.section-title`, `.facts`, `.facts--grid`                                                                                                                                                                                                                                                                               |
| `frontend/src/views/InvoiceView.vue`, `InvoiceDetailView.vue`, `InvoiceSettingsView.vue` (modify) | Use the shared helpers; drop the moved code/CSS                                                                                                                                                                                                                                                                            |
| `frontend/src/components/DonorAutocomplete.vue` (rewrite)                                         | PrimeVue `AutoComplete` donor search with "new donor" option                                                                                                                                                                                                                                                               |
| `frontend/src/views/DonationReceiptView.vue` (rewrite)                                            | Receipts DataTable                                                                                                                                                                                                                                                                                                         |
| `frontend/src/views/DonationReceiptDetailView.vue` (rewrite)                                      | Summary card + revisions accordion + actions                                                                                                                                                                                                                                                                               |
| `frontend/src/views/DonationReceiptFormView.vue` (rewrite)                                        | New / copy / revision form                                                                                                                                                                                                                                                                                                 |
| `frontend/src/views/SettingsView.vue` (rewrite)                                                   | Tabs: association data, donors, templates                                                                                                                                                                                                                                                                                  |
| Tests                                                                                             | `useTableFilters.test.ts`, `tableRowClick.test.ts`, `useActionRunner.test.ts`, `PdfFailureNotice.test.ts` (new); `statusTags.test.ts` (append); `DonorAutocomplete.test.ts`, `DonationReceiptView.test.ts` (rewrite); `DonationReceiptDetailView.test.ts`, `DonationReceiptFormView.test.ts`, `SettingsView.test.ts` (new) |

---

### Task 1: Shared list and detail helpers (and move the invoice screens onto them)

**Files:**

- Create: `frontend/src/composables/useTableFilters.ts`, `frontend/src/utils/tableRowClick.ts`, `frontend/src/composables/useActionRunner.ts`, `frontend/src/components/PdfFailureNotice.vue`
- Modify: `frontend/src/utils/statusTags.ts`, `frontend/src/assets/layout.css`, `frontend/src/views/InvoiceView.vue`, `frontend/src/views/InvoiceDetailView.vue`, `frontend/src/views/InvoiceSettingsView.vue`
- Test: `frontend/src/__tests__/useTableFilters.test.ts`, `frontend/src/__tests__/tableRowClick.test.ts`, `frontend/src/__tests__/useActionRunner.test.ts`, `frontend/src/__tests__/PdfFailureNotice.test.ts` (new), `frontend/src/__tests__/statusTags.test.ts` (append). The existing `InvoiceView.test.ts`, `InvoiceDetailView.test.ts` and `InvoiceSettingsView.test.ts` must pass **unchanged**.

**Interfaces:**

- Produces:
  - `useTableFilters(defaults: () => DataTableFilterMeta): { filters: Ref<DataTableFilterMeta>; globalSearch: WritableComputedRef<string>; statusFilter: WritableComputedRef<string | null>; clearFilters(): void }`. Every write replaces `filters.value` with a new object, so DataTable sees the change.
  - `isControlClick(event: Event): boolean`
  - `useActionRunner(): { busy: Ref<Record<string, boolean>>; run(key: string, request: () => Promise<Response>, errorText: (body: Record<string, string>) => string): Promise<boolean> }`. Non-ok → `notify.error(errorText(body))` (body `{}` when not JSON); a rejection → `notify.error('Network error')`.
  - `<PdfFailureNotice :error="string | null" :tech-error="string | null" />`, with testids `pdf-failure` and `toggle-tech-error`
  - `DOCUMENT_STATUS_FILTER_OPTIONS: { label: string; value: string | null }[]`
  - CSS classes `.section-title`, `.facts`, `.facts--grid`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/__tests__/useTableFilters.test.ts`:

```ts
import { FilterMatchMode } from '@primevue/core/api';
import { describe, expect, it } from 'vitest';
import { useTableFilters } from '../composables/useTableFilters';
import { globalFilter } from '../utils/tableDefaults';

function defaults() {
  return {
    ...globalFilter(),
    name: { value: null, matchMode: FilterMatchMode.CONTAINS },
    status: { value: 'AKTIV', matchMode: FilterMatchMode.EQUALS },
  };
}

describe('useTableFilters', () => {
  it('starts with the defaults', () => {
    const { filters, globalSearch, statusFilter } = useTableFilters(defaults);
    expect(filters.value).toEqual(defaults());
    expect(globalSearch.value).toBe('');
    expect(statusFilter.value).toBe('AKTIV');
  });

  it('writes the global search with its match mode; empty text clears it', () => {
    const { filters, globalSearch } = useTableFilters(defaults);
    globalSearch.value = 'bach';
    expect(filters.value.global).toEqual({ value: 'bach', matchMode: FilterMatchMode.CONTAINS });
    expect(globalSearch.value).toBe('bach');
    globalSearch.value = '';
    expect(filters.value.global).toEqual({ value: null, matchMode: FilterMatchMode.CONTAINS });
  });

  it('writes the status filter; null shows all', () => {
    const { filters, statusFilter } = useTableFilters(defaults);
    statusFilter.value = null;
    expect(filters.value.status).toEqual({ value: null, matchMode: FilterMatchMode.EQUALS });
    statusFilter.value = 'STORNIERT';
    expect(statusFilter.value).toBe('STORNIERT');
  });

  it('replaces the filters object on every write', () => {
    const { filters, globalSearch } = useTableFilters(defaults);
    const before = filters.value;
    globalSearch.value = 'x';
    expect(filters.value).not.toBe(before);
    expect(filters.value.name).toEqual(before.name);
  });

  it('clears back to fresh defaults', () => {
    const { filters, globalSearch, statusFilter, clearFilters } = useTableFilters(defaults);
    globalSearch.value = 'x';
    statusFilter.value = null;
    clearFilters();
    expect(filters.value).toEqual(defaults());
  });

  it('reads null when there is no status filter', () => {
    const { statusFilter } = useTableFilters(() => ({ ...globalFilter() }));
    expect(statusFilter.value).toBeNull();
  });
});
```

Create `frontend/src/__tests__/tableRowClick.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { isControlClick } from '../utils/tableRowClick';

function clickEventOn(rowHtml: string): Event {
  document.body.innerHTML = `<table><tbody><tr>${rowHtml}</tr></tbody></table>`;
  return { target: document.getElementById('t') } as unknown as Event;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('isControlClick', () => {
  it.each([
    ['inside a button', '<td><button><span id="t">Copy</span></button></td>'],
    ['on a link', '<td><a id="t" href="#">1 / 2026</a></td>'],
    ['on an input', '<td><input id="t" /></td>'],
    ['inside a PrimeVue checkbox', '<td><div class="p-checkbox"><div id="t"></div></div></td>'],
    ['on the selection cell', '<td id="t" data-p-selection-column="true"></td>'],
  ])('is true %s', (_, html) => {
    expect(isControlClick(clickEventOn(html))).toBe(true);
  });

  it('is false on plain cell text', () => {
    expect(isControlClick(clickEventOn('<td><span id="t">Anna Alt</span></td>'))).toBe(false);
  });

  it('is false without a target', () => {
    expect(isControlClick({ target: null } as unknown as Event)).toBe(false);
  });
});
```

Create `frontend/src/__tests__/useActionRunner.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useActionRunner } from '../composables/useActionRunner';

const { notify } = vi.hoisted(() => ({
  notify: { success: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../composables/useNotify', () => ({ useNotify: () => notify }));

function response(ok: boolean, body: unknown): Response {
  return {
    ok,
    json: () => (body instanceof Error ? Promise.reject(body) : Promise.resolve(body)),
  } as unknown as Response;
}

beforeEach(() => {
  Object.values(notify).forEach((fn) => fn.mockReset());
});

describe('useActionRunner', () => {
  it('resolves true on success and flags the action while it runs', async () => {
    const { busy, run } = useActionRunner();
    let resolve: (value: Response) => void = () => {};
    const pending = run(
      'save',
      () => new Promise((r) => (resolve = r)),
      () => 'unused',
    );

    expect(busy.value.save).toBe(true);
    resolve(response(true, {}));
    expect(await pending).toBe(true);
    expect(busy.value.save).toBe(false);
    expect(notify.error).not.toHaveBeenCalled();
  });

  it('toasts the error text built from the response body', async () => {
    const { run } = useActionRunner();
    const ok = await run(
      'cancel',
      () => Promise.resolve(response(false, { error: 'Already cancelled' })),
      (body) => body.error || 'Error cancelling',
    );
    expect(ok).toBe(false);
    expect(notify.error).toHaveBeenCalledWith('Already cancelled');
  });

  it('uses an empty body when the error response is not JSON', async () => {
    const { run } = useActionRunner();
    await run(
      'cancel',
      () => Promise.resolve(response(false, new Error('not json'))),
      (body) => body.error || 'Error cancelling',
    );
    expect(notify.error).toHaveBeenCalledWith('Error cancelling');
  });

  it('reports network errors and clears the busy flag', async () => {
    const { busy, run } = useActionRunner();
    const ok = await run(
      'retry',
      () => Promise.reject(new Error('offline')),
      () => 'unused',
    );
    expect(ok).toBe(false);
    expect(notify.error).toHaveBeenCalledWith('Network error');
    expect(busy.value.retry).toBe(false);
  });
});
```

Create `frontend/src/__tests__/PdfFailureNotice.test.ts`:

```ts
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import PdfFailureNotice from '../components/PdfFailureNotice.vue';
import { withPrimeVue } from './helpers/primeVue';

function mountNotice(error: string | null, techError: string | null) {
  return mount(PdfFailureNotice, { props: { error, techError }, global: withPrimeVue() });
}

describe('PdfFailureNotice', () => {
  it('shows the error', () => {
    expect(mountNotice('Template broken', null).text()).toContain('Template broken');
  });

  it('falls back to a generic message', () => {
    expect(mountNotice(null, null).text()).toContain(
      'PDF could not be generated. Please try again.',
    );
  });

  it('has no details toggle without technical details', () => {
    const wrapper = mountNotice('x', null);
    expect(wrapper.find('[data-testid="toggle-tech-error"]').exists()).toBe(false);
  });

  it('toggles the technical details', async () => {
    const wrapper = mountNotice('x', 'stack trace');
    const toggle = wrapper.find('[data-testid="toggle-tech-error"]');
    expect(toggle.text()).toBe('Show Details');
    expect(wrapper.find('pre').exists()).toBe(false);

    await toggle.trigger('click');
    expect(wrapper.find('pre').text()).toBe('stack trace');
    expect(toggle.text()).toBe('Hide Details');

    await toggle.trigger('click');
    expect(wrapper.find('pre').exists()).toBe(false);
  });
});
```

In `frontend/src/__tests__/statusTags.test.ts` add `DOCUMENT_STATUS_FILTER_OPTIONS` to the import from `../utils/statusTags` and append inside the `describe('status tags', …)` block:

```ts
it('offers a toolbar status filter including "All"', () => {
  expect(DOCUMENT_STATUS_FILTER_OPTIONS).toEqual([
    { label: 'Active', value: 'AKTIV' },
    { label: 'Cancelled', value: 'STORNIERT' },
    { label: 'All', value: null },
  ]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit --workspace=frontend -- useTableFilters tableRowClick useActionRunner PdfFailureNotice statusTags`
Expected: FAIL (modules and export not found).

- [ ] **Step 3: Implement the helpers**

Create `frontend/src/composables/useTableFilters.ts`:

```ts
import { FilterMatchMode } from '@primevue/core/api';
import type { DataTableFilterMeta, DataTableFilterMetaData } from 'primevue/datatable';
import { computed, ref } from 'vue';

/**
 * DataTable filter state with a global search and a toolbar `status` filter. Every write
 * replaces the filters object so DataTable re-filters; `clearFilters` restores the defaults.
 */
export function useTableFilters(defaults: () => DataTableFilterMeta) {
  const filters = ref<DataTableFilterMeta>(defaults());

  function valueOf(field: string): unknown {
    return (filters.value[field] as DataTableFilterMetaData | undefined)?.value ?? null;
  }

  function setValue(field: string, value: unknown) {
    const current = filters.value[field] as DataTableFilterMetaData | undefined;
    filters.value = {
      ...filters.value,
      [field]: { matchMode: FilterMatchMode.EQUALS, ...current, value },
    };
  }

  const globalSearch = computed<string>({
    get: () => (valueOf('global') as string | null) ?? '',
    set: (value) => setValue('global', value || null),
  });

  const statusFilter = computed<string | null>({
    get: () => valueOf('status') as string | null,
    set: (value) => setValue('status', value),
  });

  function clearFilters() {
    filters.value = defaults();
  }

  return { filters, globalSearch, statusFilter, clearFilters };
}
```

Create `frontend/src/utils/tableRowClick.ts`:

```ts
/** Clicks on checkboxes, buttons, links, inputs and the selection cell belong to that control, not to the row. */
export function isControlClick(event: Event): boolean {
  const target = event.target as HTMLElement | null;
  return !!target?.closest('.p-checkbox, button, a, input, td[data-p-selection-column="true"]');
}
```

Create `frontend/src/composables/useActionRunner.ts`:

```ts
import { ref } from 'vue';
import { useNotify } from './useNotify';

export type ErrorBody = Record<string, string>;

/** Runs one request per action key with a busy flag; failures become error toasts. */
export function useActionRunner() {
  const notify = useNotify();
  const busy = ref<Record<string, boolean>>({});

  /** Resolves with whether the request succeeded. */
  async function run(
    key: string,
    request: () => Promise<Response>,
    errorText: (body: ErrorBody) => string,
  ): Promise<boolean> {
    busy.value = { ...busy.value, [key]: true };
    try {
      const res = await request();
      const body = (await res.json().catch(() => ({}))) as ErrorBody;
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

  return { busy, run };
}
```

Create `frontend/src/components/PdfFailureNotice.vue`:

```vue
<script setup lang="ts">
import Button from 'primevue/button';
import Message from 'primevue/message';
import { ref } from 'vue';

defineProps<{
  error: string | null;
  techError: string | null;
}>();

const showDetails = ref(false);
</script>

<template>
  <Message severity="warn" data-testid="pdf-failure">
    <div class="stack gap-sm">
      <span>{{ error || 'PDF could not be generated. Please try again.' }}</span>
      <Button
        v-if="techError"
        :label="showDetails ? 'Hide Details' : 'Show Details'"
        size="small"
        text
        data-testid="toggle-tech-error"
        @click="showDetails = !showDetails"
      />
      <pre v-if="techError && showDetails" class="pdf-failure__tech">{{ techError }}</pre>
    </div>
  </Message>
</template>

<style scoped>
.pdf-failure__tech {
  white-space: pre-wrap;
  font-size: 0.75rem;
  margin: 0;
}
</style>
```

Append to `frontend/src/utils/statusTags.ts`:

```ts
/** Toolbar status filter for list pages: the document states plus "All" (no filter). */
export const DOCUMENT_STATUS_FILTER_OPTIONS: { label: string; value: string | null }[] = [
  ...DOCUMENT_STATUS_OPTIONS,
  { label: 'All', value: null },
];
```

Append to `frontend/src/assets/layout.css`:

```css
.section-title {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
}

/* Label/value grid for detail pages: <dl class="facts"><div><dt/><dd/></div>…</dl> */
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
```

- [ ] **Step 4: Run the new tests to verify they pass**

Run: `npm run test:unit --workspace=frontend -- useTableFilters tableRowClick useActionRunner PdfFailureNotice statusTags`
Expected: PASS.

- [ ] **Step 5: Move the invoice screens onto the helpers**

`frontend/src/views/InvoiceView.vue`:

- Imports:
  - In the `primevue/datatable` import, drop `type DataTableFilterMetaData`; keep `type DataTableFilterMeta` and `type DataTableRowClickEvent`.
  - Change `import { computed, onMounted, ref } from 'vue';` to `import { onMounted, ref } from 'vue';`.
  - In the `../utils/statusTags` import, replace `DOCUMENT_STATUS_OPTIONS` with `DOCUMENT_STATUS_FILTER_OPTIONS`.
  - Add `import { useTableFilters } from '../composables/useTableFilters';` and `import { isControlClick } from '../utils/tableRowClick';`.
- Replace everything from `const filters = ref<DataTableFilterMeta>(defaultFilters());` through the end of `function clearFilters() { … }` with:

```ts
const { filters, globalSearch, statusFilter, clearFilters } = useTableFilters(defaultFilters);
```

- Delete the local `isControlClick` function and its comment.
- In the template, change `:options="STATUS_FILTER_OPTIONS"` to `:options="DOCUMENT_STATUS_FILTER_OPTIONS"`.
- In `<style scoped>`, delete the `.section-title { … }` rule.

`frontend/src/views/InvoiceDetailView.vue`:

- Add `import PdfFailureNotice from '../components/PdfFailureNotice.vue';` and `import { useActionRunner } from '../composables/useActionRunner';`.
- Delete `const busy = ref<Record<string, boolean>>({});` and `const techOpen = ref<Record<number, boolean>>({});`. Delete the whole `run(…)` function and its doc comment. After `const { confirmAction } = useConfirmAction();` add:

```ts
const { busy, run } = useActionRunner();
```

- In the template, replace the whole `<Message v-if="rev.pdfStatus === 'FAILED'" severity="warn"> … </Message>` block with:

```vue
<PdfFailureNotice
  v-if="rev.pdfStatus === 'FAILED'"
  :error="rev.pdfError"
  :tech-error="rev.pdfTechError"
/>
```

- In `<style scoped>`, delete these rules (they now live in `layout.css` or `PdfFailureNotice`): `.section-title`, `.facts`, `.facts--grid`, the `@media (max-width: 767px) { .facts--grid … }` block, `.facts dt`, `.facts dd` and `.tech-error`.

`frontend/src/views/InvoiceSettingsView.vue`: delete the whole `<style scoped>` block (it only contains `.section-title`).

- [ ] **Step 6: Full verification and commit**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS. In particular `InvoiceView.test.ts`, `InvoiceDetailView.test.ts` and `InvoiceSettingsView.test.ts` pass without edits. If one of them fails, the refactor changed behavior: fix the refactor, not the test.

```bash
git add frontend/src/composables/useTableFilters.ts frontend/src/utils/tableRowClick.ts frontend/src/composables/useActionRunner.ts frontend/src/components/PdfFailureNotice.vue frontend/src/utils/statusTags.ts frontend/src/assets/layout.css frontend/src/views/InvoiceView.vue frontend/src/views/InvoiceDetailView.vue frontend/src/views/InvoiceSettingsView.vue frontend/src/__tests__/useTableFilters.test.ts frontend/src/__tests__/tableRowClick.test.ts frontend/src/__tests__/useActionRunner.test.ts frontend/src/__tests__/PdfFailureNotice.test.ts frontend/src/__tests__/statusTags.test.ts
git commit -m "refactor: share list filters, row-click guard, action runner and pdf notice

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: DonorAutocomplete

**Files:**

- Rewrite: `frontend/src/components/DonorAutocomplete.vue`
- Rewrite: `frontend/src/__tests__/DonorAutocomplete.test.ts`

**Interfaces:**

- Produces: `<DonorAutocomplete :model-value="DonorDto | null" input-id="donor-search-input" @update:model-value="(DonorDto | null)" @neu="({ name, street, city })" />`. The emitted values are unchanged from today: `null` while the user types, the picked `DonorDto` on selection, and `neu` with `{ name, street: '', city: '' }` for "new donor". The root carries `data-testid="donor-search"`.

Behavior:

- Search `/api/donor?q=<encoded trimmed query>` from 2 characters, after 250 ms. A failed search still offers "new donor".
- The suggestions are the donors plus a last "Create “<query>” as new donor" option. Internally that option is a pseudo donor with `id: -1`.
- Picking a donor sets the input to its name; a new `modelValue` from the parent does too.

- [ ] **Step 1: Write the failing test**

Replace `frontend/src/__tests__/DonorAutocomplete.test.ts` with:

```ts
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import AutoComplete from 'primevue/autocomplete';
import type { DonorDto } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DonorAutocomplete from '../components/DonorAutocomplete.vue';
import { withPrimeVue } from './helpers/primeVue';

const donors: DonorDto[] = [
  {
    id: 1,
    name: 'Hans Schmidt',
    street: 'Musterstr. 1',
    city: 'Berlin',
    letterSalutation: 'Sehr geehrter Herr Schmidt',
    addressSalutation: null,
  },
  {
    id: 2,
    name: 'Maria Müller',
    street: 'Testgasse 2',
    city: 'Hamburg',
    letterSalutation: 'Sehr geehrte Frau Müller',
    addressSalutation: null,
  },
];

function newDonorOption(name: string): DonorDto {
  return { id: -1, name, street: '', city: '', letterSalutation: '' };
}

function mountPicker(modelValue: DonorDto | null = null) {
  return mount(DonorAutocomplete, {
    props: { modelValue, inputId: 'donor-input' },
    global: withPrimeVue(),
  });
}

function autocomplete(wrapper: VueWrapper) {
  return wrapper.findComponent(AutoComplete);
}

function input(wrapper: VueWrapper): HTMLInputElement {
  return wrapper.find('input#donor-input').element as HTMLInputElement;
}

async function complete(wrapper: VueWrapper, query: string) {
  autocomplete(wrapper).vm.$emit('complete', { originalEvent: new Event('input'), query });
  await flushPromises();
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(donors) }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DonorAutocomplete', () => {
  it('renders a search input with the given id', () => {
    const wrapper = mountPicker();
    expect(input(wrapper).placeholder).toBe('Search donor…');
    expect(wrapper.attributes('data-testid')).toBe('donor-search');
  });

  it('shows the selected donor name and follows the model', async () => {
    const wrapper = mountPicker(donors[0]);
    expect(input(wrapper).value).toBe('Hans Schmidt');
    await wrapper.setProps({ modelValue: donors[1] });
    expect(input(wrapper).value).toBe('Maria Müller');
  });

  it('does not search below 2 characters', async () => {
    const wrapper = mountPicker();
    await complete(wrapper, 'H');
    expect(fetch).not.toHaveBeenCalled();
    expect(autocomplete(wrapper).props('suggestions')).toEqual([]);
  });

  it('searches donors and offers a new donor last', async () => {
    const wrapper = mountPicker();
    await complete(wrapper, 'Han');
    expect(fetch).toHaveBeenCalledWith('/api/donor?q=Han');
    expect(autocomplete(wrapper).props('suggestions')).toEqual([...donors, newDonorOption('Han')]);
  });

  it('trims and encodes the query', async () => {
    const wrapper = mountPicker();
    await complete(wrapper, ' Mü ller ');
    expect(fetch).toHaveBeenCalledWith('/api/donor?q=M%C3%BC%20ller');
  });

  it('still offers a new donor when the search fails', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('offline'));
    const wrapper = mountPicker();
    await complete(wrapper, 'Han');
    expect(autocomplete(wrapper).props('suggestions')).toEqual([newDonorOption('Han')]);
  });

  it('clears the selection while the user types', async () => {
    const wrapper = mountPicker(donors[0]);
    autocomplete(wrapper).vm.$emit('update:modelValue', 'Hans S');
    await flushPromises();
    expect(wrapper.emitted('update:modelValue')).toEqual([[null]]);
  });

  it('emits the picked donor', async () => {
    const wrapper = mountPicker();
    autocomplete(wrapper).vm.$emit('update:modelValue', donors[0]);
    autocomplete(wrapper).vm.$emit('option-select', {
      originalEvent: new Event('click'),
      value: donors[0],
    });
    await flushPromises();
    expect(wrapper.emitted('update:modelValue')).toEqual([[donors[0]]]);
    expect(input(wrapper).value).toBe('Hans Schmidt');
  });

  it('emits "neu" with the typed name for the new-donor option', async () => {
    const wrapper = mountPicker();
    await complete(wrapper, 'Neue Person');
    autocomplete(wrapper).vm.$emit('option-select', {
      originalEvent: new Event('click'),
      value: newDonorOption('Neue Person'),
    });
    await flushPromises();
    expect(wrapper.emitted('neu')).toEqual([[{ name: 'Neue Person', street: '', city: '' }]]);
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit --workspace=frontend -- DonorAutocomplete`
Expected: FAIL (the old component has no AutoComplete).

- [ ] **Step 3: Rewrite the component**

Replace `frontend/src/components/DonorAutocomplete.vue` with:

```vue
<script setup lang="ts">
import AutoComplete, {
  type AutoCompleteCompleteEvent,
  type AutoCompleteOptionSelectEvent,
} from 'primevue/autocomplete';
import type { DonorDto } from 'shared';
import { ref, watch } from 'vue';

const props = defineProps<{
  modelValue: DonorDto | null;
  inputId?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: DonorDto | null];
  neu: [daten: { name: string; street: string; city: string }];
}>();

/** Pseudo option at the end of the list: create a new donor from the typed name. */
const NEW_DONOR_ID = -1;

const query = ref(props.modelValue?.name ?? '');
const suggestions = ref<DonorDto[]>([]);

watch(
  () => props.modelValue,
  (donor) => {
    if (donor) query.value = donor.name;
  },
);

function newDonorOption(name: string): DonorDto {
  return { id: NEW_DONOR_ID, name, street: '', city: '', letterSalutation: '' };
}

async function search(event: AutoCompleteCompleteEvent) {
  const q = event.query.trim();
  if (q.length < 2) {
    suggestions.value = [];
    return;
  }
  let donors: DonorDto[] = [];
  try {
    const res = await fetch(`/api/donor?q=${encodeURIComponent(q)}`);
    if (res.ok) donors = await res.json();
  } catch {
    // offer "new donor" only
  }
  suggestions.value = [...donors, newDonorOption(q)];
}

function onInput(value: string | DonorDto | null) {
  // Picking an option also emits the object here; onSelect handles that case
  if (typeof value === 'string' || value === null) {
    query.value = value ?? '';
    emit('update:modelValue', null);
  }
}

function onSelect(event: AutoCompleteOptionSelectEvent) {
  const donor = event.value as DonorDto;
  query.value = donor.name;
  if (donor.id === NEW_DONOR_ID) {
    emit('neu', { name: donor.name, street: '', city: '' });
  } else {
    emit('update:modelValue', donor);
  }
}
</script>

<template>
  <AutoComplete
    :model-value="query"
    :input-id="inputId"
    :suggestions="suggestions"
    option-label="name"
    placeholder="Search donor…"
    :min-length="2"
    :delay="250"
    fluid
    data-testid="donor-search"
    @complete="search"
    @option-select="onSelect"
    @update:model-value="onInput"
  >
    <template #option="{ option }">
      <span v-if="option.id === NEW_DONOR_ID" class="donor-option donor-option--new">
        <i class="pi pi-plus" aria-hidden="true"></i>
        Create “{{ option.name }}” as new donor
      </span>
      <span v-else class="donor-option">
        <span class="donor-option__name">{{ option.name }}</span>
        <span class="muted">{{ option.city }}</span>
      </span>
    </template>
  </AutoComplete>
</template>

<style scoped>
.donor-option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.donor-option__name {
  font-weight: 500;
}

.donor-option--new {
  color: var(--p-primary-color);
}
</style>
```

Notes for the implementer:

- The old component is still used by the old `DonationReceiptFormView.vue` until Task 5. Its props and emits are unchanged, so that file keeps compiling. Task 5 rewrites it.
- If `wrapper.attributes('data-testid')` is not on the AutoComplete root in PrimeVue 5, check `node_modules/primevue/autocomplete` for `inheritAttrs`. Put the test id where a parent can find it with `[data-testid="donor-search"]`, and report what you found.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit --workspace=frontend -- DonorAutocomplete`
Expected: PASS.

- [ ] **Step 5: Full verification and commit**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS.

```bash
git add frontend/src/components/DonorAutocomplete.vue frontend/src/__tests__/DonorAutocomplete.test.ts
git commit -m "feat: rebuild donor autocomplete with PrimeVue AutoComplete

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Receipt list

**Files:**

- Rewrite: `frontend/src/views/DonationReceiptView.vue`
- Rewrite: `frontend/src/__tests__/DonationReceiptView.test.ts`

**Interfaces:**

- Consumes: Task 1 (`useTableFilters`, `isControlClick`, `DOCUMENT_STATUS_FILTER_OPTIONS`); `useBatchDownload`, `AmountRangeFilter`, `StatusTag`, `documentStatusTag`, `AMOUNT_RANGE`, `DATE_RANGE`, `formatCents`, `formatDate`, `TABLE_DEFAULTS`, `globalFilter`, `PageHeader`, `useNotify`, `useAppStore().receiptTemplateAvailable`.
- Produces (test hooks):
  - Rows have class `receipt-row`.
  - `data-testid`s: `global-search`, `status-filter`, `clear-filters`, `download-selected`, `new-receipt`, `copy-receipt`, `no-template-warning`.
  - Script bindings `filters` and `selection`.

Behavior:

- Status filter: default `Active`; toolbar options Active / Cancelled / All.
- Global search over number and donor.
- Column filters: number (text), donor (text), amount range (euros), donation date range.
- Row click opens `/donation-receipt/:id`, except clicks on controls.
- Copy opens `/donation-receipt/new?copyFrom=:id`.
- Batch download: `/api/donation-receipt/download-batch`, fallback file `quittungen.zip`. Rejected receipts are deselected.
- Without a receipt template: a warning with a settings link, and "New Receipt" is disabled with the title `Please upload a donation receipt template in Settings first`.
- A load error shows the toast `Error loading receipts`.

- [ ] **Step 1: Write the failing test**

Replace `frontend/src/__tests__/DonationReceiptView.test.ts` with:

```ts
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import type { DataTableFilterMeta } from 'primevue/datatable';
import type { DonationReceiptListItem } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRouter } from 'vue-router';
import { useAppStore } from '../stores/app';
import DonationReceiptView from '../views/DonationReceiptView.vue';
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
  selection: DonationReceiptListItem[];
}

function vm(wrapper: VueWrapper): ViewVM {
  return wrapper.vm as unknown as ViewVM;
}

function receipt(overrides: Partial<DonationReceiptListItem>): DonationReceiptListItem {
  return {
    id: 1,
    number: 'SQ-2026-001',
    status: 'AKTIV',
    donorName: 'Anna Alt',
    donationAmountCents: 10000,
    donationDate: '2026-01-15T00:00:00.000Z',
    createdAt: '2026-01-15T10:00:00.000Z',
    activeRevisionNumber: 1,
    ...overrides,
  };
}

const receipts: DonationReceiptListItem[] = [
  receipt({ id: 1 }),
  receipt({
    id: 2,
    number: 'SQ-2026-002',
    donorName: 'Bernd Bach',
    donationAmountCents: 5000,
    donationDate: '2026-03-01T00:00:00.000Z',
    activeRevisionNumber: 2,
  }),
  receipt({
    id: 3,
    number: 'SQ-2026-003',
    donorName: 'Clara Cord',
    donationAmountCents: 20000,
    donationDate: '2026-02-10T00:00:00.000Z',
    status: 'STORNIERT',
  }),
];

const push = vi.fn();

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: () => Promise.resolve(body) } as Response;
}

async function mountView() {
  const wrapper = mount(DonationReceiptView, {
    attachTo: document.body,
    global: withPrimeVue({ stubs: { RouterLink: { template: '<a><slot /></a>' } } }),
  });
  await flushPromises();
  return wrapper;
}

function rows(wrapper: VueWrapper) {
  return wrapper.findAll('.receipt-row');
}

async function setFilter(wrapper: VueWrapper, field: string, value: unknown) {
  const current = vm(wrapper).filters[field] as { matchMode: string };
  vm(wrapper).filters = { ...vm(wrapper).filters, [field]: { ...current, value } };
  await flushPromises();
}

function statusButtons(wrapper: VueWrapper) {
  return wrapper.findAll(
    '[data-testid="status-filter"] [role="button"], [data-testid="status-filter"] button',
  );
}

beforeEach(() => {
  push.mockReset();
  download.mockReset();
  Object.values(notify).forEach((fn) => fn.mockReset());
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve(
        url === '/api/donation-receipt?withCancelled=true'
          ? jsonResponse(receipts)
          : jsonResponse({}, false),
      ),
    ),
  );
  vi.mocked(useRouter).mockReturnValue({ push } as unknown as ReturnType<typeof useRouter>);
  setActivePinia(createPinia());
  useAppStore().receiptTemplateAvailable = true;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DonationReceiptView', () => {
  it('loads all receipts (incl. cancelled) once', async () => {
    await mountView();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('/api/donation-receipt?withCancelled=true');
  });

  it('shows the heading and actions', async () => {
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="page-title"]').text()).toBe('Donation Receipts');
    expect(wrapper.text()).toContain('Settings');
    expect(wrapper.find('[data-testid="new-receipt"]').text()).toContain('New Receipt');
    expect(
      (wrapper.find('[data-testid="global-search"]').element as HTMLInputElement).placeholder,
    ).toContain('Search');
  });

  it('hides cancelled receipts by default', async () => {
    const wrapper = await mountView();
    expect(rows(wrapper)).toHaveLength(2);
    expect(wrapper.text()).not.toContain('Clara Cord');
  });

  it('switches the status filter with the toolbar buttons', async () => {
    const wrapper = await mountView();
    expect(statusButtons(wrapper).map((b) => b.text())).toEqual(['Active', 'Cancelled', 'All']);

    await statusButtons(wrapper)[2].trigger('click');
    await flushPromises();
    expect(rows(wrapper)).toHaveLength(3);

    await statusButtons(wrapper)[1].trigger('click');
    await flushPromises();
    expect(rows(wrapper)).toHaveLength(1);
    expect(rows(wrapper)[0].text()).toContain('Clara Cord');
    expect(rows(wrapper)[0].text()).toContain('Cancelled');
  });

  it('searches by donor or number', async () => {
    const wrapper = await mountView();
    await wrapper.find('[data-testid="global-search"]').setValue('bach');
    await flushPromises();
    expect(rows(wrapper)).toHaveLength(1);
    expect(rows(wrapper)[0].text()).toContain('Bernd Bach');

    await wrapper.find('[data-testid="global-search"]').setValue('001');
    await flushPromises();
    expect(rows(wrapper)).toHaveLength(1);
    expect(rows(wrapper)[0].text()).toContain('Anna Alt');
  });

  it('filters by amount range in euros', async () => {
    const wrapper = await mountView();
    await setFilter(wrapper, 'donationAmountCents', [80, null]);
    expect(rows(wrapper)).toHaveLength(1);
    expect(rows(wrapper)[0].text()).toContain('Anna Alt');
  });

  it('filters by donation date range', async () => {
    const wrapper = await mountView();
    await setFilter(wrapper, 'donationDate', [new Date(2026, 1, 1), new Date(2026, 2, 1)]);
    expect(rows(wrapper)).toHaveLength(1);
    expect(rows(wrapper)[0].text()).toContain('Bernd Bach');
  });

  it('clears filters back to the defaults', async () => {
    const wrapper = await mountView();
    await wrapper.find('[data-testid="global-search"]').setValue('bach');
    await statusButtons(wrapper)[2].trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="clear-filters"]').trigger('click');
    await flushPromises();
    expect(rows(wrapper)).toHaveLength(2);
    expect(statusButtons(wrapper)[0].attributes('aria-pressed')).toBe('true');
  });

  it('shows number, amount, date, revision and status', async () => {
    const wrapper = await mountView();
    const first = rows(wrapper)[0].text();
    expect(first).toContain('SQ-2026-001');
    expect(first).toContain('100,00');
    expect(first).toContain('15.01.2026');
    expect(first).toContain('R1');
    expect(first).toContain('Active');
  });

  it('opens a receipt on row click', async () => {
    const wrapper = await mountView();
    await rows(wrapper)[1].trigger('click');
    expect(push).toHaveBeenCalledWith('/donation-receipt/2');
  });

  it('selects without opening when the checkbox or its cell is clicked', async () => {
    const wrapper = await mountView();
    await rows(wrapper)[0].find('input[type="checkbox"]').trigger('click');
    await rows(wrapper)[1].find('td[data-p-selection-column="true"]').trigger('click');
    await flushPromises();
    expect(push).not.toHaveBeenCalled();
    expect(vm(wrapper).selection.map((r) => r.id)).toEqual([1]);
  });

  it('copies a receipt without opening it', async () => {
    const wrapper = await mountView();
    await wrapper.findAll('[data-testid="copy-receipt"]')[0].trigger('click');
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/donation-receipt/new?copyFrom=1');
  });

  it('downloads the selection and deselects rejected receipts', async () => {
    download.mockResolvedValue([2]);
    const wrapper = await mountView();
    vm(wrapper).selection = [receipts[0], receipts[1]];
    await flushPromises();

    const button = wrapper.find('[data-testid="download-selected"]');
    expect(button.text()).toContain('Download selected (2)');
    await button.trigger('click');
    await flushPromises();

    expect(download).toHaveBeenCalledWith([1, 2]);
    expect(vm(wrapper).selection.map((r) => r.id)).toEqual([1]);
  });

  it('disables download without a selection', async () => {
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="download-selected"]').attributes('disabled')).toBeDefined();
  });

  it('warns and blocks new receipts without a template', async () => {
    useAppStore().receiptTemplateAvailable = false;
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="no-template-warning"]').text()).toContain(
      'No donation receipt template uploaded',
    );
    const button = wrapper.find('[data-testid="new-receipt"]');
    expect(button.attributes('disabled')).toBeDefined();
    expect(button.attributes('title')).toBe(
      'Please upload a donation receipt template in Settings first',
    );
  });

  it('reports a load error', async () => {
    vi.mocked(fetch).mockImplementation(() => Promise.reject(new Error('offline')));
    await mountView();
    expect(notify.error).toHaveBeenCalledWith('Error loading receipts');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit --workspace=frontend -- DonationReceiptView`
Expected: FAIL.

- [ ] **Step 3: Rewrite the view**

Replace `frontend/src/views/DonationReceiptView.vue` with:

```vue
<script setup lang="ts">
import { FilterMatchMode } from '@primevue/core/api';
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable, {
  type DataTableFilterMeta,
  type DataTableRowClickEvent,
} from 'primevue/datatable';
import DatePicker from 'primevue/datepicker';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import SelectButton from 'primevue/selectbutton';
import type { DonationReceiptListItem } from 'shared';
import { onMounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import AmountRangeFilter from '../components/ui/AmountRangeFilter.vue';
import PageHeader from '../components/ui/PageHeader.vue';
import StatusTag from '../components/ui/StatusTag.vue';
import { useBatchDownload } from '../composables/useBatchDownload';
import { useNotify } from '../composables/useNotify';
import { useTableFilters } from '../composables/useTableFilters';
import { useAppStore } from '../stores/app';
import { formatCents, formatDate } from '../utils/format';
import { DOCUMENT_STATUS_FILTER_OPTIONS, documentStatusTag } from '../utils/statusTags';
import { globalFilter, TABLE_DEFAULTS } from '../utils/tableDefaults';
import { AMOUNT_RANGE, DATE_RANGE } from '../utils/tableFilters';
import { isControlClick } from '../utils/tableRowClick';

const router = useRouter();
const store = useAppStore();
const notify = useNotify();

const receipts = ref<DonationReceiptListItem[]>([]);
const loading = ref(false);
const selection = ref<DonationReceiptListItem[]>([]);

function defaultFilters(): DataTableFilterMeta {
  return {
    ...globalFilter(),
    number: { value: null, matchMode: FilterMatchMode.CONTAINS },
    donorName: { value: null, matchMode: FilterMatchMode.CONTAINS },
    donationAmountCents: { value: null, matchMode: AMOUNT_RANGE },
    donationDate: { value: null, matchMode: DATE_RANGE },
    status: { value: 'AKTIV', matchMode: FilterMatchMode.EQUALS },
  };
}

const { filters, globalSearch, statusFilter, clearFilters } = useTableFilters(defaultFilters);

const { download, downloading } = useBatchDownload({
  url: '/api/donation-receipt/download-batch',
  fallbackFileName: 'quittungen.zip',
  singular: 'receipt',
  plural: 'receipts',
});

async function downloadSelected() {
  const rejected = new Set(await download(selection.value.map((r) => r.id)));
  if (rejected.size > 0) selection.value = selection.value.filter((r) => !rejected.has(r.id));
}

async function loadReceipts() {
  loading.value = true;
  try {
    const res = await fetch('/api/donation-receipt?withCancelled=true');
    if (!res.ok) throw new Error('load failed');
    receipts.value = await res.json();
  } catch {
    notify.error('Error loading receipts');
  } finally {
    loading.value = false;
  }
}

onMounted(loadReceipts);

function onRowClick(event: DataTableRowClickEvent<DonationReceiptListItem>) {
  if (isControlClick(event.originalEvent)) return;
  router.push(`/donation-receipt/${event.data.id}`);
}
</script>

<template>
  <div class="page">
    <PageHeader title="Donation Receipts">
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
          @click="router.push('/donation-receipt/settings')"
        />
        <Button
          label="New Receipt"
          icon="pi pi-plus"
          :disabled="!store.receiptTemplateAvailable"
          :title="
            store.receiptTemplateAvailable
              ? undefined
              : 'Please upload a donation receipt template in Settings first'
          "
          data-testid="new-receipt"
          @click="router.push('/donation-receipt/new')"
        />
      </template>
    </PageHeader>

    <div class="stack">
      <Message
        v-if="store.receiptTemplateAvailable === false"
        severity="warn"
        data-testid="no-template-warning"
      >
        No donation receipt template uploaded. Please upload a template before creating receipts.
        <RouterLink to="/donation-receipt/settings">Go to Settings →</RouterLink>
      </Message>

      <DataTable
        v-model:selection="selection"
        v-model:filters="filters"
        :value="receipts"
        data-key="id"
        v-bind="TABLE_DEFAULTS"
        :global-filter-fields="['number', 'donorName']"
        :loading="loading"
        row-hover
        :row-class="() => 'receipt-row'"
        @row-click="onRowClick"
      >
        <template #header>
          <div class="row row--between">
            <IconField>
              <InputIcon class="pi pi-search" />
              <InputText
                v-model="globalSearch"
                placeholder="Search by name or number…"
                aria-label="Search receipts"
                data-testid="global-search"
              />
            </IconField>
            <SelectButton
              v-model="statusFilter"
              :options="DOCUMENT_STATUS_FILTER_OPTIONS"
              option-label="label"
              option-value="value"
              :allow-empty="false"
              aria-label="Filter by status"
              data-testid="status-filter"
            />
            <Button
              label="Clear filters"
              icon="pi pi-filter-slash"
              text
              data-testid="clear-filters"
              @click="clearFilters"
            />
          </div>
        </template>
        <template #empty>No receipts found.</template>

        <Column selection-mode="multiple" header-style="width: 3rem" />
        <Column
          field="number"
          header="Number"
          sortable
          :show-filter-menu="false"
          class="col-number"
        >
          <template #body="{ data }">
            <RouterLink :to="`/donation-receipt/${data.id}`" class="mono">{{
              data.number
            }}</RouterLink>
          </template>
          <template #filter="{ filterModel, filterCallback }">
            <InputText
              v-model="filterModel.value"
              size="small"
              placeholder="Number"
              fluid
              aria-label="Filter by number"
              @input="filterCallback()"
            />
          </template>
        </Column>
        <Column
          field="donorName"
          header="Donor"
          sortable
          :show-filter-menu="false"
          class="col-donor"
        >
          <template #filter="{ filterModel, filterCallback }">
            <InputText
              v-model="filterModel.value"
              size="small"
              placeholder="Donor"
              fluid
              aria-label="Filter by donor"
              @input="filterCallback()"
            />
          </template>
        </Column>
        <Column
          field="donationAmountCents"
          header="Amount"
          sortable
          :show-filter-menu="false"
          class="col-amount"
        >
          <template #body="{ data }">{{ formatCents(data.donationAmountCents) }}</template>
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
        <Column
          field="donationDate"
          header="Donation Date"
          sortable
          :show-filter-menu="false"
          class="col-date"
        >
          <template #body="{ data }">{{ formatDate(data.donationDate) }}</template>
          <template #filter="{ filterModel, filterCallback }">
            <DatePicker
              v-model="filterModel.value"
              selection-mode="range"
              :manual-input="false"
              date-format="dd.mm.yy"
              show-button-bar
              size="small"
              placeholder="Date range"
              fluid
              aria-label="Filter by donation date"
              @update:model-value="filterCallback()"
            />
          </template>
        </Column>
        <Column field="activeRevisionNumber" header="Rev.">
          <template #body="{ data }">R{{ data.activeRevisionNumber ?? '–' }}</template>
        </Column>
        <Column field="status" header="Status">
          <template #body="{ data }"><StatusTag :tag="documentStatusTag(data.status)" /></template>
        </Column>
        <Column header-style="width: 6rem">
          <template #body="{ data }">
            <Button
              label="Copy"
              icon="pi pi-copy"
              size="small"
              text
              data-testid="copy-receipt"
              @click.stop="router.push(`/donation-receipt/new?copyFrom=${data.id}`)"
            />
          </template>
        </Column>
      </DataTable>
    </div>
  </div>
</template>

<style scoped>
:deep(.col-number) {
  width: 9rem;
}

:deep(.col-donor) {
  width: 12rem;
}

:deep(.col-date) {
  width: 10rem;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.875rem;
}

:deep(.receipt-row) {
  cursor: pointer;
}

:deep(.col-amount) {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
```

Notes for the implementer: this view mirrors `InvoiceView.vue` (after Task 1). When in doubt about a PrimeVue mechanic, look at how the invoice list does it; its tests have the same shape.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit --workspace=frontend -- DonationReceiptView`
Expected: PASS.

- [ ] **Step 5: Full verification and commit**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS.

```bash
git add frontend/src/views/DonationReceiptView.vue frontend/src/__tests__/DonationReceiptView.test.ts
git commit -m "feat: rebuild donation receipt list with PrimeVue data table

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Receipt detail

**Files:**

- Rewrite: `frontend/src/views/DonationReceiptDetailView.vue`
- Test: `frontend/src/__tests__/DonationReceiptDetailView.test.ts` (new)

**Interfaces:**

- Consumes: `useActionRunner`, `PdfFailureNotice`, `.facts` / `.section-title` (Task 1); `PageHeader`, `StatusTag` + `documentStatusTag` / `revisionStatusTag` / `pdfStatusTag`, `formatCents`, `formatDate`, `formatDateTime`, `useNotify`, `useConfirmAction`.
- Produces (test hooks):
  - `data-testid`s: `receipt-status`, `new-revision`, `duplicate`, `cancel-receipt`, `load-error`, `revision-facts` (one per expanded revision), `download-pdf`, `retry-pdf`.
  - From `PdfFailureNotice`: `pdf-failure` and `toggle-tech-error`.

Behavior:

- **Header:** title `Receipt {number}`. Actions:
  - Back → `/donation-receipt`.
  - New Revision (only `AKTIV`) → `/donation-receipt/:id/revision`.
  - Duplicate → `/donation-receipt/new?copyFrom=:id`.
  - Cancel receipt (only `AKTIV`): a danger **confirm** (`Cancel receipt {number}? This cannot be undone.`, header `Cancel receipt`, accept `Cancel receipt`, reject `Keep receipt`), then `PATCH /api/donation-receipt/:id/cancel`. Toast `Receipt cancelled`, or `body.error || 'Error cancelling'`.
- **Summary card:** Status tag, Donation Date, Created at, Donor (name), Address (street, city).
- **Revisions:** an `Accordion` (`multiple`, `lazy`) over `receipt.revisions ?? []`, newest first. Only the newest is expanded on first load. The header shows `Revision N`, the PDF tag, the revision tag and the creation time.
- **Revision facts:**
  - Donor (name, street, city), Letter Salutation, Address Salutation (`—` when empty).
  - Amount, Donation Date, With Cover Letter (`Yes` / `No`).
  - Treasurer, Charitable Purpose, Tax Office, Tax Number, Exemption Date (`—` when empty), Assessment Period.
- **Failed PDF:** shown with `PdfFailureNotice`.
- **Revision buttons:**
  - Download PDF (`pdfStatus === 'OK'` and a `filePath`) → `window.open('/api/donation-receipt/revision/:revId/download', '_blank')`.
  - Regenerate PDF (`FAILED` and the revision is `AKTIV`) → `POST …/retry-pdf`. Toast `PDF generated successfully`, or `body.error || 'Error on retry'`.
- **Reloads:** reload after each success. A failed first load shows `Receipt could not be loaded` (or `Network error`) instead of the page. A failed reload keeps the receipt on screen and toasts the same text.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/__tests__/DonationReceiptDetailView.test.ts`:

```ts
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import type { DonationReceiptDto, DonationReceiptRevisionDto } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRoute, useRouter } from 'vue-router';
import DonationReceiptDetailView from '../views/DonationReceiptDetailView.vue';
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

function revision(overrides: Partial<DonationReceiptRevisionDto>): DonationReceiptRevisionDto {
  return {
    id: 31,
    revisionNumber: 1,
    status: 'AKTIV',
    pdfStatus: 'OK',
    pdfError: null,
    pdfTechError: null,
    inputs: {
      name: 'Hans Schmidt',
      street: 'Musterstr. 1',
      city: 'Berlin',
      letterSalutation: 'Sehr geehrter Herr Schmidt',
      addressSalutation: null,
      donationAmountCents: 25000,
      donationDate: '2026-02-01T00:00:00.000Z',
      withCoverLetter: true,
      treasurer: 'Kim Kasse',
      charitablePurpose: 'Förderung des Sports',
      taxOfficeName: 'FA Mitte',
      taxNumber: '12/345/67890',
      exemptionDate: '',
      assessmentPeriod: '2021–2023',
    },
    filePath: 'receipts/31.pdf',
    createdAt: '2026-02-01T10:00:00.000Z',
    ...overrides,
  };
}

function makeReceipt(overrides: Partial<DonationReceiptDto> = {}): DonationReceiptDto {
  return {
    id: 3,
    number: 'SQ-2026-003',
    status: 'AKTIV',
    donor: {
      id: 7,
      name: 'Hans Schmidt',
      street: 'Musterstr. 1',
      city: 'Berlin',
      letterSalutation: 'Sehr geehrter Herr Schmidt',
      addressSalutation: null,
    },
    donationDate: '2026-02-01T00:00:00.000Z',
    createdAt: '2026-02-01T10:00:00.000Z',
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
  const wrapper = mount(DonationReceiptDetailView, {
    global: withPrimeVue({ stubs: { RouterLink: { template: '<a><slot /></a>' } } }),
  });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  replies = { 'GET /api/donation-receipt/3': { status: 200, body: makeReceipt() } };
  fetchMock.mockClear();
  push.mockReset();
  confirmAction.mockReset().mockResolvedValue(true);
  Object.values(notify).forEach((fn) => fn.mockReset());
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(useRoute).mockReturnValue({ params: { id: '3' } } as unknown as ReturnType<
    typeof useRoute
  >);
  vi.mocked(useRouter).mockReturnValue({ push } as unknown as ReturnType<typeof useRouter>);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DonationReceiptDetailView', () => {
  it('shows number, status, donor and the newest revision expanded', async () => {
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="page-title"]').text()).toBe('Receipt SQ-2026-003');
    expect(wrapper.find('[data-testid="receipt-status"]').text()).toBe('Active');
    expect(wrapper.text()).toContain('01.02.2026');
    expect(wrapper.text()).toContain('Musterstr. 1, Berlin');
    expect(wrapper.text()).toContain('Revision 1');
    expect(wrapper.text()).toContain('250,00');
  });

  it('shows association data, cover letter flag and placeholders for empty values', async () => {
    const wrapper = await mountView();
    const facts = wrapper.find('[data-testid="revision-facts"]').text();
    expect(facts).toContain('FA Mitte');
    expect(facts).toContain('12/345/67890');
    expect(facts).toContain('Förderung des Sports');
    expect(facts).toContain('Yes');
    expect(facts).toMatch(/Exemption Date\s*—/);
    expect(facts).toMatch(/Address Salutation\s*—/);
  });

  it('formats a set exemption date', async () => {
    replies['GET /api/donation-receipt/3'] = {
      status: 200,
      body: makeReceipt({
        revisions: [revision({ inputs: { ...revision({}).inputs, exemptionDate: '2024-05-02' } })],
      }),
    };
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="revision-facts"]').text()).toContain('02.05.2024');
  });

  it('expands only the newest of several revisions', async () => {
    replies['GET /api/donation-receipt/3'] = {
      status: 200,
      body: makeReceipt({
        revisions: [
          revision({ id: 32, revisionNumber: 2 }),
          revision({ id: 31, revisionNumber: 1, status: 'ERSETZT' }),
        ],
      }),
    };
    const wrapper = await mountView();
    expect(wrapper.text()).toContain('Revision 2');
    expect(wrapper.text()).toContain('Revision 1');
    expect(wrapper.findAll('[data-testid="revision-facts"]')).toHaveLength(1);
  });

  it('copes with a receipt without a revisions list', async () => {
    replies['GET /api/donation-receipt/3'] = {
      status: 200,
      body: makeReceipt({ revisions: undefined }),
    };
    const wrapper = await mountView();
    expect(wrapper.text()).toContain('No revisions available');
  });

  it('cancels after confirmation and reloads', async () => {
    replies['PATCH /api/donation-receipt/3/cancel'] = { status: 200, body: {} };
    const wrapper = await mountView();

    await wrapper.find('[data-testid="cancel-receipt"]').trigger('click');
    await flushPromises();

    expect(confirmAction).toHaveBeenCalledWith(
      expect.objectContaining({ header: 'Cancel receipt', danger: true }),
    );
    expect(calls()).toEqual([
      'GET /api/donation-receipt/3',
      'PATCH /api/donation-receipt/3/cancel',
      'GET /api/donation-receipt/3',
    ]);
    expect(notify.success).toHaveBeenCalledWith('Receipt cancelled');
  });

  it('does not cancel when the confirmation is declined', async () => {
    confirmAction.mockResolvedValue(false);
    const wrapper = await mountView();
    await wrapper.find('[data-testid="cancel-receipt"]').trigger('click');
    await flushPromises();
    expect(calls()).toEqual(['GET /api/donation-receipt/3']);
  });

  it('shows the cancel error', async () => {
    replies['PATCH /api/donation-receipt/3/cancel'] = {
      status: 400,
      body: { error: 'Already cancelled' },
    };
    const wrapper = await mountView();
    await wrapper.find('[data-testid="cancel-receipt"]').trigger('click');
    await flushPromises();
    expect(notify.error).toHaveBeenCalledWith('Already cancelled');
  });

  it('keeps the receipt on screen when a reload fails', async () => {
    replies['PATCH /api/donation-receipt/3/cancel'] = { status: 200, body: {} };
    const wrapper = await mountView();
    replies['GET /api/donation-receipt/3'] = { status: 500, body: {} };

    await wrapper.find('[data-testid="cancel-receipt"]').trigger('click');
    await flushPromises();

    expect(notify.error).toHaveBeenCalledWith('Receipt could not be loaded');
    expect(wrapper.find('[data-testid="load-error"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="page-title"]').text()).toBe('Receipt SQ-2026-003');
  });

  it('hides revision and cancel actions for cancelled receipts', async () => {
    replies['GET /api/donation-receipt/3'] = {
      status: 200,
      body: makeReceipt({ status: 'STORNIERT' }),
    };
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="receipt-status"]').text()).toBe('Cancelled');
    expect(wrapper.find('[data-testid="new-revision"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="cancel-receipt"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="duplicate"]').exists()).toBe(true);
  });

  it('navigates to new revision and duplicate', async () => {
    const wrapper = await mountView();
    await wrapper.find('[data-testid="new-revision"]').trigger('click');
    await wrapper.find('[data-testid="duplicate"]').trigger('click');
    expect(push).toHaveBeenNthCalledWith(1, '/donation-receipt/3/revision');
    expect(push).toHaveBeenNthCalledWith(2, '/donation-receipt/new?copyFrom=3');
  });

  it('offers PDF regeneration for a failed PDF on the current revision', async () => {
    replies['GET /api/donation-receipt/3'] = {
      status: 200,
      body: makeReceipt({
        revisions: [
          revision({ pdfStatus: 'FAILED', pdfError: 'Template broken', pdfTechError: 'stack' }),
        ],
      }),
    };
    replies['POST /api/donation-receipt/revision/31/retry-pdf'] = { status: 200, body: {} };
    const wrapper = await mountView();

    expect(wrapper.find('[data-testid="pdf-failure"]').text()).toContain('Template broken');
    expect(wrapper.find('[data-testid="download-pdf"]').exists()).toBe(false);
    await wrapper.find('[data-testid="retry-pdf"]').trigger('click');
    await flushPromises();
    expect(calls()).toContain('POST /api/donation-receipt/revision/31/retry-pdf');
    expect(notify.success).toHaveBeenCalledWith('PDF generated successfully');
  });

  it('does not offer regeneration for a superseded revision', async () => {
    replies['GET /api/donation-receipt/3'] = {
      status: 200,
      body: makeReceipt({ revisions: [revision({ pdfStatus: 'FAILED', status: 'ERSETZT' })] }),
    };
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="retry-pdf"]').exists()).toBe(false);
  });

  it('opens the PDF download', async () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);
    const wrapper = await mountView();
    await wrapper.find('[data-testid="download-pdf"]').trigger('click');
    expect(open).toHaveBeenCalledWith('/api/donation-receipt/revision/31/download', '_blank');
  });

  it('shows a load error', async () => {
    replies['GET /api/donation-receipt/3'] = { status: 404, body: {} };
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="load-error"]').text()).toContain(
      'Receipt could not be loaded',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit --workspace=frontend -- DonationReceiptDetailView`
Expected: FAIL.

- [ ] **Step 3: Rewrite the view**

Replace `frontend/src/views/DonationReceiptDetailView.vue` with:

```vue
<script setup lang="ts">
import Accordion from 'primevue/accordion';
import AccordionContent from 'primevue/accordioncontent';
import AccordionHeader from 'primevue/accordionheader';
import AccordionPanel from 'primevue/accordionpanel';
import Button from 'primevue/button';
import Card from 'primevue/card';
import Message from 'primevue/message';
import type { DonationReceiptDto, DonationReceiptRevisionDto } from 'shared';
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PdfFailureNotice from '../components/PdfFailureNotice.vue';
import PageHeader from '../components/ui/PageHeader.vue';
import StatusTag from '../components/ui/StatusTag.vue';
import { useActionRunner } from '../composables/useActionRunner';
import { useConfirmAction } from '../composables/useConfirmAction';
import { useNotify } from '../composables/useNotify';
import { formatCents, formatDate, formatDateTime } from '../utils/format';
import { documentStatusTag, pdfStatusTag, revisionStatusTag } from '../utils/statusTags';

const route = useRoute();
const router = useRouter();
const notify = useNotify();
const { confirmAction } = useConfirmAction();
const { busy, run } = useActionRunner();

const id = Number(route.params.id);

const receipt = ref<DonationReceiptDto | null>(null);
const loading = ref(false);
const loadError = ref('');
const openPanels = ref<number[]>([]);

const isActive = computed(() => receipt.value?.status === 'AKTIV');
const revisions = computed(() => receipt.value?.revisions ?? []);
const title = computed(() => (receipt.value ? `Receipt ${receipt.value.number}` : 'Receipt'));

/** A failed first load replaces the page; a failed reload keeps the loaded receipt and toasts. */
function reportLoadFailure(message: string) {
  if (receipt.value) notify.error(message);
  else loadError.value = message;
}

async function loadData() {
  loading.value = receipt.value === null;
  loadError.value = '';
  try {
    const res = await fetch(`/api/donation-receipt/${id}`);
    if (!res.ok) {
      reportLoadFailure('Receipt could not be loaded');
      return;
    }
    receipt.value = (await res.json()) as DonationReceiptDto;
    const newest = receipt.value.revisions?.[0];
    if (openPanels.value.length === 0 && newest) openPanels.value = [newest.id];
  } catch {
    reportLoadFailure('Network error');
  } finally {
    loading.value = false;
  }
}

onMounted(loadData);

async function cancel() {
  if (!receipt.value) return;
  const confirmed = await confirmAction({
    message: `Cancel receipt ${receipt.value.number}? This cannot be undone.`,
    header: 'Cancel receipt',
    acceptLabel: 'Cancel receipt',
    rejectLabel: 'Keep receipt',
    danger: true,
  });
  if (!confirmed) return;
  const ok = await run(
    'cancel',
    () => fetch(`/api/donation-receipt/${id}/cancel`, { method: 'PATCH' }),
    (body) => body.error || 'Error cancelling',
  );
  if (ok) {
    notify.success('Receipt cancelled');
    await loadData();
  }
}

async function retryPdf(rev: DonationReceiptRevisionDto) {
  const ok = await run(
    `retry-${rev.id}`,
    () => fetch(`/api/donation-receipt/revision/${rev.id}/retry-pdf`, { method: 'POST' }),
    (body) => body.error || 'Error on retry',
  );
  if (ok) {
    notify.success('PDF generated successfully');
    await loadData();
  }
}

function downloadPdf(rev: DonationReceiptRevisionDto) {
  window.open(`/api/donation-receipt/revision/${rev.id}/download`, '_blank');
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
          @click="router.push('/donation-receipt')"
        />
        <template v-if="receipt">
          <Button
            v-if="isActive"
            label="New Revision"
            icon="pi pi-pencil"
            data-testid="new-revision"
            @click="router.push(`/donation-receipt/${id}/revision`)"
          />
          <Button
            label="Duplicate"
            icon="pi pi-copy"
            severity="secondary"
            outlined
            data-testid="duplicate"
            @click="router.push(`/donation-receipt/new?copyFrom=${id}`)"
          />
          <Button
            v-if="isActive"
            label="Cancel receipt"
            icon="pi pi-ban"
            severity="danger"
            outlined
            :loading="busy.cancel"
            data-testid="cancel-receipt"
            @click="cancel"
          />
        </template>
      </template>
    </PageHeader>

    <p v-if="loading" class="muted">Loading…</p>
    <Message v-else-if="loadError" severity="error" data-testid="load-error">
      {{ loadError }}
    </Message>

    <div v-else-if="receipt" class="stack gap-lg">
      <Card>
        <template #content>
          <dl class="facts">
            <div>
              <dt>Status</dt>
              <dd>
                <StatusTag :tag="documentStatusTag(receipt.status)" data-testid="receipt-status" />
              </dd>
            </div>
            <div>
              <dt>Donation Date</dt>
              <dd>{{ formatDate(receipt.donationDate) }}</dd>
            </div>
            <div>
              <dt>Created at</dt>
              <dd>{{ formatDateTime(receipt.createdAt) }}</dd>
            </div>
            <div>
              <dt>Donor</dt>
              <dd>{{ receipt.donor.name }}</dd>
            </div>
            <div>
              <dt>Address</dt>
              <dd>{{ receipt.donor.street }}, {{ receipt.donor.city }}</dd>
            </div>
          </dl>
        </template>
      </Card>

      <section class="stack gap-sm">
        <h3 class="section-title">Revisions</h3>
        <p v-if="revisions.length === 0" class="muted">No revisions available</p>
        <Accordion v-else v-model:value="openPanels" multiple lazy>
          <AccordionPanel v-for="rev in revisions" :key="rev.id" :value="rev.id">
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
                <dl class="facts facts--grid" data-testid="revision-facts">
                  <div>
                    <dt>Donor</dt>
                    <dd>{{ rev.inputs.name }}, {{ rev.inputs.street }}, {{ rev.inputs.city }}</dd>
                  </div>
                  <div>
                    <dt>Letter Salutation</dt>
                    <dd>{{ rev.inputs.letterSalutation || '—' }}</dd>
                  </div>
                  <div>
                    <dt>Address Salutation</dt>
                    <dd>{{ rev.inputs.addressSalutation || '—' }}</dd>
                  </div>
                  <div>
                    <dt>Amount</dt>
                    <dd class="strong">{{ formatCents(rev.inputs.donationAmountCents) }}</dd>
                  </div>
                  <div>
                    <dt>Donation Date</dt>
                    <dd>{{ formatDate(rev.inputs.donationDate) }}</dd>
                  </div>
                  <div>
                    <dt>With Cover Letter</dt>
                    <dd>{{ rev.inputs.withCoverLetter ? 'Yes' : 'No' }}</dd>
                  </div>
                  <div>
                    <dt>Treasurer</dt>
                    <dd>{{ rev.inputs.treasurer || '—' }}</dd>
                  </div>
                  <div>
                    <dt>Charitable Purpose</dt>
                    <dd>{{ rev.inputs.charitablePurpose || '—' }}</dd>
                  </div>
                  <div>
                    <dt>Tax Office</dt>
                    <dd>{{ rev.inputs.taxOfficeName || '—' }}</dd>
                  </div>
                  <div>
                    <dt>Tax Number</dt>
                    <dd>{{ rev.inputs.taxNumber || '—' }}</dd>
                  </div>
                  <div>
                    <dt>Exemption Date</dt>
                    <dd>
                      {{ rev.inputs.exemptionDate ? formatDate(rev.inputs.exemptionDate) : '—' }}
                    </dd>
                  </div>
                  <div>
                    <dt>Assessment Period</dt>
                    <dd>{{ rev.inputs.assessmentPeriod || '—' }}</dd>
                  </div>
                </dl>

                <PdfFailureNotice
                  v-if="rev.pdfStatus === 'FAILED'"
                  :error="rev.pdfError"
                  :tech-error="rev.pdfTechError"
                />

                <div class="row gap-sm">
                  <Button
                    v-if="rev.pdfStatus === 'OK' && rev.filePath"
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
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit --workspace=frontend -- DonationReceiptDetailView`
Expected: PASS. The `toMatch(/Exemption Date\s*—/)` assertions read the `dl` text; if PrimeVue or jsdom joins `dt`/`dd` text differently, assert on the specific `dd` instead and keep the intent ("empty exemption date shows —").

- [ ] **Step 5: Full verification and commit**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS.

```bash
git add frontend/src/views/DonationReceiptDetailView.vue frontend/src/__tests__/DonationReceiptDetailView.test.ts
git commit -m "feat: rebuild donation receipt detail with revisions accordion and confirmation

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Receipt form (new, copy, revision)

**Files:**

- Rewrite: `frontend/src/views/DonationReceiptFormView.vue`
- Test: `frontend/src/__tests__/DonationReceiptFormView.test.ts` (new)

**Interfaces:**

- Consumes: `DonorAutocomplete` (Task 2); `PageHeader`, `FormSection`, `useNotify`, `useAppStore`, `toIsoDate`, `fromIsoDate`.
- Produces (test hooks):
  - Script bindings `inputs` (ReceiptInputs) and `donor` (DonorDto | null).
  - Field ids: `name`, `street`, `city`, `letter-salutation`, `address-salutation`, `amount`, `donation-date`, `with-cover-letter`, `treasurer`, `charitable-purpose`, `tax-office`, `tax-number`, `exemption-date`, `assessment-period`.
  - `data-testid`s: `donor-search` (from `DonorAutocomplete`), `defaults-hint`, `donor-edit-hint`, `error-letter-salutation`, `error-amount`, `load-error`, `submit`.
  - The DatePicker roots carry `data-testid="donation-date"` and `data-testid="exemption-date"`.

Behavior to keep (as today):

- **Mode** comes from the route: `params.id` → new revision; `query.copyFrom` → copy; otherwise new. Without a receipt template, redirect to `/donation-receipt`.
- **Association data:** pre-filled from `GET /api/settings`; only non-empty settings values overwrite the defaults.
- **Revision mode:** inputs come from the active revision (donation date cut to `YYYY-MM-DD`). Then the donor fields (name, street, city, letter/address salutation) are overwritten with the receipt's current donor record. When that changed anything, show `This revision was pre-filled with the current donor master data.` (`defaults-hint`). Post `{ inputs }` to `/api/donation-receipt/:id/revision`.
- **Copy mode:** inputs come from the active revision with today as the donation date; the donor is linked (`donorId`).
- **Donor picker:**
  - Picking a donor fills and locks the donor fields.
  - Typing again (the picker emits `null`) unlinks the donor and unlocks the fields.
  - "New donor" fills name/street/city from the picker, and the letter salutation `Sehr geehrte Damen und Herren` if it is empty.
  - New receipts post `donorId` for a linked donor, otherwise `donorData { name, street, city, letterSalutation, addressSalutation }`.
- **Result toasts:**
  - Server error → `notify.error(result.error || 'Unknown error')`; network → `Network error while saving`.
  - `pdfStatus === 'FAILED'` → `notify.warn(result.pdfError || 'PDF could not be generated. Please try again.')`, otherwise `notify.success('Receipt saved successfully.')`.
  - `donorUpdated` → also `notify.info('Donor master data updated.')`.
  - Then open `/donation-receipt/{result.receiptId ?? id}` immediately (no 1 s delay).
- **Titles:** `New Donation Receipt` / `Duplicate Receipt` / `Create New Revision`. Submit labels: `Create Receipt` / `Save Revision` (`Generating…` / `Saving revision…` while sending).

Changes:

- **Donor fields stay editable in revision mode**, with a hint (`donor-edit-hint`): `Editing these donor fields updates the linked donor record for this receipt.` The lock rule becomes `donorFieldsLocked = !isNewRevision && !!donor && !newDonor`. Today the form locks them, which contradicts docs/RECIPIENT_MANAGEMENT.md and the spec ("recipient fields editable with in-place update").
- **Validation** (shown under the field after the first submit attempt, and updated live afterwards):
  - Letter Salutation with the cover letter on and empty → `Letter Salutation is required when creating a cover letter.`
  - Amount ≤ 0 → `Amount is required`.
  - Name, street and city keep the native `required` attribute.
- **Inputs:** amount `InputNumber` currency (euros ↔ cents; `0` cents shows as empty); donation date and exemption date as `DatePicker` (`YYYY-MM-DD` model, exemption date clearable to `''`); cover letter as `ToggleSwitch`.
- **Load failures:** a failed receipt load → `load-error` with `Receipt could not be loaded`; a network failure while loading → `Network error while loading`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/__tests__/DonationReceiptFormView.test.ts`:

```ts
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import DatePicker from 'primevue/datepicker';
import InputNumber from 'primevue/inputnumber';
import type { DonationReceiptDto, DonorDto, ReceiptInputs } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRoute, useRouter } from 'vue-router';
import DonorAutocomplete from '../components/DonorAutocomplete.vue';
import { useAppStore } from '../stores/app';
import { toIsoDate } from '../utils/format';
import DonationReceiptFormView from '../views/DonationReceiptFormView.vue';
import { withPrimeVue } from './helpers/primeVue';

const { notify } = vi.hoisted(() => ({
  notify: { success: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('vue-router', () => ({ useRoute: vi.fn(), useRouter: vi.fn() }));
vi.mock('../composables/useNotify', () => ({ useNotify: () => notify }));

const mockPush = vi.fn();
const mockReplace = vi.fn();

interface FormVM {
  inputs: ReceiptInputs;
  donor: DonorDto | null;
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

const hans: DonorDto = {
  id: 7,
  name: 'Hans Schmidt',
  street: 'Musterstr. 1',
  city: 'Berlin',
  letterSalutation: 'Sehr geehrter Herr Schmidt',
  addressSalutation: 'Herrn',
};

const settings = {
  treasurer: 'Kim Kasse',
  charitablePurpose: 'Förderung des Sports',
  taxOfficeName: 'FA Mitte',
  taxNumber: '12/345/67890',
  exemptionDate: '2024-05-02',
  assessmentPeriod: '2021–2023',
};

const revisionInputs: ReceiptInputs = {
  name: 'Hans Schmidt (alt)',
  street: 'Altweg 3',
  city: 'Berlin',
  letterSalutation: 'Lieber Hans',
  addressSalutation: null,
  donationAmountCents: 25000,
  donationDate: '2026-02-01T00:00:00.000Z',
  withCoverLetter: true,
  treasurer: 'Old Treasurer',
  charitablePurpose: 'Jugendarbeit',
  taxOfficeName: 'FA Alt',
  taxNumber: '11/111/11111',
  exemptionDate: '2023-01-10',
  assessmentPeriod: '2020–2022',
};

function receiptDto(inputs: ReceiptInputs = revisionInputs): DonationReceiptDto {
  return {
    id: 3,
    number: 'SQ-2026-003',
    status: 'AKTIV',
    donor: hans,
    donationDate: '2026-02-01T00:00:00.000Z',
    createdAt: '2026-02-01T10:00:00.000Z',
    activeRevision: {
      id: 31,
      revisionNumber: 1,
      status: 'AKTIV',
      pdfStatus: 'OK',
      pdfError: null,
      pdfTechError: null,
      inputs,
      filePath: 'receipts/31.pdf',
      createdAt: '2026-02-01T10:00:00.000Z',
    },
    revisions: [],
  };
}

const today = toIsoDate(new Date());

function setRoute(params: Record<string, string>, query: Record<string, string> = {}) {
  vi.mocked(useRoute).mockReturnValue({ params, query } as unknown as ReturnType<typeof useRoute>);
}

async function mountForm() {
  const wrapper = mount(DonationReceiptFormView, {
    attachTo: document.body,
    global: withPrimeVue(),
  });
  await flushPromises();
  return wrapper;
}

function picker(wrapper: VueWrapper) {
  return wrapper.findComponent(DonorAutocomplete);
}

function datePicker(wrapper: VueWrapper, testid: string) {
  return wrapper.findAllComponents(DatePicker).find((c) => c.attributes('data-testid') === testid)!;
}

async function setAmount(wrapper: VueWrapper, euros: number | null) {
  wrapper.findComponent(InputNumber).vm.$emit('update:modelValue', euros);
  await flushPromises();
}

async function submit(wrapper: VueWrapper) {
  await wrapper.find('form').trigger('submit');
  await flushPromises();
}

beforeEach(() => {
  replies = { 'GET /api/settings': { status: 200, body: settings } };
  fetchMock.mockClear();
  mockPush.mockClear();
  mockReplace.mockClear();
  Object.values(notify).forEach((fn) => fn.mockReset());
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(useRouter).mockReturnValue({
    push: mockPush,
    replace: mockReplace,
    back: vi.fn(),
  } as unknown as ReturnType<typeof useRouter>);
  setActivePinia(createPinia());
  useAppStore().receiptTemplateAvailable = true;
  setRoute({});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DonationReceiptFormView — new receipt', () => {
  it('redirects to the list without a receipt template', async () => {
    useAppStore().receiptTemplateAvailable = false;
    await mountForm();
    expect(mockReplace).toHaveBeenCalledWith('/donation-receipt');
  });

  it('pre-fills association data, today and the cover letter', async () => {
    const wrapper = await mountForm();
    expect(wrapper.find('[data-testid="page-title"]').text()).toBe('New Donation Receipt');
    expect(wrapper.find('[data-testid="submit"]').text()).toContain('Create Receipt');
    expect(vm(wrapper).inputs).toMatchObject({
      treasurer: 'Kim Kasse',
      taxOfficeName: 'FA Mitte',
      exemptionDate: '2024-05-02',
      donationDate: today,
      withCoverLetter: true,
    });
    expect(wrapper.find('[data-testid="donor-search"]').exists()).toBe(true);
  });

  it('ignores empty settings values', async () => {
    replies['GET /api/settings'] = { status: 200, body: { ...settings, treasurer: '' } };
    const wrapper = await mountForm();
    expect(vm(wrapper).inputs.treasurer).toBe('');
    expect(vm(wrapper).inputs.taxOfficeName).toBe('FA Mitte');
  });

  it('fills and locks the donor fields when a donor is picked', async () => {
    const wrapper = await mountForm();
    picker(wrapper).vm.$emit('update:modelValue', hans);
    await flushPromises();

    expect(vm(wrapper).inputs).toMatchObject({
      name: 'Hans Schmidt',
      street: 'Musterstr. 1',
      city: 'Berlin',
      letterSalutation: 'Sehr geehrter Herr Schmidt',
      addressSalutation: 'Herrn',
    });
    expect(wrapper.find('#name').attributes('disabled')).toBeDefined();
  });

  it('unlinks and unlocks the donor when the user searches again', async () => {
    const wrapper = await mountForm();
    picker(wrapper).vm.$emit('update:modelValue', hans);
    await flushPromises();
    picker(wrapper).vm.$emit('update:modelValue', null);
    await flushPromises();

    expect(vm(wrapper).donor).toBeNull();
    expect(wrapper.find('#name').attributes('disabled')).toBeUndefined();
  });

  it('starts a new donor with the typed name and a default letter salutation', async () => {
    const wrapper = await mountForm();
    picker(wrapper).vm.$emit('neu', { name: 'Neue Person', street: '', city: '' });
    await flushPromises();
    expect(vm(wrapper).inputs.name).toBe('Neue Person');
    expect(vm(wrapper).inputs.letterSalutation).toBe('Sehr geehrte Damen und Herren');
    expect(wrapper.find('#name').attributes('disabled')).toBeUndefined();
  });

  it('stores euro amounts as cents', async () => {
    const wrapper = await mountForm();
    await setAmount(wrapper, 12.5);
    expect(vm(wrapper).inputs.donationAmountCents).toBe(1250);
    await setAmount(wrapper, null);
    expect(vm(wrapper).inputs.donationAmountCents).toBe(0);
  });

  it('writes picked dates as YYYY-MM-DD and clears the exemption date to ""', async () => {
    const wrapper = await mountForm();
    datePicker(wrapper, 'donation-date').vm.$emit('update:modelValue', new Date(2026, 2, 1));
    datePicker(wrapper, 'exemption-date').vm.$emit('update:modelValue', null);
    await flushPromises();
    expect(vm(wrapper).inputs.donationDate).toBe('2026-03-01');
    expect(vm(wrapper).inputs.exemptionDate).toBe('');
  });

  it('requires an amount and a letter salutation for a cover letter', async () => {
    const wrapper = await mountForm();
    picker(wrapper).vm.$emit('neu', { name: 'Neue Person', street: '', city: '' });
    await flushPromises();
    vm(wrapper).inputs.letterSalutation = '';

    await submit(wrapper);

    expect(calls()).toEqual(['GET /api/settings']);
    expect(wrapper.find('[data-testid="error-amount"]').text()).toBe('Amount is required');
    expect(wrapper.find('[data-testid="error-letter-salutation"]').text()).toBe(
      'Letter Salutation is required when creating a cover letter.',
    );

    vm(wrapper).inputs.letterSalutation = 'Liebe Freunde';
    await flushPromises();
    expect(wrapper.find('[data-testid="error-letter-salutation"]').exists()).toBe(false);
  });

  it('does not require a letter salutation without a cover letter', async () => {
    replies['POST /api/donation-receipt'] = {
      status: 201,
      body: { receiptId: 12, pdfStatus: 'OK' },
    };
    const wrapper = await mountForm();
    picker(wrapper).vm.$emit('neu', { name: 'Neue Person', street: '', city: '' });
    await flushPromises();
    Object.assign(vm(wrapper).inputs, { letterSalutation: '', withCoverLetter: false });
    await setAmount(wrapper, 50);

    await submit(wrapper);

    expect(calls()).toContain('POST /api/donation-receipt');
  });

  it('creates a receipt for a picked donor and opens it', async () => {
    replies['POST /api/donation-receipt'] = {
      status: 201,
      body: { receiptId: 12, pdfStatus: 'OK' },
    };
    const wrapper = await mountForm();
    picker(wrapper).vm.$emit('update:modelValue', hans);
    await setAmount(wrapper, 100);

    await submit(wrapper);

    const body = bodyOf('POST /api/donation-receipt');
    expect(body.donorId).toBe(7);
    expect(body.donorData).toBeUndefined();
    expect((body.inputs as ReceiptInputs).donationAmountCents).toBe(10000);
    expect(notify.success).toHaveBeenCalledWith('Receipt saved successfully.');
    expect(mockPush).toHaveBeenCalledWith('/donation-receipt/12');
  });

  it('creates a new donor from the fields', async () => {
    replies['POST /api/donation-receipt'] = {
      status: 201,
      body: { receiptId: 12, pdfStatus: 'OK' },
    };
    const wrapper = await mountForm();
    picker(wrapper).vm.$emit('neu', { name: 'Neue Person', street: '', city: '' });
    await flushPromises();
    await wrapper.find('#street').setValue('Weg 1');
    await wrapper.find('#city').setValue('Stadt');
    await setAmount(wrapper, 20);

    await submit(wrapper);

    const body = bodyOf('POST /api/donation-receipt');
    expect(body.donorId).toBeUndefined();
    expect(body.donorData).toEqual({
      name: 'Neue Person',
      street: 'Weg 1',
      city: 'Stadt',
      letterSalutation: 'Sehr geehrte Damen und Herren',
      addressSalutation: '',
    });
  });

  it('warns about a failed PDF and reports a donor update', async () => {
    replies['POST /api/donation-receipt'] = {
      status: 201,
      body: {
        receiptId: 12,
        pdfStatus: 'FAILED',
        pdfError: 'LibreOffice missing',
        donorUpdated: true,
      },
    };
    const wrapper = await mountForm();
    picker(wrapper).vm.$emit('update:modelValue', hans);
    await setAmount(wrapper, 100);
    await submit(wrapper);

    expect(notify.warn).toHaveBeenCalledWith('LibreOffice missing');
    expect(notify.info).toHaveBeenCalledWith('Donor master data updated.');
    expect(notify.success).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/donation-receipt/12');
  });

  it('shows server errors and stays on the form', async () => {
    replies['POST /api/donation-receipt'] = { status: 400, body: { error: 'Street is required' } };
    const wrapper = await mountForm();
    picker(wrapper).vm.$emit('update:modelValue', hans);
    await setAmount(wrapper, 100);
    await submit(wrapper);

    expect(notify.error).toHaveBeenCalledWith('Street is required');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('reports a network error while loading', async () => {
    replies = {};
    const wrapper = await mountForm();
    expect(wrapper.find('[data-testid="load-error"]').text()).toContain(
      'Network error while loading',
    );
  });
});

describe('DonationReceiptFormView — new revision', () => {
  beforeEach(() => {
    setRoute({ id: '3' });
    replies['GET /api/donation-receipt/3'] = { status: 200, body: receiptDto() };
  });

  it('loads the revision and refreshes the donor fields from the donor record', async () => {
    const wrapper = await mountForm();
    expect(wrapper.find('[data-testid="page-title"]').text()).toBe('Create New Revision');
    expect(wrapper.find('[data-testid="submit"]').text()).toContain('Save Revision');
    expect(wrapper.find('[data-testid="donor-search"]').exists()).toBe(false);
    expect(vm(wrapper).inputs).toMatchObject({
      name: 'Hans Schmidt',
      street: 'Musterstr. 1',
      letterSalutation: 'Sehr geehrter Herr Schmidt',
      addressSalutation: 'Herrn',
      treasurer: 'Old Treasurer',
      donationAmountCents: 25000,
      donationDate: '2026-02-01',
    });
    expect(wrapper.find('[data-testid="defaults-hint"]').exists()).toBe(true);
  });

  it('shows no hint when the revision already matches the donor', async () => {
    replies['GET /api/donation-receipt/3'] = {
      status: 200,
      body: receiptDto({
        ...revisionInputs,
        name: hans.name,
        street: hans.street,
        city: hans.city,
        letterSalutation: hans.letterSalutation,
        addressSalutation: hans.addressSalutation,
      }),
    };
    const wrapper = await mountForm();
    expect(wrapper.find('[data-testid="defaults-hint"]').exists()).toBe(false);
  });

  it('keeps the donor fields editable and posts the edits for the in-place update', async () => {
    replies['POST /api/donation-receipt/3/revision'] = {
      status: 201,
      body: { revisionId: 40, pdfStatus: 'OK', donorUpdated: true },
    };
    const wrapper = await mountForm();
    expect(wrapper.find('#name').attributes('disabled')).toBeUndefined();
    expect(wrapper.find('[data-testid="donor-edit-hint"]').exists()).toBe(true);

    await wrapper.find('#city').setValue('Potsdam');
    await submit(wrapper);

    const body = bodyOf('POST /api/donation-receipt/3/revision');
    expect(Object.keys(body)).toEqual(['inputs']);
    expect((body.inputs as ReceiptInputs).city).toBe('Potsdam');
    expect(notify.info).toHaveBeenCalledWith('Donor master data updated.');
    expect(mockPush).toHaveBeenCalledWith('/donation-receipt/3');
  });

  it('shows a load error', async () => {
    replies['GET /api/donation-receipt/3'] = { status: 404, body: { error: 'Receipt not found' } };
    const wrapper = await mountForm();
    expect(wrapper.find('[data-testid="load-error"]').text()).toContain(
      'Receipt could not be loaded',
    );
  });
});

describe('DonationReceiptFormView — copy', () => {
  beforeEach(() => {
    setRoute({}, { copyFrom: '3' });
    replies['GET /api/donation-receipt/3'] = { status: 200, body: receiptDto() };
  });

  it('copies with today as donation date and the linked, locked donor', async () => {
    replies['POST /api/donation-receipt'] = {
      status: 201,
      body: { receiptId: 13, pdfStatus: 'OK' },
    };
    const wrapper = await mountForm();

    expect(wrapper.find('[data-testid="page-title"]').text()).toBe('Duplicate Receipt');
    expect(vm(wrapper).inputs.donationDate).toBe(today);
    expect(vm(wrapper).inputs.donationAmountCents).toBe(25000);
    expect(vm(wrapper).inputs.name).toBe('Hans Schmidt');
    expect(wrapper.find('#name').attributes('disabled')).toBeDefined();

    await submit(wrapper);
    expect(bodyOf('POST /api/donation-receipt').donorId).toBe(7);
    expect(mockPush).toHaveBeenCalledWith('/donation-receipt/13');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit --workspace=frontend -- DonationReceiptFormView`
Expected: FAIL.

- [ ] **Step 3: Rewrite the form**

Replace `frontend/src/views/DonationReceiptFormView.vue` with:

```vue
<script setup lang="ts">
import Button from 'primevue/button';
import DatePicker from 'primevue/datepicker';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import ToggleSwitch from 'primevue/toggleswitch';
import type { DonationReceiptDto, DonorDto, ReceiptInputs, SystemSettings } from 'shared';
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import DonorAutocomplete from '../components/DonorAutocomplete.vue';
import FormSection from '../components/ui/FormSection.vue';
import PageHeader from '../components/ui/PageHeader.vue';
import { useNotify } from '../composables/useNotify';
import { useAppStore } from '../stores/app';
import { fromIsoDate, toIsoDate } from '../utils/format';

const router = useRouter();
const route = useRoute();
const store = useAppStore();
const notify = useNotify();

const receiptId = route.params.id ? parseInt(String(route.params.id)) : null;
const copyFromId = route.query.copyFrom ? parseInt(String(route.query.copyFrom)) : null;
const isNewRevision = !!receiptId;
const isCopy = !!copyFromId;

const DEFAULT_LETTER_SALUTATION = 'Sehr geehrte Damen und Herren';
const SETTINGS_KEYS = [
  'treasurer',
  'charitablePurpose',
  'taxOfficeName',
  'taxNumber',
  'exemptionDate',
  'assessmentPeriod',
] as const;

const sending = ref(false);
const loadError = ref('');
const defaultsHint = ref(false);
const validationAttempted = ref(false);

const donor = ref<DonorDto | null>(null);
const newDonor = ref(false);

/** Revisions edit the linked donor in place; a donor picked from the search stays locked. */
const donorFieldsLocked = computed(() => !isNewRevision && !!donor.value && !newDonor.value);

const inputs = ref<ReceiptInputs>({
  name: '',
  street: '',
  city: '',
  letterSalutation: '',
  addressSalutation: '',
  donationAmountCents: 0,
  donationDate: toIsoDate(new Date()),
  withCoverLetter: true,
  treasurer: '',
  charitablePurpose: '',
  taxOfficeName: '',
  taxNumber: '',
  exemptionDate: '',
  assessmentPeriod: '',
});

const pageTitle = isNewRevision
  ? 'Create New Revision'
  : isCopy
    ? 'Duplicate Receipt'
    : 'New Donation Receipt';

type FieldKey = 'letterSalutation' | 'amount';

/** Shown after the first submit attempt and kept up to date while the user fixes them. */
const fieldErrors = computed<Partial<Record<FieldKey, string>>>(() => {
  if (!validationAttempted.value) return {};
  const errors: Partial<Record<FieldKey, string>> = {};
  if (inputs.value.withCoverLetter && !inputs.value.letterSalutation.trim()) {
    errors.letterSalutation = 'Letter Salutation is required when creating a cover letter.';
  }
  if (inputs.value.donationAmountCents <= 0) errors.amount = 'Amount is required';
  return errors;
});

const amountEuros = computed<number | null>({
  get: () => (inputs.value.donationAmountCents > 0 ? inputs.value.donationAmountCents / 100 : null),
  set: (euros) => {
    inputs.value.donationAmountCents = euros === null ? 0 : Math.round(euros * 100);
  },
});

function dateModel(key: 'donationDate' | 'exemptionDate') {
  return computed<Date | null>({
    get: () => fromIsoDate(inputs.value[key]),
    set: (date) => {
      inputs.value[key] = date ? toIsoDate(date) : '';
    },
  });
}

const donationDateValue = dateModel('donationDate');
const exemptionDateValue = dateModel('exemptionDate');

function fillDonorFields(d: DonorDto) {
  inputs.value.name = d.name;
  inputs.value.street = d.street;
  inputs.value.city = d.city;
  inputs.value.letterSalutation = d.letterSalutation;
  inputs.value.addressSalutation = d.addressSalutation ?? '';
}

function donorFieldsOf(i: ReceiptInputs): string[] {
  return [i.name, i.street, i.city, i.letterSalutation, i.addressSalutation ?? ''];
}

async function loadSettings() {
  const res = await fetch('/api/settings');
  if (!res.ok) return;
  const data = (await res.json()) as Partial<SystemSettings>;
  for (const key of SETTINGS_KEYS) {
    const value = data[key];
    if (value) inputs.value[key] = value;
  }
}

async function fetchReceipt(id: number): Promise<DonationReceiptDto | null> {
  const res = await fetch(`/api/donation-receipt/${id}`);
  if (!res.ok) {
    loadError.value = 'Receipt could not be loaded';
    return null;
  }
  return (await res.json()) as DonationReceiptDto;
}

async function loadRevision(id: number) {
  const data = await fetchReceipt(id);
  if (!data) return;
  if (data.activeRevision) {
    const e = data.activeRevision.inputs;
    inputs.value = { ...e, donationDate: e.donationDate.slice(0, 10) };
  }
  donor.value = data.donor;
  const before = donorFieldsOf(inputs.value).join('\n');
  fillDonorFields(data.donor);
  defaultsHint.value = before !== donorFieldsOf(inputs.value).join('\n');
}

async function copyFromReceipt(id: number) {
  const data = await fetchReceipt(id);
  if (!data) return;
  if (data.activeRevision) {
    inputs.value = { ...data.activeRevision.inputs, donationDate: toIsoDate(new Date()) };
  }
  donor.value = data.donor;
  newDonor.value = false;
  fillDonorFields(data.donor);
}

onMounted(async () => {
  if (store.receiptTemplateAvailable === false) {
    router.replace('/donation-receipt');
    return;
  }
  if (store.receiptTemplateAvailable === null) {
    await store.checkTemplates();
    if (!store.receiptTemplateAvailable) {
      router.replace('/donation-receipt');
      return;
    }
  }

  try {
    await loadSettings();
    if (receiptId) await loadRevision(receiptId);
    else if (copyFromId) await copyFromReceipt(copyFromId);
  } catch {
    loadError.value = 'Network error while loading';
  }
});

function onDonorSelected(d: DonorDto | null) {
  donor.value = d;
  if (d) {
    newDonor.value = false;
    fillDonorFields(d);
  }
}

function onNewDonor(data: { name: string; street: string; city: string }) {
  newDonor.value = true;
  donor.value = null;
  inputs.value.name = data.name;
  inputs.value.street = data.street;
  inputs.value.city = data.city;
  if (!inputs.value.letterSalutation) inputs.value.letterSalutation = DEFAULT_LETTER_SALUTATION;
}

function donorRequestBody(): Record<string, unknown> {
  const body: Record<string, unknown> = { inputs: inputs.value };
  if (donor.value && !newDonor.value) {
    body.donorId = donor.value.id;
  } else {
    body.donorData = {
      name: inputs.value.name,
      street: inputs.value.street,
      city: inputs.value.city,
      letterSalutation: inputs.value.letterSalutation,
      addressSalutation: inputs.value.addressSalutation,
    };
  }
  return body;
}

async function submit() {
  validationAttempted.value = true;
  if (Object.keys(fieldErrors.value).length > 0) return;

  sending.value = true;
  try {
    const res = isNewRevision
      ? await fetch(`/api/donation-receipt/${receiptId}/revision`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inputs: inputs.value }),
        })
      : await fetch('/api/donation-receipt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(donorRequestBody()),
        });
    const result = await res.json();
    if (!res.ok) {
      notify.error(result.error || 'Unknown error');
      return;
    }
    if (result.pdfStatus === 'FAILED') {
      notify.warn(result.pdfError || 'PDF could not be generated. Please try again.');
    } else {
      notify.success('Receipt saved successfully.');
    }
    if (result.donorUpdated) notify.info('Donor master data updated.');
    router.push(`/donation-receipt/${result.receiptId ?? receiptId}`);
  } catch {
    notify.error('Network error while saving');
  } finally {
    sending.value = false;
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

    <form @submit.prevent="submit">
      <FormSection title="Donor">
        <div v-if="!isNewRevision" class="field donor-search">
          <label for="donor-search-input">Search or create donor</label>
          <DonorAutocomplete
            :model-value="donor"
            input-id="donor-search-input"
            @update:model-value="onDonorSelected"
            @neu="onNewDonor"
          />
        </div>

        <Message
          v-if="isNewRevision && defaultsHint"
          severity="info"
          size="small"
          data-testid="defaults-hint"
          class="hint-message"
        >
          This revision was pre-filled with the current donor master data.
        </Message>

        <div class="grid-2">
          <div class="field">
            <label for="name">Name</label>
            <InputText
              id="name"
              v-model="inputs.name"
              required
              :disabled="donorFieldsLocked"
              fluid
            />
          </div>
          <div class="field">
            <label for="street">Street</label>
            <InputText
              id="street"
              v-model="inputs.street"
              required
              :disabled="donorFieldsLocked"
              fluid
            />
          </div>
          <div class="field">
            <label for="city">City</label>
            <InputText
              id="city"
              v-model="inputs.city"
              required
              :disabled="donorFieldsLocked"
              fluid
            />
          </div>
          <div class="field">
            <label for="letter-salutation">Letter Salutation</label>
            <InputText
              id="letter-salutation"
              v-model="inputs.letterSalutation"
              :disabled="donorFieldsLocked"
              :invalid="!!fieldErrors.letterSalutation"
              fluid
            />
            <Message
              v-if="fieldErrors.letterSalutation"
              severity="error"
              size="small"
              variant="simple"
              data-testid="error-letter-salutation"
            >
              {{ fieldErrors.letterSalutation }}
            </Message>
          </div>
          <div class="field field--wide">
            <label for="address-salutation">Address Salutation (optional)</label>
            <InputText
              id="address-salutation"
              v-model="inputs.addressSalutation"
              :disabled="donorFieldsLocked"
              fluid
            />
          </div>
        </div>

        <p v-if="isNewRevision" class="muted hint" data-testid="donor-edit-hint">
          Editing these donor fields updates the linked donor record for this receipt.
        </p>
      </FormSection>

      <FormSection title="Donation">
        <div class="grid-2">
          <div class="field">
            <label for="amount">Amount</label>
            <InputNumber
              v-model="amountEuros"
              input-id="amount"
              mode="currency"
              currency="EUR"
              locale="de-DE"
              :invalid="!!fieldErrors.amount"
              fluid
            />
            <Message
              v-if="fieldErrors.amount"
              severity="error"
              size="small"
              variant="simple"
              data-testid="error-amount"
            >
              {{ fieldErrors.amount }}
            </Message>
          </div>
          <div class="field">
            <label for="donation-date">Donation Date</label>
            <DatePicker
              v-model="donationDateValue"
              input-id="donation-date"
              data-testid="donation-date"
              date-format="dd.mm.yy"
              show-icon
              fluid
            />
          </div>
          <div class="field">
            <label for="with-cover-letter">Cover Letter</label>
            <div class="row gap-sm">
              <ToggleSwitch v-model="inputs.withCoverLetter" input-id="with-cover-letter" />
              <span>{{
                inputs.withCoverLetter ? 'With cover letter' : 'Without cover letter'
              }}</span>
            </div>
          </div>
        </div>
      </FormSection>

      <FormSection title="Association Data (from Settings)">
        <div class="grid-2">
          <div class="field">
            <label for="treasurer">Treasurer</label>
            <InputText id="treasurer" v-model="inputs.treasurer" fluid />
          </div>
          <div class="field">
            <label for="charitable-purpose">Charitable Purpose</label>
            <InputText id="charitable-purpose" v-model="inputs.charitablePurpose" fluid />
          </div>
          <div class="field">
            <label for="tax-office">Tax Office</label>
            <InputText id="tax-office" v-model="inputs.taxOfficeName" fluid />
          </div>
          <div class="field">
            <label for="tax-number">Tax Number</label>
            <InputText id="tax-number" v-model="inputs.taxNumber" fluid />
          </div>
          <div class="field">
            <label for="exemption-date">Exemption Date</label>
            <DatePicker
              v-model="exemptionDateValue"
              input-id="exemption-date"
              data-testid="exemption-date"
              date-format="dd.mm.yy"
              show-icon
              show-clear
              fluid
            />
          </div>
          <div class="field">
            <label for="assessment-period">Assessment Period</label>
            <InputText id="assessment-period" v-model="inputs.assessmentPeriod" fluid />
          </div>
        </div>
      </FormSection>

      <div class="form-actions">
        <Button label="Cancel" text severity="secondary" @click="router.back()" />
        <Button
          type="submit"
          :label="
            sending
              ? isNewRevision
                ? 'Saving revision…'
                : 'Generating…'
              : isNewRevision
                ? 'Save Revision'
                : 'Create Receipt'
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

.donor-search,
.hint-message {
  margin-bottom: 1rem;
}

.field--wide {
  grid-column: 1 / -1;
}

.hint {
  margin: 0.75rem 0 0;
  font-size: 0.8125rem;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.75rem;
}
</style>
```

Notes for the implementer:

- `FormSection` renders one Card per section; check how `InvoiceFormView.vue` spaces them and do the same if the cards touch.
- `DatePicker` in PrimeVue 5 supports `showClear`. If it doesn't render a clear button with `show-clear`, keep the attribute: clearing the text also emits `null`, which the test drives directly.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit --workspace=frontend -- DonationReceiptFormView`
Expected: PASS.

- [ ] **Step 5: Full verification and commit**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS.

```bash
git add frontend/src/views/DonationReceiptFormView.vue frontend/src/__tests__/DonationReceiptFormView.test.ts
git commit -m "feat: rebuild donation receipt form with PrimeVue inputs and editable revision donor

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Receipt settings

**Files:**

- Rewrite: `frontend/src/views/SettingsView.vue`
- Test: `frontend/src/__tests__/SettingsView.test.ts` (new)

**Interfaces:**

- Consumes: `TemplateCard`, `PageHeader`, `useNotify`, `useAppStore().checkTemplates`, `fromIsoDate`, `toIsoDate`, `.section-title`.
- Produces (test hooks):
  - Script bindings `settings` (SystemSettings) and `donors` (DonorDto[]).
  - Field ids `treasurer`, `charitable-purpose`, `tax-office`, `tax-number`, `exemption-date`, `assessment-period`.
  - `data-testid`s: `save-settings`, `donor-filter`, `donor-count`, `donors-table`.
  - Donor rows have class `donor-row`; the DatePicker root carries `data-testid="exemption-date"`.

Behavior:

- Heading `Donation Receipt Settings`; Back → `router.back()`.
- `Tabs` (default `association`), in this order: **Association data**, **Donors**, **Templates**.
- **Association data:**
  - A `<form>` with h3 `Association Data (Pre-fill)` and the six fields (labels `Treasurer`, `Charitable Purpose`, `Tax Office`, `Tax Number`, `Exemption Date`, `Assessment Period`, each `for` its id). Exemption Date is a clearable `DatePicker` (`YYYY-MM-DD`, cleared → `''`).
  - Load with `GET /api/settings`; failure toast `Error loading settings`.
  - `Save` (submit) → `PUT /api/settings` with all six fields → toast `Settings saved`, or `Error saving settings`.
- **Donors:**
  - `GET /api/donor?all=true`; failure toast `Error loading donors`.
  - Case-insensitive search over name, street and city.
  - Count text `1 donor` / `N donors`, or `X of N donors` while searching.
  - `DataTable` row editing for name, street, city, letter salutation and address salutation.
  - Save → `PATCH /api/donor/:id` with `{ name, street, city, letterSalutation, addressSalutation: addressSalutation || null }` → replace the row by id; toast `Donor saved`, or `Error saving donor`.
- **Templates:**
  - h3 `Templates`, then a `TemplateCard` for `ANSCHREIBEN` (label `Cover Letter (.docx)`, accept `.docx`, preview title `Cover Letter Preview`) and one for `QUITTUNG` (label `Donation Receipt (.pdf)`, accept `.pdf`, preview title `Receipt Preview`).
  - On `uploaded`: reload `/api/templates` (failure toast `Error loading templates`), then **always** call `store.checkTemplates()` so "New Receipt" is enabled without a reload.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/__tests__/SettingsView.test.ts`:

```ts
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import DataTable from 'primevue/datatable';
import DatePicker from 'primevue/datepicker';
import type { DonorDto, SystemSettings, TemplateDto } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRouter } from 'vue-router';
import TemplateCard from '../components/TemplateCard.vue';
import { useAppStore } from '../stores/app';
import SettingsView from '../views/SettingsView.vue';
import { withPrimeVue } from './helpers/primeVue';

const { notify } = vi.hoisted(() => ({
  notify: { success: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('vue-router', () => ({ useRouter: vi.fn() }));
vi.mock('../composables/useNotify', () => ({ useNotify: () => notify }));

interface ViewVM {
  settings: SystemSettings;
  donors: DonorDto[];
}

function vm(wrapper: VueWrapper): ViewVM {
  return wrapper.vm as unknown as ViewVM;
}

const receiptTemplate: TemplateDto = {
  id: 2,
  type: 'QUITTUNG',
  version: 4,
  fileName: 'quittung.pdf',
  active: true,
  uploadedAt: '2026-10-01T10:00:00.000Z',
};

const settings: SystemSettings = {
  treasurer: 'Kim Kasse',
  charitablePurpose: 'Förderung des Sports',
  taxOfficeName: 'FA Mitte',
  taxNumber: '12/345/67890',
  exemptionDate: '2024-05-02',
  assessmentPeriod: '2021–2023',
};

const donors: DonorDto[] = [
  {
    id: 1,
    name: 'Hans Schmidt',
    street: 'Musterstr. 1',
    city: 'Berlin',
    letterSalutation: 'Sehr geehrter Herr Schmidt',
    addressSalutation: null,
  },
  {
    id: 2,
    name: 'Maria Müller',
    street: 'Testgasse 2',
    city: 'Hamburg',
    letterSalutation: 'Sehr geehrte Frau Müller',
    addressSalutation: 'Frau',
  },
];

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
  const wrapper = mount(SettingsView, { attachTo: document.body, global: withPrimeVue() });
  await flushPromises();
  return wrapper;
}

function donorsTable(wrapper: VueWrapper) {
  return wrapper
    .findAllComponents(DataTable)
    .find((c) => c.attributes('data-testid') === 'donors-table')!;
}

beforeEach(() => {
  replies = {
    'GET /api/settings': { status: 200, body: settings },
    'GET /api/templates': { status: 200, body: [receiptTemplate] },
    'GET /api/donor?all=true': { status: 200, body: donors },
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

describe('SettingsView', () => {
  it('shows heading, tabs and section headings', async () => {
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="page-title"]').text()).toBe('Donation Receipt Settings');
    const tabs = wrapper.findAll('[role="tab"]').map((t) => t.text());
    expect(tabs).toEqual(['Association data', 'Donors', 'Templates']);
    expect(wrapper.findAll('h3').map((h) => h.text())).toEqual(
      expect.arrayContaining(['Association Data (Pre-fill)', 'Templates']),
    );
  });

  it('labels every association field', async () => {
    const wrapper = await mountView();
    for (const [label, id] of [
      ['Treasurer', 'treasurer'],
      ['Charitable Purpose', 'charitable-purpose'],
      ['Tax Office', 'tax-office'],
      ['Tax Number', 'tax-number'],
      ['Exemption Date', 'exemption-date'],
      ['Assessment Period', 'assessment-period'],
    ]) {
      const el = wrapper.findAll('label').find((l) => l.text() === label);
      expect(el?.attributes('for')).toBe(id);
      expect(wrapper.find(`#${id}`).exists()).toBe(true);
    }
  });

  it('loads and saves the association data', async () => {
    replies['PUT /api/settings'] = { status: 200, body: {} };
    const wrapper = await mountView();
    expect((wrapper.find('#treasurer').element as HTMLInputElement).value).toBe('Kim Kasse');

    await wrapper.find('#treasurer').setValue('Max Mustermann');
    await wrapper.find('[data-testid="save-settings"]').trigger('click');
    await flushPromises();

    expect(bodyOf('PUT /api/settings')).toEqual({ ...settings, treasurer: 'Max Mustermann' });
    expect(notify.success).toHaveBeenCalledWith('Settings saved');
  });

  it('clears the exemption date to an empty string', async () => {
    replies['PUT /api/settings'] = { status: 200, body: {} };
    const wrapper = await mountView();
    const picker = wrapper
      .findAllComponents(DatePicker)
      .find((c) => c.attributes('data-testid') === 'exemption-date')!;

    picker.vm.$emit('update:modelValue', null);
    await flushPromises();
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(bodyOf('PUT /api/settings').exemptionDate).toBe('');
  });

  it('reports load and save errors', async () => {
    replies['GET /api/settings'] = { status: 500, body: {} };
    replies['PUT /api/settings'] = { status: 500, body: {} };
    const wrapper = await mountView();
    expect(notify.error).toHaveBeenCalledWith('Error loading settings');

    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(notify.error).toHaveBeenCalledWith('Error saving settings');
  });

  it('shows both template cards with their templates', async () => {
    const wrapper = await mountView();
    const cards = wrapper.findAllComponents(TemplateCard);
    expect(cards.map((c) => c.props())).toEqual([
      {
        type: 'ANSCHREIBEN',
        label: 'Cover Letter (.docx)',
        accept: '.docx',
        previewTitle: 'Cover Letter Preview',
        template: null,
      },
      {
        type: 'QUITTUNG',
        label: 'Donation Receipt (.pdf)',
        accept: '.pdf',
        previewTitle: 'Receipt Preview',
        template: receiptTemplate,
      },
    ]);
  });

  it('reloads templates and refreshes the store after an upload', async () => {
    const wrapper = await mountView();
    const checkTemplates = vi.spyOn(useAppStore(), 'checkTemplates').mockResolvedValue();
    fetchMock.mockClear();

    wrapper.findAllComponents(TemplateCard)[1].vm.$emit('uploaded');
    await flushPromises();

    expect(fetchMock.mock.calls.map(([url]) => url)).toContain('/api/templates');
    expect(checkTemplates).toHaveBeenCalled();
  });

  it('still refreshes the store when reloading templates fails', async () => {
    const wrapper = await mountView();
    const checkTemplates = vi.spyOn(useAppStore(), 'checkTemplates').mockResolvedValue();
    replies['GET /api/templates'] = { status: 500, body: {} };

    wrapper.findAllComponents(TemplateCard)[0].vm.$emit('uploaded');
    await flushPromises();

    expect(notify.error).toHaveBeenCalledWith('Error loading templates');
    expect(checkTemplates).toHaveBeenCalled();
  });

  it('lists, counts and searches donors', async () => {
    const wrapper = await mountView();
    expect(wrapper.findAll('.donor-row')).toHaveLength(2);
    expect(wrapper.find('[data-testid="donor-count"]').text()).toBe('2 donors');

    await wrapper.find('[data-testid="donor-filter"]').setValue('HAMBURG');
    await flushPromises();
    expect(wrapper.findAll('.donor-row')).toHaveLength(1);
    expect(wrapper.find('[data-testid="donor-count"]').text()).toBe('1 of 2 donors');
  });

  it('uses the singular for one donor', async () => {
    replies['GET /api/donor?all=true'] = { status: 200, body: [donors[0]] };
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="donor-count"]').text()).toBe('1 donor');
  });

  it('saves an edited donor', async () => {
    replies['PATCH /api/donor/2'] = {
      status: 200,
      body: { ...donors[1], city: 'Bremen', addressSalutation: null },
    };
    const wrapper = await mountView();

    donorsTable(wrapper).vm.$emit('row-edit-save', {
      originalEvent: new Event('click'),
      data: donors[1],
      newData: { ...donors[1], city: 'Bremen', addressSalutation: '' },
      index: 1,
    });
    await flushPromises();

    expect(bodyOf('PATCH /api/donor/2')).toEqual({
      name: 'Maria Müller',
      street: 'Testgasse 2',
      city: 'Bremen',
      letterSalutation: 'Sehr geehrte Frau Müller',
      addressSalutation: null,
    });
    expect(vm(wrapper).donors[1].city).toBe('Bremen');
    expect(notify.success).toHaveBeenCalledWith('Donor saved');
  });

  it('reports donor load and save errors', async () => {
    replies['GET /api/donor?all=true'] = { status: 500, body: {} };
    replies['PATCH /api/donor/1'] = { status: 400, body: {} };
    const wrapper = await mountView();
    expect(notify.error).toHaveBeenCalledWith('Error loading donors');

    donorsTable(wrapper).vm.$emit('row-edit-save', {
      originalEvent: new Event('click'),
      data: donors[0],
      newData: donors[0],
      index: 0,
    });
    await flushPromises();
    expect(notify.error).toHaveBeenCalledWith('Error saving donor');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit --workspace=frontend -- SettingsView`
Expected: FAIL.

- [ ] **Step 3: Rewrite the view**

Replace `frontend/src/views/SettingsView.vue` with:

```vue
<script setup lang="ts">
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable, { type DataTableRowEditSaveEvent } from 'primevue/datatable';
import DatePicker from 'primevue/datepicker';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';
import InputText from 'primevue/inputtext';
import Tab from 'primevue/tab';
import TabList from 'primevue/tablist';
import TabPanel from 'primevue/tabpanel';
import TabPanels from 'primevue/tabpanels';
import Tabs from 'primevue/tabs';
import type { DonorDto, SystemSettings, TemplateDto, TemplateType } from 'shared';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import TemplateCard from '../components/TemplateCard.vue';
import PageHeader from '../components/ui/PageHeader.vue';
import { useNotify } from '../composables/useNotify';
import { useAppStore } from '../stores/app';
import { fromIsoDate, toIsoDate } from '../utils/format';

const router = useRouter();
const store = useAppStore();
const notify = useNotify();

// ── Association data ─────────────────────────────
const settings = ref<SystemSettings>({
  treasurer: '',
  charitablePurpose: '',
  taxOfficeName: '',
  taxNumber: '',
  exemptionDate: '',
  assessmentPeriod: '',
});
const saving = ref(false);

const exemptionDateValue = computed<Date | null>({
  get: () => fromIsoDate(settings.value.exemptionDate),
  set: (date) => {
    settings.value.exemptionDate = date ? toIsoDate(date) : '';
  },
});

async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    if (!res.ok) throw new Error('load failed');
    Object.assign(settings.value, await res.json());
  } catch {
    notify.error('Error loading settings');
  }
}

async function saveSettings() {
  saving.value = true;
  try {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings.value),
    });
    if (!res.ok) throw new Error('save failed');
    notify.success('Settings saved');
  } catch {
    notify.error('Error saving settings');
  } finally {
    saving.value = false;
  }
}

// ── Templates ─────────────────────────────
const TEMPLATE_CARDS: {
  type: TemplateType;
  label: string;
  accept: string;
  previewTitle: string;
}[] = [
  {
    type: 'ANSCHREIBEN',
    label: 'Cover Letter (.docx)',
    accept: '.docx',
    previewTitle: 'Cover Letter Preview',
  },
  {
    type: 'QUITTUNG',
    label: 'Donation Receipt (.pdf)',
    accept: '.pdf',
    previewTitle: 'Receipt Preview',
  },
];

const templates = ref<TemplateDto[]>([]);

function templateOf(type: TemplateType): TemplateDto | null {
  return templates.value.find((t) => t.type === type) ?? null;
}

async function loadTemplates() {
  try {
    const res = await fetch('/api/templates');
    if (!res.ok) throw new Error('load failed');
    templates.value = await res.json();
  } catch {
    notify.error('Error loading templates');
  }
}

async function onTemplateUploaded() {
  try {
    await loadTemplates();
  } finally {
    await store.checkTemplates();
  }
}

// ── Donors ─────────────────────────────
const donors = ref<DonorDto[]>([]);
const donorLoading = ref(false);
const donorSearch = ref('');
const editingRows = ref<DonorDto[]>([]);

const filteredDonors = computed(() => {
  const q = donorSearch.value.trim().toLowerCase();
  if (!q) return donors.value;
  return donors.value.filter(
    (d) =>
      d.name.toLowerCase().includes(q) ||
      d.street.toLowerCase().includes(q) ||
      d.city.toLowerCase().includes(q),
  );
});

const donorCountText = computed(() =>
  donorSearch.value.trim()
    ? `${filteredDonors.value.length} of ${donors.value.length} donors`
    : `${donors.value.length} ${donors.value.length === 1 ? 'donor' : 'donors'}`,
);

async function loadDonors() {
  donorLoading.value = true;
  try {
    const res = await fetch('/api/donor?all=true');
    if (!res.ok) throw new Error('load failed');
    donors.value = await res.json();
  } catch {
    notify.error('Error loading donors');
  } finally {
    donorLoading.value = false;
  }
}

async function onRowEditSave(event: DataTableRowEditSaveEvent) {
  const edited = event.newData as DonorDto;
  try {
    const res = await fetch(`/api/donor/${edited.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: edited.name,
        street: edited.street,
        city: edited.city,
        letterSalutation: edited.letterSalutation,
        addressSalutation: edited.addressSalutation || null,
      }),
    });
    if (!res.ok) throw new Error('save failed');
    const updated = (await res.json()) as DonorDto;
    donors.value = donors.value.map((d) => (d.id === updated.id ? updated : d));
    notify.success('Donor saved');
  } catch {
    notify.error('Error saving donor');
  }
}

onMounted(() => {
  void loadSettings();
  void loadTemplates();
  void loadDonors();
});
</script>

<template>
  <div class="page">
    <PageHeader title="Donation Receipt Settings">
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

    <Tabs value="association">
      <TabList>
        <Tab value="association">Association data</Tab>
        <Tab value="donors">Donors</Tab>
        <Tab value="templates">Templates</Tab>
      </TabList>
      <TabPanels>
        <TabPanel value="association">
          <form class="stack" @submit.prevent="saveSettings">
            <h3 class="section-title">Association Data (Pre-fill)</h3>
            <div class="grid-2">
              <div class="field">
                <label for="treasurer">Treasurer</label>
                <InputText id="treasurer" v-model="settings.treasurer" fluid />
              </div>
              <div class="field">
                <label for="charitable-purpose">Charitable Purpose</label>
                <InputText id="charitable-purpose" v-model="settings.charitablePurpose" fluid />
              </div>
              <div class="field">
                <label for="tax-office">Tax Office</label>
                <InputText id="tax-office" v-model="settings.taxOfficeName" fluid />
              </div>
              <div class="field">
                <label for="tax-number">Tax Number</label>
                <InputText id="tax-number" v-model="settings.taxNumber" fluid />
              </div>
              <div class="field">
                <label for="exemption-date">Exemption Date</label>
                <DatePicker
                  v-model="exemptionDateValue"
                  input-id="exemption-date"
                  data-testid="exemption-date"
                  date-format="dd.mm.yy"
                  show-icon
                  show-clear
                  fluid
                />
              </div>
              <div class="field">
                <label for="assessment-period">Assessment Period</label>
                <InputText id="assessment-period" v-model="settings.assessmentPeriod" fluid />
              </div>
            </div>
            <div class="row settings-actions">
              <Button
                type="submit"
                label="Save"
                icon="pi pi-check"
                :loading="saving"
                data-testid="save-settings"
              />
            </div>
          </form>
        </TabPanel>

        <TabPanel value="donors">
          <DataTable
            v-model:editing-rows="editingRows"
            :value="filteredDonors"
            data-key="id"
            edit-mode="row"
            size="small"
            :loading="donorLoading"
            :row-class="() => 'donor-row'"
            data-testid="donors-table"
            @row-edit-save="onRowEditSave"
          >
            <template #header>
              <div class="row row--between">
                <IconField>
                  <InputIcon class="pi pi-search" />
                  <InputText
                    v-model="donorSearch"
                    placeholder="Search donors…"
                    aria-label="Search donors"
                    data-testid="donor-filter"
                  />
                </IconField>
                <span class="muted" data-testid="donor-count">{{ donorCountText }}</span>
              </div>
            </template>
            <template #empty>No donors found.</template>
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
            <Column field="letterSalutation" header="Letter Salutation">
              <template #editor="{ data, field }">
                <InputText v-model="data[field]" size="small" fluid />
              </template>
            </Column>
            <Column field="addressSalutation" header="Address Salutation">
              <template #body="{ data }">{{ data.addressSalutation || '–' }}</template>
              <template #editor="{ data, field }">
                <InputText v-model="data[field]" size="small" fluid />
              </template>
            </Column>
            <Column :row-editor="true" header-style="width: 7rem" body-style="text-align: right" />
          </DataTable>
        </TabPanel>

        <TabPanel value="templates">
          <div class="stack">
            <h3 class="section-title">Templates</h3>
            <TemplateCard
              v-for="card in TEMPLATE_CARDS"
              :key="card.type"
              :type="card.type"
              :label="card.label"
              :accept="card.accept"
              :preview-title="card.previewTitle"
              :template="templateOf(card.type)"
              @uploaded="onTemplateUploaded"
            />
          </div>
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>

<style scoped>
.settings-actions {
  justify-content: flex-end;
}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit --workspace=frontend -- SettingsView`
Expected: PASS. Plan 2 showed that all TabPanels render by default, so the fields in the other tabs exist in the DOM. Clicking `save-settings` submits the form (the test mounts with `attachTo: document.body`).

- [ ] **Step 5: Full verification and commit**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS.

```bash
git add frontend/src/views/SettingsView.vue frontend/src/__tests__/SettingsView.test.ts
git commit -m "feat: rebuild donation receipt settings with tabs, template cards and donor editing

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Browser verification of the receipt screens

**Files:** none. This task only verifies: report defects precisely and do not fix them.

- [ ] **Step 1: Suite and build**

Run: `npm run lint && npm run test:unit && npm run test:integration && npm run build`
Expected: all pass.

- [ ] **Step 2: Walkthrough (dev servers, scratch DB)**

From the worktree, start both servers in the background with the Bash tool's `run_in_background`. Use ports that don't clash with the user's Docker app (3000/5173). If 5179 is taken, check whether a leftover process from this worktree holds it before choosing another port.

```bash
PORT=3996 DATABASE_URL="file:/tmp/primevue-receipts.sqlite" DATA_DIR=/tmp/primevue-receipts-data npm run dev --workspace=backend
VITE_API_TARGET=http://localhost:3996 npx --workspace=frontend vite --port 5179 --strictPort
```

(The backend `dev` script migrates the scratch DB itself.)

Use Playwright MCP (`mcp__playwright__*`) at http://localhost:5179. Walk through in light mode, then repeat the key screens in dark mode and at 390×844:

1. **Receipt list without a template:** the warning shows and "New Receipt" is disabled.
2. **Settings → Templates tab:**
   - Upload `e2e/fixture/geldspende_verein.pdf` as Donation Receipt. Expect the preview dialog titled "Receipt Preview" with an iframe, then Save Template, then a toast; the card shows Version 1.
   - Upload `e2e/fixture/Briefkopf spende.docx` as Cover Letter. Expect "Cover Letter Preview". LibreOffice is at `/usr/bin/libreoffice`; preview generation can take 15–30 s.
   - Navigate to the list without reloading: "New Receipt" is enabled.
3. **Settings → Association data:** fill all fields including the exemption date. Save shows a toast. Reload the page and check that the values persist. Clear the exemption date, save, reload, and check that it stays empty.
4. **New receipt:**
   - The association data is pre-filled.
   - Type a new donor name in the donor search and pick "Create … as new donor". Fill street and city, enter amount `12,50`, pick a donation date. Submit with an empty letter salutation and the cover letter on: the field error shows. Fix it and submit: toast, then the detail page opens.
   - Create a second receipt for the same donor by picking them from the search: the fields lock. Type in the search again: the fields unlock.
5. **Detail:**
   - The header reads `Receipt …` with status Active; Revision 1 is expanded; the association data shows.
   - Download PDF opens the PDF.
   - New Revision: change the donor's city and save. Revision 2 shows, and Settings → Donors shows the new city (in-place update).
   - Cancel receipt asks for confirmation (decline once, then confirm), and the status becomes Cancelled.
6. **List:**
   - The cancelled receipt is hidden by default; the "Cancelled" and "All" toggles show it.
   - Global search, the amount filter and the date range filter work.
   - Select two rows and download: either a ZIP downloads, or a rejection toast deselects the cancelled one.
   - Copy opens "Duplicate Receipt" with today's date.
7. **Settings → Donors:** search, count text, and inline edit of an address salutation, then save; a toast shows.
8. **Console:** no errors other than the PrimeUI license warning and deliberate 4xx responses.
9. **Screenshots:** list in light and dark, detail, form, settings (each tab), mobile list and mobile form. Save them into `/home/sebastian/code/mv-dashboard/.claude/worktrees/feat-primevue/.superpowers/sdd/2026-10-05-primevue-3-donation-receipts/screens/`. Delete any `.playwright-mcp/` in the worktree.

Close the browser and stop both servers (check with `ss -ltnp` that ports 3996 and 5179 are free). Delete `/tmp/primevue-receipts.sqlite` and `/tmp/primevue-receipts-data`.

- [ ] **Step 3: Branch status**

Run: `git status --short && git log --oneline master..HEAD`
Expected: a clean tree, and only plan-1, plan-2 and plan-3 commits.
