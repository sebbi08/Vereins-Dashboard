# PrimeVue Rewrite — Plan 4: Instructor Rent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the instructor-rent screens (list with calculation settings, form) and their components (`WeeklySchedule`, `RecipientPicker`, `InvoiceTextSettings`) with PrimeVue 5, keeping every calculation and validation rule.

**Architecture:** The three components are rebuilt first, each with its own tests, keeping their props and emits. The list moves "Weeks per month" and the invoice-text editor into a collapsible `Panel` above a `DataTable`; the table's footer sum follows the rows the filters leave visible. The form uses `FormSection` cards, PrimeVue number inputs (euros ↔ cents), toasts, and a confirm dialog for deleting. All rent maths stays in `shared` (`calculateInstructorRent`, `validateInstructorRent`, `validateWeeksPerMonth`) and is not touched.

**Tech Stack:** Vue 3 `<script setup>` + TypeScript, PrimeVue 5.0.2 (DataTable, Column, Panel, Fieldset, AutoComplete, InputNumber, InputText, Textarea, Button, Message), Vitest + @vue/test-utils + jsdom.

**Spec:** `docs/superpowers/specs/2026-10-05-primevue-frontend-design.md` (sections "Screens → List pages (Instructors) / Forms / Instructor components")

**Series:** plan 4 of 5 on branch `feat/primevue`, which merges once after plan 5. Plans 1 (foundation), 2 (invoices) and 3 (donation receipts) are done.

## Global Constraints

- Work only in the worktree `.claude/worktrees/feat-primevue` on branch `feat/primevue`. Never touch `master` or other branches; never push.
- Verification after every task: `npm run lint && npm run test:unit && npm run test:integration` (all pass, zero lint warnings).
- No backend/API changes and no changes to `shared/` (rent maths and validation messages stay exactly as they are). The list loads `/api/instructor` once and filters in the browser.
- Explicit component imports (`import DataTable from 'primevue/datatable'`). No deprecated v5 components.
- Rewritten files must not contain Tailwind classes. Use `src/assets/layout.css` helpers (`.page`, `.stack`, `.row`, `.row--between`, `.grid-2`, `.gap-xs|sm|md|lg`, `.muted`, `.field`, `.section-title`, `.facts`, `.facts--grid`) and `<style scoped>` with PrimeVue CSS variables (`--p-content-border-color`, `--p-text-muted-color`, …).
- Building blocks:
  - `PageHeader` (`title`, `#actions`; `<h2 data-testid="page-title">`) and `FormSection` (`title`, default slot).
  - `TABLE_DEFAULTS`, `globalFilter()`, `useTableFilters(defaults)` → `{ filters, globalSearch, statusFilter, clearFilters }`, `isControlClick(event)`, `AMOUNT_RANGE`, `AmountRangeFilter`.
  - `useNotify()` (`success|info|warn|error(detail)`) and `useConfirmAction()` (`confirmAction({ message, header?, acceptLabel?, rejectLabel?, danger? }): Promise<boolean>`).
  - `formatCents`, `formatHours`.
- Feedback:
  - Results of saving, deleting and resetting are toasts via `useNotify`.
  - Validation errors appear under the field as `Message severity="error" size="small" variant="simple"`.
  - A failed load shows an inline error and blocks saving.
  - Rewritten files use neither `window.confirm` nor `alert`.
- Money: integer cents in the model; `InputNumber mode="currency" currency="EUR" locale="de-DE"` edits euros. Weeks per month: `InputNumber` with `locale="de-DE"`, up to 2 decimals. Months: `InputNumber` integer, min 1.
- Time inputs in `WeeklySchedule` stay native `<input type="time">` (value `"HH:MM"`), styled with the `p-inputtext p-component p-inputtext-sm` classes (spec).
- There are no e2e tests for the instructor screens (`e2e/tests` has none). The home tile is unchanged.
- Tests:
  - Mock `useNotify` / `useConfirmAction` with `vi.hoisted` + `vi.mock`.
  - Mount with `global: withPrimeVue(...)` (from `src/__tests__/helpers/primeVue.ts`).
  - Stub `RouterLink` as `{ template: '<a><slot /></a>' }` where no router is installed.
  - Mount with `attachTo: document.body` where real DOM events matter (submit, selection ranges).
  - Drive PrimeVue widgets with `findComponent(...).vm.$emit('update:modelValue', …)` where typing is impractical in jsdom.
  - Auto-unmount and the `matchMedia` / `ResizeObserver` shims are in `src/__tests__/setup.ts`.
- Commit messages: conventional commits with lower-case subjects (commitlint), ending with exactly `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **Typing an hourly rate with decimals** (12,50 €) → saved as 1250 cents; the live summary uses it. Test: Task 5.
2. **Clearing "Weeks per month" or entering 0** → the error shows under the field, Save is disabled, and nothing is sent. Test: Task 4.
3. **Filtering the instructor list** → the footer "Sum" equals the total of the rows still shown, not of all instructors. Test: Task 4.
4. **Editing a linked recipient's fields in the form** → the request carries the `recipientId` and the edited `recipientData`, so the backend updates that recipient in place. Test: Task 5.
5. **An instructor that failed to load** (404 or network) → the form shows the error and cannot save. A `PUT` with an empty form would otherwise overwrite the instructor. Test: Task 5.

---

## File Structure

| File                                                        | Responsibility                                                                                                                             |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `frontend/src/components/WeeklySchedule.vue` (rewrite)      | One `Fieldset` per weekday; blocks and breaks with native time inputs; issues per block                                                    |
| `frontend/src/components/RecipientPicker.vue` (rewrite)     | `AutoComplete` recipient search, "New recipient", editable recipient fields                                                                |
| `frontend/src/components/InvoiceTextSettings.vue` (rewrite) | Invoice text template editor with placeholders and live preview                                                                            |
| `frontend/src/views/InstructorView.vue` (rewrite)           | Calculation-settings panel + instructors DataTable with footer sum                                                                         |
| `frontend/src/views/InstructorFormView.vue` (rewrite)       | New/edit instructor form with live summary                                                                                                 |
| Tests (rewrite)                                             | `WeeklySchedule.test.ts`, `RecipientPicker.test.ts`, `InvoiceTextSettings.test.ts`, `InstructorView.test.ts`, `InstructorFormView.test.ts` |

`frontend/src/utils/recipientForm.ts` stays unchanged.

---

### Task 1: WeeklySchedule

**Files:**

- Rewrite: `frontend/src/components/WeeklySchedule.vue`
- Rewrite: `frontend/src/__tests__/WeeklySchedule.test.ts`

**Interfaces:**

- Produces: `<WeeklySchedule v-model="TimeBlock[]" :issues="ValidationIssue[]" />`, with props and emits unchanged.
- Test ids (unchanged):
  - Per day: `day-MO` … `day-SO` on each `Fieldset` root; `add-block-<DAY>`.
  - Per block: `block`, `block-start`, `block-end`, `block-hours`, `add-break`, `remove-block`, `block-issue`.
  - Per break: `break-start`, `break-end`, `remove-break`.

Behavior (unchanged):

- Blocks are grouped by weekday in Mo…So order, and edits emit a deep copy (the prop array is never mutated).
- `block-hours` shows the net hours (`3,5 h`) only while a block has no issues.
- Issues for `timeBlocks.N` and `timeBlocks.N.*` show under that block, de-duplicated.

Changes:

- Each day is a `Fieldset` with the legend `Mo`, `Di`, …; the days sit in a responsive grid.
- Time fields are native `<input type="time">` with the classes `p-inputtext p-component p-inputtext-sm`.
- Add-block is a text `Button` labelled `Block` with a `pi pi-plus` icon; add-break is labelled `Pause` with a `pi pi-plus` icon.
- Remove-block and remove-break are icon `Button`s (`pi pi-trash` / `pi pi-times`, severity danger) with aria-labels `Remove block` / `Remove break`.
- Issues are error `Message`s (small, simple).

- [ ] **Step 1: Write the failing test**

Replace `frontend/src/__tests__/WeeklySchedule.test.ts` with:

```ts
import { mount } from '@vue/test-utils';
import type { TimeBlock, ValidationIssue } from 'shared';
import { describe, expect, it } from 'vitest';
import WeeklySchedule from '../components/WeeklySchedule.vue';
import { withPrimeVue } from './helpers/primeVue';

const monday: TimeBlock = { weekday: 'MO', start: '08:00', end: '12:00', breaks: [] };

function mountSchedule(modelValue: TimeBlock[], issues: ValidationIssue[] = []) {
  return mount(WeeklySchedule, { props: { modelValue, issues }, global: withPrimeVue() });
}

function lastEmitted(wrapper: ReturnType<typeof mountSchedule>): TimeBlock[] {
  const events = wrapper.emitted('update:modelValue') as TimeBlock[][][];
  return events[events.length - 1][0];
}

describe('WeeklySchedule', () => {
  it('renders seven day fieldsets Mo to So', () => {
    const wrapper = mountSchedule([]);
    const days = ['MO', 'DI', 'MI', 'DO', 'FR', 'SA', 'SO'];
    for (const day of days) {
      const fieldset = wrapper.find(`[data-testid="day-${day}"]`);
      expect(fieldset.exists()).toBe(true);
      expect(fieldset.element.tagName).toBe('FIELDSET');
    }
    expect(wrapper.findAll('legend').map((l) => l.text())).toEqual([
      'Mo',
      'Di',
      'Mi',
      'Do',
      'Fr',
      'Sa',
      'So',
    ]);
  });

  it('shows blocks under their weekday', () => {
    const wrapper = mountSchedule([monday, { ...monday, weekday: 'FR' }]);
    expect(wrapper.find('[data-testid="day-MO"]').findAll('[data-testid="block"]')).toHaveLength(1);
    expect(wrapper.find('[data-testid="day-FR"]').findAll('[data-testid="block"]')).toHaveLength(1);
    expect(wrapper.find('[data-testid="day-DI"]').findAll('[data-testid="block"]')).toHaveLength(0);
  });

  it('uses native time inputs styled like PrimeVue inputs', () => {
    const wrapper = mountSchedule([monday]);
    const start = wrapper.find('[data-testid="block-start"]');
    expect(start.attributes('type')).toBe('time');
    expect(start.classes()).toEqual(expect.arrayContaining(['p-inputtext', 'p-component']));
    expect((start.element as HTMLInputElement).value).toBe('08:00');
  });

  it('adds an empty block on the chosen day', async () => {
    const wrapper = mountSchedule([monday]);
    await wrapper.find('[data-testid="add-block-DI"]').trigger('click');
    expect(lastEmitted(wrapper)).toEqual([
      monday,
      { weekday: 'DI', start: '', end: '', breaks: [] },
    ]);
  });

  it('updates the start time of a block', async () => {
    const wrapper = mountSchedule([monday]);
    await wrapper.find('[data-testid="block-start"]').setValue('09:00');
    expect(lastEmitted(wrapper)).toEqual([{ ...monday, start: '09:00' }]);
  });

  it('adds, edits and removes breaks', async () => {
    const wrapper = mountSchedule([monday]);
    await wrapper.find('[data-testid="add-break"]').trigger('click');
    expect(lastEmitted(wrapper)[0].breaks).toEqual([{ start: '', end: '' }]);

    await wrapper.setProps({ modelValue: lastEmitted(wrapper) });
    await wrapper.find('[data-testid="break-end"]').setValue('10:30');
    expect(lastEmitted(wrapper)[0].breaks).toEqual([{ start: '', end: '10:30' }]);

    await wrapper.setProps({ modelValue: lastEmitted(wrapper) });
    await wrapper.find('[data-testid="remove-break"]').trigger('click');
    expect(lastEmitted(wrapper)[0].breaks).toEqual([]);
  });

  it('removes a block', async () => {
    const wrapper = mountSchedule([monday, { ...monday, weekday: 'FR' }]);
    const remove = wrapper.find('[data-testid="day-MO"] [data-testid="remove-block"]');
    expect(remove.attributes('aria-label')).toBe('Remove block');
    await remove.trigger('click');
    expect(lastEmitted(wrapper)).toEqual([{ ...monday, weekday: 'FR' }]);
  });

  it('shows net hours for a valid block', () => {
    const wrapper = mountSchedule([{ ...monday, breaks: [{ start: '10:00', end: '10:30' }] }]);
    expect(wrapper.find('[data-testid="block-hours"]').text()).toBe('3,5 h');
  });

  it('shows issues of a block once and hides its hours', () => {
    const wrapper = mountSchedule(
      [monday, { ...monday, start: '11:00', end: '13:00' }],
      [
        { path: 'timeBlocks.1', message: 'Time blocks on the same day must not overlap' },
        { path: 'timeBlocks.1.end', message: 'Time blocks on the same day must not overlap' },
      ],
    );
    const blocks = wrapper.findAll('[data-testid="block"]');
    expect(blocks[0].find('[data-testid="block-issue"]').exists()).toBe(false);
    const issues = blocks[1].findAll('[data-testid="block-issue"]');
    expect(issues).toHaveLength(1);
    expect(issues[0].text()).toBe('Time blocks on the same day must not overlap');
    expect(blocks[1].find('[data-testid="block-hours"]').exists()).toBe(false);
  });

  it('does not mutate the prop array', async () => {
    const blocks = [monday];
    const wrapper = mountSchedule(blocks);
    await wrapper.find('[data-testid="block-start"]').setValue('09:00');
    expect(blocks[0].start).toBe('08:00');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit --workspace=frontend -- WeeklySchedule`
Expected: FAIL (no fieldsets or legends, no PrimeVue input classes, no aria-label).

- [ ] **Step 3: Rewrite the component**

Replace `frontend/src/components/WeeklySchedule.vue` with:

```vue
<script setup lang="ts">
import Button from 'primevue/button';
import Fieldset from 'primevue/fieldset';
import Message from 'primevue/message';
import {
  blockNetMinutes,
  type TimeBlock,
  type TimeRange,
  type ValidationIssue,
  type Weekday,
  WEEKDAYS,
} from 'shared';
import { computed } from 'vue';
import { formatHours } from '../utils/format';

const props = defineProps<{
  modelValue: TimeBlock[];
  issues: ValidationIssue[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: TimeBlock[]];
}>();

const DAY_LABELS: Record<Weekday, string> = {
  MO: 'Mo',
  DI: 'Di',
  MI: 'Mi',
  DO: 'Do',
  FR: 'Fr',
  SA: 'Sa',
  SO: 'So',
};

/** PrimeVue look for the native time inputs (spec: values stay "HH:MM"). */
const TIME_INPUT_CLASS = 'p-inputtext p-component p-inputtext-sm';

/** Blocks grouped by weekday, keeping the index into the flat modelValue array. */
const days = computed(() =>
  WEEKDAYS.map((weekday) => ({
    weekday,
    label: DAY_LABELS[weekday],
    blocks: props.modelValue
      .map((block, index) => ({ block, index }))
      .filter(({ block }) => block.weekday === weekday),
  })),
);

function issuesFor(index: number): string[] {
  const path = `timeBlocks.${index}`;
  const messages = props.issues
    .filter((issue) => issue.path === path || issue.path.startsWith(`${path}.`))
    .map((issue) => issue.message);
  return [...new Set(messages)];
}

function cloneBlocks(): TimeBlock[] {
  return props.modelValue.map((b) => ({ ...b, breaks: b.breaks.map((br) => ({ ...br })) }));
}

function emitWith(change: (_blocks: TimeBlock[]) => void) {
  const blocks = cloneBlocks();
  change(blocks);
  emit('update:modelValue', blocks);
}

function addBlock(weekday: Weekday) {
  emitWith((blocks) => blocks.push({ weekday, start: '', end: '', breaks: [] }));
}

function removeBlock(index: number) {
  emitWith((blocks) => blocks.splice(index, 1));
}

function updateBlock(index: number, field: keyof TimeRange, value: string) {
  emitWith((blocks) => {
    blocks[index][field] = value;
  });
}

function addBreak(index: number) {
  emitWith((blocks) => blocks[index].breaks.push({ start: '', end: '' }));
}

function removeBreak(index: number, breakIndex: number) {
  emitWith((blocks) => blocks[index].breaks.splice(breakIndex, 1));
}

function updateBreak(index: number, breakIndex: number, field: keyof TimeRange, value: string) {
  emitWith((blocks) => {
    blocks[index].breaks[breakIndex][field] = value;
  });
}

function inputValue(event: Event): string {
  return (event.target as HTMLInputElement).value;
}
</script>

<template>
  <div class="schedule">
    <Fieldset
      v-for="day in days"
      :key="day.weekday"
      :legend="day.label"
      :data-testid="`day-${day.weekday}`"
    >
      <div class="stack gap-sm">
        <div
          v-for="{ block, index } in day.blocks"
          :key="index"
          data-testid="block"
          class="schedule__block"
        >
          <div class="row gap-sm">
            <input
              data-testid="block-start"
              type="time"
              :value="block.start"
              aria-label="Start"
              :class="TIME_INPUT_CLASS"
              @input="updateBlock(index, 'start', inputValue($event))"
            />
            <span class="muted">–</span>
            <input
              data-testid="block-end"
              type="time"
              :value="block.end"
              aria-label="End"
              :class="TIME_INPUT_CLASS"
              @input="updateBlock(index, 'end', inputValue($event))"
            />
            <span v-if="issuesFor(index).length === 0" data-testid="block-hours" class="muted"
              >{{ formatHours(blockNetMinutes(block)) }} h</span
            >
            <span class="schedule__spacer"></span>
            <Button
              label="Pause"
              icon="pi pi-plus"
              size="small"
              text
              data-testid="add-break"
              @click="addBreak(index)"
            />
            <Button
              icon="pi pi-trash"
              size="small"
              text
              severity="danger"
              aria-label="Remove block"
              data-testid="remove-block"
              @click="removeBlock(index)"
            />
          </div>

          <div
            v-for="(brk, breakIndex) in block.breaks"
            :key="breakIndex"
            class="row gap-sm schedule__break"
          >
            <span class="muted schedule__break-label">Pause</span>
            <input
              data-testid="break-start"
              type="time"
              :value="brk.start"
              aria-label="Break start"
              :class="TIME_INPUT_CLASS"
              @input="updateBreak(index, breakIndex, 'start', inputValue($event))"
            />
            <span class="muted">–</span>
            <input
              data-testid="break-end"
              type="time"
              :value="brk.end"
              aria-label="Break end"
              :class="TIME_INPUT_CLASS"
              @input="updateBreak(index, breakIndex, 'end', inputValue($event))"
            />
            <Button
              icon="pi pi-times"
              size="small"
              text
              severity="danger"
              aria-label="Remove break"
              data-testid="remove-break"
              @click="removeBreak(index, breakIndex)"
            />
          </div>

          <Message
            v-for="message in issuesFor(index)"
            :key="message"
            severity="error"
            size="small"
            variant="simple"
            data-testid="block-issue"
          >
            {{ message }}
          </Message>
        </div>

        <div>
          <Button
            label="Block"
            icon="pi pi-plus"
            size="small"
            text
            :data-testid="`add-block-${day.weekday}`"
            @click="addBlock(day.weekday)"
          />
        </div>
      </div>
    </Fieldset>
  </div>
</template>

<style scoped>
.schedule {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
  gap: 1rem;
}

.schedule__block {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.5rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: 0.5rem;
}

.schedule__spacer {
  flex: 1;
}

.schedule__break {
  padding-left: 1rem;
}

.schedule__break-label {
  font-size: 0.8125rem;
}
</style>
```

Notes for the implementer:

- If PrimeVue's `Fieldset` does not pass `data-testid` to its `<fieldset>` root, check `node_modules/primevue/fieldset/Fieldset.vue` (it renders `<fieldset … v-bind="ptmi('root')">`, so attributes should land there). Report what you find; don't wrap the Fieldset in an extra element just to carry the id.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit --workspace=frontend -- WeeklySchedule`
Expected: PASS. `InstructorFormView.test.ts` still tests the old view, which now renders this PrimeVue-based component. Its test ids are unchanged, but that test mounts without PrimeVue. If it fails for that reason (e.g. `Cannot read properties of undefined (reading 'config')`), add `global: withPrimeVue()` to its `setup()` mount, importing the helper from `./helpers/primeVue`. Change nothing else, report it, and include the file in this task's commit. Task 5 rewrites that test anyway.

- [ ] **Step 5: Full verification and commit**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS.

```bash
git add frontend/src/components/WeeklySchedule.vue frontend/src/__tests__/WeeklySchedule.test.ts
git commit -m "feat: rebuild weekly schedule with PrimeVue fieldsets and buttons

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: RecipientPicker

**Files:**

- Rewrite: `frontend/src/components/RecipientPicker.vue`
- Rewrite: `frontend/src/__tests__/RecipientPicker.test.ts`

**Interfaces:**

- Consumes: `emptyRecipient`, `fromRecipientDto`, `RecipientFormValue`, `toRecipientData` from `frontend/src/utils/recipientForm.ts` (unchanged).
- Produces: `<RecipientPicker v-model="RecipientFormValue" />`. The emitted values are unchanged:
  - Picking a suggestion emits `fromRecipientDto(dto)`, which includes the `id`.
  - "New recipient" emits `{ ...emptyRecipient(), name: <trimmed search text> }`.
  - A field edit emits the model with that field changed; the `id` is kept.
- Test ids:
  - `recipient-search` sits on the AutoComplete root; its input has the id `recipient-search`.
  - `recipient-new`, `recipient-linked-hint`.
  - `recipient-salutation|name|street|city|email` are the field inputs, with the same ids.

Behavior:

- **Search:** `GET /api/invoice-recipient?search=<encoded trimmed text>` after 250 ms (AutoComplete `delay`).
- **Suggestions:** each shows `name — street, city`.
- **Stale responses are dropped:** a response is ignored when the user typed again, picked a suggestion, or clicked "New recipient" before it arrived.
- **Errors:** a failed search clears the suggestions.
- **Typing only changes the search box:** it never changes the recipient fields.
- **Linked recipient:** while one is linked (`id !== null`), show `Linked to an existing recipient. Editing these fields updates that recipient.`

- [ ] **Step 1: Write the failing test**

Replace `frontend/src/__tests__/RecipientPicker.test.ts` with:

```ts
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import AutoComplete from 'primevue/autocomplete';
import type { InvoiceRecipientDto } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RecipientPicker from '../components/RecipientPicker.vue';
import { emptyRecipient, type RecipientFormValue, toRecipientData } from '../utils/recipientForm';
import { withPrimeVue } from './helpers/primeVue';

const recipients: InvoiceRecipientDto[] = [
  {
    id: 7,
    name: 'Anna Alt',
    street: 'Hauptstr. 1',
    city: '12345 Berlin',
    email: 'anna@example.org',
    salutation: 'Frau',
  },
];

function mountPicker(modelValue: RecipientFormValue = emptyRecipient()) {
  return mount(RecipientPicker, { props: { modelValue }, global: withPrimeVue() });
}

function autocomplete(wrapper: VueWrapper) {
  return wrapper.findComponent(AutoComplete);
}

function lastEmitted(wrapper: VueWrapper): RecipientFormValue {
  const events = wrapper.emitted('update:modelValue') as RecipientFormValue[][];
  return events[events.length - 1][0];
}

async function typeSearch(wrapper: VueWrapper, text: string) {
  autocomplete(wrapper).vm.$emit('update:modelValue', text);
  await flushPromises();
}

function complete(wrapper: VueWrapper, query: string) {
  autocomplete(wrapper).vm.$emit('complete', { originalEvent: new Event('input'), query });
}

function okResponse(body: unknown): Response {
  return { ok: true, json: () => Promise.resolve(body) } as Response;
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(recipients)));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RecipientPicker', () => {
  it('labels the search and all recipient fields', () => {
    const wrapper = mountPicker();
    expect(wrapper.find('label[for="recipient-search"]').text()).toBe('Search or create recipient');
    expect(wrapper.find('input#recipient-search').exists()).toBe(true);
    for (const key of ['salutation', 'name', 'street', 'city', 'email']) {
      expect(wrapper.find(`label[for="recipient-${key}"]`).exists()).toBe(true);
      expect(wrapper.find(`input#recipient-${key}`).attributes('data-testid')).toBe(
        `recipient-${key}`,
      );
    }
  });

  it('searches recipients and offers them as suggestions', async () => {
    const wrapper = mountPicker();
    await typeSearch(wrapper, 'An');
    complete(wrapper, 'An');
    await flushPromises();

    expect(fetch).toHaveBeenCalledWith('/api/invoice-recipient?search=An');
    expect(autocomplete(wrapper).props('suggestions')).toEqual(recipients);
  });

  it('emits the picked recipient with its id', async () => {
    const wrapper = mountPicker();
    autocomplete(wrapper).vm.$emit('update:modelValue', recipients[0]);
    autocomplete(wrapper).vm.$emit('option-select', {
      originalEvent: new Event('click'),
      value: recipients[0],
    });
    await flushPromises();

    expect(wrapper.emitted('update:modelValue')).toEqual([
      [
        {
          id: 7,
          name: 'Anna Alt',
          street: 'Hauptstr. 1',
          city: '12345 Berlin',
          email: 'anna@example.org',
          salutation: 'Frau',
        },
      ],
    ]);
    expect((wrapper.find('input#recipient-search').element as HTMLInputElement).value).toBe(
      'Anna Alt',
    );
  });

  it('typing in the search does not change the recipient', async () => {
    const wrapper = mountPicker();
    await typeSearch(wrapper, 'Anna');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });

  it('ignores a search response when the search text changed meanwhile', async () => {
    let resolveFirst: (value: Response) => void = () => {};
    vi.mocked(fetch).mockImplementationOnce(
      () => new Promise<Response>((resolve) => (resolveFirst = resolve)),
    );
    const wrapper = mountPicker();
    await typeSearch(wrapper, 'An');
    complete(wrapper, 'An');

    await typeSearch(wrapper, '');
    resolveFirst(okResponse(recipients));
    await flushPromises();

    expect(autocomplete(wrapper).props('suggestions')).toEqual([]);
  });

  it('ignores a search response that arrives after "New recipient"', async () => {
    let resolveFirst: (value: Response) => void = () => {};
    vi.mocked(fetch).mockImplementationOnce(
      () => new Promise<Response>((resolve) => (resolveFirst = resolve)),
    );
    const wrapper = mountPicker();
    await typeSearch(wrapper, 'An');
    complete(wrapper, 'An');

    await wrapper.find('[data-testid="recipient-new"]').trigger('click');
    resolveFirst(okResponse(recipients));
    await flushPromises();

    expect(autocomplete(wrapper).props('suggestions')).toEqual([]);
  });

  it('clears suggestions when the search request fails', async () => {
    const wrapper = mountPicker();
    await typeSearch(wrapper, 'An');
    complete(wrapper, 'An');
    await flushPromises();
    expect(autocomplete(wrapper).props('suggestions')).toHaveLength(1);

    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
    await typeSearch(wrapper, 'Ann');
    complete(wrapper, 'Ann');
    await flushPromises();

    expect(autocomplete(wrapper).props('suggestions')).toEqual([]);
  });

  it('emits field edits and keeps the linked id', async () => {
    const linked: RecipientFormValue = { ...emptyRecipient(), id: 7, name: 'Anna Alt' };
    const wrapper = mountPicker(linked);

    expect(wrapper.find('[data-testid="recipient-linked-hint"]').exists()).toBe(true);
    await wrapper.find('[data-testid="recipient-street"]').setValue('Neue Str. 2');

    expect(lastEmitted(wrapper)).toMatchObject({ id: 7, name: 'Anna Alt', street: 'Neue Str. 2' });
  });

  it('has no linked hint for a new recipient', () => {
    const wrapper = mountPicker();
    expect(wrapper.find('[data-testid="recipient-linked-hint"]').exists()).toBe(false);
  });

  it('starts a new recipient with the trimmed search text as name', async () => {
    const linked: RecipientFormValue = { ...emptyRecipient(), id: 7, name: 'Anna Alt' };
    const wrapper = mountPicker(linked);
    await typeSearch(wrapper, ' Carla Cron ');

    await wrapper.find('[data-testid="recipient-new"]').trigger('click');

    expect(lastEmitted(wrapper)).toEqual({ ...emptyRecipient(), name: 'Carla Cron' });
  });

  it('shows the linked recipient name in the search box when the model changes', async () => {
    const wrapper = mountPicker();
    await wrapper.setProps({ modelValue: { ...emptyRecipient(), id: 9, name: 'Bernd Bach' } });
    expect((wrapper.find('input#recipient-search').element as HTMLInputElement).value).toBe(
      'Bernd Bach',
    );
  });

  it('converts form values to request data with nulls for empty optionals', () => {
    expect(
      toRecipientData({ id: null, name: 'A', street: 'B', city: 'C', email: '', salutation: '' }),
    ).toEqual({ name: 'A', street: 'B', city: 'C', email: null, salutation: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit --workspace=frontend -- RecipientPicker`
Expected: FAIL (no AutoComplete).

- [ ] **Step 3: Rewrite the component**

Replace `frontend/src/components/RecipientPicker.vue` with:

```vue
<script setup lang="ts">
import AutoComplete, {
  type AutoCompleteCompleteEvent,
  type AutoCompleteOptionSelectEvent,
} from 'primevue/autocomplete';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import type { InvoiceRecipientDto } from 'shared';
import { ref, watch } from 'vue';
import { emptyRecipient, fromRecipientDto, type RecipientFormValue } from '../utils/recipientForm';

const props = defineProps<{
  modelValue: RecipientFormValue;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: RecipientFormValue];
}>();

type FieldKey = keyof Omit<RecipientFormValue, 'id'>;

const fields: { key: FieldKey; label: string }[] = [
  { key: 'salutation', label: 'Salutation' },
  { key: 'name', label: 'Name' },
  { key: 'street', label: 'Street' },
  { key: 'city', label: 'Postal code / City' },
  { key: 'email', label: 'Email' },
];

const search = ref(props.modelValue.name);
const suggestions = ref<InvoiceRecipientDto[]>([]);
/** Bumped by every user action; a search response from an older action is stale. */
let latestAction = 0;

watch(
  () => props.modelValue.id,
  () => {
    search.value = props.modelValue.name;
  },
);

function invalidatePendingSearch() {
  latestAction++;
  suggestions.value = [];
}

async function onComplete(event: AutoCompleteCompleteEvent) {
  const query = event.query.trim();
  const action = ++latestAction;
  if (!query) {
    suggestions.value = [];
    return;
  }
  try {
    const res = await fetch(`/api/invoice-recipient?search=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error('search failed');
    const found = (await res.json()) as InvoiceRecipientDto[];
    if (action === latestAction) suggestions.value = found;
  } catch {
    if (action === latestAction) suggestions.value = [];
  }
}

function onSearchInput(value: string | InvoiceRecipientDto | null) {
  // Picking an option also emits the object here; onSelect handles that case
  if (typeof value === 'string' || value === null) {
    search.value = value ?? '';
    invalidatePendingSearch();
  }
}

function onSelect(event: AutoCompleteOptionSelectEvent) {
  const recipient = event.value as InvoiceRecipientDto;
  invalidatePendingSearch();
  search.value = recipient.name;
  emit('update:modelValue', fromRecipientDto(recipient));
}

function startNew() {
  invalidatePendingSearch();
  emit('update:modelValue', { ...emptyRecipient(), name: search.value.trim() });
}

function update(field: FieldKey, value: string) {
  emit('update:modelValue', { ...props.modelValue, [field]: value });
}
</script>

<template>
  <div class="stack">
    <div class="field">
      <label for="recipient-search">Search or create recipient</label>
      <div class="row gap-sm recipient-search">
        <AutoComplete
          :model-value="search"
          input-id="recipient-search"
          data-testid="recipient-search"
          :suggestions="suggestions"
          option-label="name"
          placeholder="Enter name…"
          :delay="250"
          class="recipient-search__input"
          fluid
          @complete="onComplete"
          @option-select="onSelect"
          @update:model-value="onSearchInput"
        >
          <template #option="{ option }">
            {{ option.name }} — {{ option.street }}, {{ option.city }}
          </template>
        </AutoComplete>
        <Button
          label="New recipient"
          icon="pi pi-user-plus"
          severity="secondary"
          outlined
          data-testid="recipient-new"
          @click="startNew"
        />
      </div>
    </div>

    <p v-if="modelValue.id !== null" data-testid="recipient-linked-hint" class="muted hint">
      Linked to an existing recipient. Editing these fields updates that recipient.
    </p>

    <div class="grid-2">
      <div v-for="f in fields" :key="f.key" class="field">
        <label :for="`recipient-${f.key}`">{{ f.label }}</label>
        <InputText
          :id="`recipient-${f.key}`"
          :data-testid="`recipient-${f.key}`"
          :model-value="modelValue[f.key]"
          fluid
          @update:model-value="(value: string | undefined) => update(f.key, value ?? '')"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.recipient-search {
  flex-wrap: nowrap;
}

.recipient-search__input {
  flex: 1;
  min-width: 0;
}

.hint {
  margin: 0;
  font-size: 0.8125rem;
}
</style>
```

Notes for the implementer:

- The old `InstructorFormView.vue` is still the caller until Task 5. The model contract is unchanged, so it keeps working. Its test types into `[data-testid="recipient-name"]`, which is still the input. If that test fails because it mounts without PrimeVue, add `global: withPrimeVue()` to its `setup()` mount. Change nothing else, report it, and include the file in this task's commit. Task 1 may already have done this.
- If vue-tsc rejects the inline typed arrow in `@update:model-value`, move it to a script function `onFieldInput(key: FieldKey, value: string | undefined)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit --workspace=frontend -- RecipientPicker InstructorFormView`
Expected: PASS (the old form's test still passes with the new picker).

- [ ] **Step 5: Full verification and commit**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS.

```bash
git add frontend/src/components/RecipientPicker.vue frontend/src/__tests__/RecipientPicker.test.ts
git commit -m "feat: rebuild recipient picker with PrimeVue AutoComplete

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: InvoiceTextSettings

**Files:**

- Rewrite: `frontend/src/components/InvoiceTextSettings.vue`
- Rewrite: `frontend/src/__tests__/InvoiceTextSettings.test.ts`

**Interfaces:**

- Consumes: `useNotify`, `useConfirmAction`; from `shared`: `DEFAULT_INSTRUCTOR_INVOICE_TEMPLATE`, `INSTRUCTOR_INVOICE_PLACEHOLDERS`, `effectiveInstructorInvoiceTemplate`, `renderInstructorInvoiceText`, `buildInstructorInvoiceTextValues`, `validateInstructorInvoiceTemplate` (all unchanged).
- Produces: `<InvoiceTextSettings :preview-instructor-id="number | null" :weeks-per-month="number" />`, with props unchanged.
- Test ids:
  - Kept: `invoice-template` (the `<textarea>`), `invoice-template-default-hint`, `invoice-template-error`, `save-invoice-template`, `reset-invoice-template`, `invoice-template-preview`, `invoice-template-example-caption`, `placeholder-<key>`.
  - New: `invoice-text-settings` on the root.
  - Removed: `invoice-template-saved` (replaced by a toast).

Behavior (logic unchanged):

- **Load:** `GET /api/instructor/settings`. `invoiceTemplate: null` shows the default text with the hint `Using the default text.`. A failed load shows `Could not load invoice text` inline, keeps the textarea read-only, and disables Save and Reset.
- **Live preview:**
  - It uses the first instructor (`GET /api/instructor/:previewInstructorId`), or the example values with the caption `(example values)`.
  - A blank template previews the default text.
  - A weeks-per-month value that is not a positive number falls back to `DEFAULT_WEEKS_PER_MONTH`.
- **Validation:** an unknown placeholder shows the validation message inline and disables Save.
- **Placeholders:** clicking one inserts `{key}` at the cursor and keeps the focus.
- **Save:** `PUT /api/instructor/settings` `{ invoiceTemplate }`.
  - If the server returns `invoiceTemplate: null` (blank means "default"), show the default text and the hint.
  - Success → toast `Invoice text saved`; failure → toast with the server error, or `Saving failed`.
- **Reset to default:** a **confirm** (`Reset the invoice text to the default?`, header `Reset invoice text`, accept `Reset`), then `PUT { invoiceTemplate: null }` → toast `Invoice text reset to the default`.
- **Layout:** an h3 `Invoice text` with an intro line, then the Textarea (`autoResize`), Save and Reset buttons, and a preview box with a border. Placeholders are text Buttons beside it.

- [ ] **Step 1: Write the failing test**

Replace `frontend/src/__tests__/InvoiceTextSettings.test.ts` with:

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { DEFAULT_INSTRUCTOR_INVOICE_TEMPLATE, type InstructorDto } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import InvoiceTextSettings from '../components/InvoiceTextSettings.vue';
import { withPrimeVue } from './helpers/primeVue';

const { notify, confirmAction } = vi.hoisted(() => ({
  notify: { success: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  confirmAction: vi.fn(),
}));
vi.mock('../composables/useNotify', () => ({ useNotify: () => notify }));
vi.mock('../composables/useConfirmAction', () => ({
  useConfirmAction: () => ({ confirmAction }),
}));

const instructor: InstructorDto = {
  id: 1,
  recipient: {
    id: 7,
    name: 'Bernd Bach',
    street: 'Weg 1',
    city: 'Stadt',
    email: null,
    salutation: null,
  },
  hourlyRateCents: 1200,
  months: 6,
  timeBlocks: [{ weekday: 'MO', start: '08:00', end: '15:30', breaks: [] }],
  calculation: { netMinutesPerWeek: 450, monthlyCents: 29250, totalCents: 175500 },
  createdAt: '2026-10-05T10:00:00Z',
  updatedAt: '2026-10-05T10:00:00Z',
};

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: () => Promise.resolve(body) } as Response;
}

let storedTemplate: string | null;
let fetchMock: ReturnType<typeof vi.fn>;

function mountCard(previewInstructorId: number | null = 1, weeksPerMonth = 3.25) {
  return mount(InvoiceTextSettings, {
    props: { previewInstructorId, weeksPerMonth },
    attachTo: document.body,
    global: withPrimeVue(),
  });
}

function textarea(wrapper: ReturnType<typeof mountCard>) {
  return wrapper.find('[data-testid="invoice-template"]').element as HTMLTextAreaElement;
}

function preview(wrapper: ReturnType<typeof mountCard>) {
  return wrapper.find('[data-testid="invoice-template-preview"]').element.textContent;
}

beforeEach(() => {
  storedTemplate = null;
  fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url === '/api/instructor/settings' && init?.method === 'PUT') {
      const body = JSON.parse(String(init.body)) as { invoiceTemplate: string | null };
      // Like the server: a blank template means "default".
      storedTemplate = body.invoiceTemplate?.trim() ? body.invoiceTemplate : null;
      return Promise.resolve(
        jsonResponse({ weeksPerMonth: 3.25, invoiceTemplate: storedTemplate }),
      );
    }
    if (url === '/api/instructor/settings') {
      return Promise.resolve(
        jsonResponse({ weeksPerMonth: 3.25, invoiceTemplate: storedTemplate }),
      );
    }
    if (url === '/api/instructor/1') return Promise.resolve(jsonResponse(instructor));
    return Promise.resolve(jsonResponse({}, false));
  });
  vi.stubGlobal('fetch', fetchMock);
  confirmAction.mockReset().mockResolvedValue(true);
  Object.values(notify).forEach((fn) => fn.mockReset());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('InvoiceTextSettings', () => {
  it('shows the default text with a hint when none is configured', async () => {
    const wrapper = mountCard();
    await flushPromises();

    expect(textarea(wrapper).tagName).toBe('TEXTAREA');
    expect(textarea(wrapper).value).toBe(DEFAULT_INSTRUCTOR_INVOICE_TEMPLATE);
    expect(wrapper.find('[data-testid="invoice-template-default-hint"]').text()).toBe(
      'Using the default text.',
    );
  });

  it('shows a configured template without the default hint', async () => {
    storedTemplate = 'Miete {name}';
    const wrapper = mountCard();
    await flushPromises();

    expect(textarea(wrapper).value).toBe('Miete {name}');
    expect(wrapper.find('[data-testid="invoice-template-default-hint"]').exists()).toBe(false);
  });

  it('previews the text with the first instructor', async () => {
    const wrapper = mountCard();
    await flushPromises();

    expect(preview(wrapper)).toBe(
      'Raummiete 6 Monate\n7,5 h/Woche × 3,25 Wochen × 6 Monate × 12,00 €',
    );
    expect(wrapper.find('[data-testid="invoice-template-example-caption"]').exists()).toBe(false);
  });

  it('previews with example values when there is no instructor', async () => {
    const wrapper = mountCard(null);
    await flushPromises();

    expect(preview(wrapper)).toBe(
      'Raummiete 6 Monate\n7,5 h/Woche × 3,25 Wochen × 6 Monate × 12,50 €',
    );
    expect(wrapper.find('[data-testid="invoice-template-example-caption"]').exists()).toBe(true);
  });

  it('falls back to the default weeks per month for an invalid value', async () => {
    const wrapper = mountCard(1, 0);
    await flushPromises();
    expect(preview(wrapper)).toContain('3,25 Wochen');
  });

  it('updates the preview while typing', async () => {
    const wrapper = mountCard();
    await flushPromises();

    await wrapper.find('[data-testid="invoice-template"]').setValue('Für {name}\n{zeiten}');

    expect(preview(wrapper)).toBe('Für Bernd Bach\nMo 08:00–15:30');
  });

  it('previews the default text when the textarea is blank', async () => {
    const wrapper = mountCard();
    await flushPromises();

    await wrapper.find('[data-testid="invoice-template"]').setValue('   ');

    expect(preview(wrapper)).toBe(
      'Raummiete 6 Monate\n7,5 h/Woche × 3,25 Wochen × 6 Monate × 12,00 €',
    );
  });

  it('flags unknown placeholders and disables save', async () => {
    const wrapper = mountCard();
    await flushPromises();

    await wrapper.find('[data-testid="invoice-template"]').setValue('Raummiete {monat}');

    expect(wrapper.find('[data-testid="invoice-template-error"]').text()).toBe(
      'Unknown placeholders: {monat}',
    );
    expect(
      wrapper.find('[data-testid="save-invoice-template"]').attributes('disabled'),
    ).toBeDefined();
  });

  it('inserts a placeholder at the cursor', async () => {
    const wrapper = mountCard();
    await flushPromises();
    await wrapper.find('[data-testid="invoice-template"]').setValue('AB');
    textarea(wrapper).setSelectionRange(1, 1);

    const button = wrapper.find('[data-testid="placeholder-name"]');
    expect(button.text()).toBe('{name}');
    await button.trigger('click');
    await flushPromises();

    expect(textarea(wrapper).value).toBe('A{name}B');
    expect(document.activeElement).toBe(textarea(wrapper));
  });

  it('saves the template', async () => {
    const wrapper = mountCard();
    await flushPromises();
    await wrapper.find('[data-testid="invoice-template"]').setValue('Miete {name}');

    await wrapper.find('[data-testid="save-invoice-template"]').trigger('click');
    await flushPromises();

    const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT');
    expect(JSON.parse(String(put?.[1]?.body))).toEqual({ invoiceTemplate: 'Miete {name}' });
    expect(notify.success).toHaveBeenCalledWith('Invoice text saved');
    expect(wrapper.find('[data-testid="invoice-template-default-hint"]').exists()).toBe(false);
  });

  it('shows the default text after saving a blank template', async () => {
    storedTemplate = 'Miete {name}';
    const wrapper = mountCard();
    await flushPromises();
    await wrapper.find('[data-testid="invoice-template"]').setValue('   ');

    await wrapper.find('[data-testid="save-invoice-template"]').trigger('click');
    await flushPromises();

    expect(textarea(wrapper).value).toBe(DEFAULT_INSTRUCTOR_INVOICE_TEMPLATE);
    expect(wrapper.find('[data-testid="invoice-template-default-hint"]').exists()).toBe(true);
  });

  it('resets to the default after confirmation', async () => {
    storedTemplate = 'Miete {name}';
    const wrapper = mountCard();
    await flushPromises();

    await wrapper.find('[data-testid="reset-invoice-template"]').trigger('click');
    await flushPromises();

    expect(confirmAction).toHaveBeenCalledWith(
      expect.objectContaining({ header: 'Reset invoice text', acceptLabel: 'Reset' }),
    );
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT');
    expect(JSON.parse(String(put?.[1]?.body))).toEqual({ invoiceTemplate: null });
    expect(textarea(wrapper).value).toBe(DEFAULT_INSTRUCTOR_INVOICE_TEMPLATE);
    expect(wrapper.find('[data-testid="invoice-template-default-hint"]').exists()).toBe(true);
    expect(notify.success).toHaveBeenCalledWith('Invoice text reset to the default');
  });

  it('does not reset when the confirmation is declined', async () => {
    storedTemplate = 'Miete {name}';
    confirmAction.mockResolvedValue(false);
    const wrapper = mountCard();
    await flushPromises();

    await wrapper.find('[data-testid="reset-invoice-template"]').trigger('click');
    await flushPromises();

    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
    expect(textarea(wrapper).value).toBe('Miete {name}');
  });

  it('toasts the server error when saving fails', async () => {
    const wrapper = mountCard();
    await flushPromises();
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(
        jsonResponse({ error: 'Invoice text must be at most 2000 characters' }, false),
      ),
    );

    await wrapper.find('[data-testid="save-invoice-template"]').trigger('click');
    await flushPromises();

    expect(notify.error).toHaveBeenCalledWith('Invoice text must be at most 2000 characters');
    expect(notify.success).not.toHaveBeenCalled();
  });

  it('disables editing and saving when the settings cannot be loaded', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({}, false)));
    const wrapper = mountCard();
    await flushPromises();

    expect(wrapper.find('[data-testid="invoice-template-error"]').text()).toBe(
      'Could not load invoice text',
    );
    expect(textarea(wrapper).readOnly).toBe(true);
    expect(
      wrapper.find('[data-testid="save-invoice-template"]').attributes('disabled'),
    ).toBeDefined();
    expect(
      wrapper.find('[data-testid="reset-invoice-template"]').attributes('disabled'),
    ).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit --workspace=frontend -- InvoiceTextSettings`
Expected: FAIL (old component uses `window.confirm`, no toasts, no PrimeVue).

- [ ] **Step 3: Rewrite the component**

Replace `frontend/src/components/InvoiceTextSettings.vue` with:

```vue
<script setup lang="ts">
import Button from 'primevue/button';
import Message from 'primevue/message';
import Textarea from 'primevue/textarea';
import {
  buildInstructorInvoiceTextValues,
  DEFAULT_INSTRUCTOR_INVOICE_TEMPLATE,
  DEFAULT_WEEKS_PER_MONTH,
  effectiveInstructorInvoiceTemplate,
  INSTRUCTOR_INVOICE_PLACEHOLDERS,
  type InstructorDto,
  type InstructorRentInputs,
  type InstructorSettingsDto,
  renderInstructorInvoiceText,
  validateInstructorInvoiceTemplate,
} from 'shared';
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useConfirmAction } from '../composables/useConfirmAction';
import { useNotify } from '../composables/useNotify';

const props = defineProps<{
  previewInstructorId: number | null;
  weeksPerMonth: number;
}>();

interface PreviewSource {
  name: string;
  inputs: InstructorRentInputs;
}

const EXAMPLE: PreviewSource = {
  name: 'Anna Alt',
  inputs: {
    hourlyRateCents: 1250,
    months: 6,
    timeBlocks: [
      { weekday: 'MO', start: '14:00', end: '18:00', breaks: [{ start: '16:00', end: '16:30' }] },
      { weekday: 'DO', start: '09:00', end: '13:00', breaks: [] },
    ],
  },
};

const notify = useNotify();
const { confirmAction } = useConfirmAction();

const template = ref(DEFAULT_INSTRUCTOR_INVOICE_TEMPLATE);
const usingDefault = ref(true);
const loaded = ref(false);
const loadError = ref('');
const saving = ref(false);
const textarea = ref<{ $el: HTMLTextAreaElement } | null>(null);
const previewSource = ref<PreviewSource | null>(null);

const validationError = computed(() => validateInstructorInvoiceTemplate(template.value));
const shownError = computed(() => validationError.value ?? loadError.value);
const canSave = computed(() => loaded.value && !validationError.value && !saving.value);

const preview = computed(() => {
  const source = previewSource.value ?? EXAMPLE;
  const weeks =
    Number.isFinite(props.weeksPerMonth) && props.weeksPerMonth > 0
      ? props.weeksPerMonth
      : DEFAULT_WEEKS_PER_MONTH;
  return renderInstructorInvoiceText(
    effectiveInstructorInvoiceTemplate(template.value),
    buildInstructorInvoiceTextValues(source.name, source.inputs, weeks),
  );
});

async function loadTemplate() {
  try {
    const res = await fetch('/api/instructor/settings');
    if (!res.ok) throw new Error('load failed');
    const dto = (await res.json()) as InstructorSettingsDto;
    template.value = dto.invoiceTemplate ?? DEFAULT_INSTRUCTOR_INVOICE_TEMPLATE;
    usingDefault.value = dto.invoiceTemplate === null;
    loaded.value = true;
  } catch {
    loadError.value = 'Could not load invoice text';
  }
}

async function loadPreviewInstructor(id: number | null) {
  previewSource.value = null;
  if (id === null) return;
  try {
    const res = await fetch(`/api/instructor/${id}`);
    if (!res.ok) return;
    const dto = (await res.json()) as InstructorDto;
    previewSource.value = {
      name: dto.recipient.name,
      inputs: {
        hourlyRateCents: dto.hourlyRateCents,
        months: dto.months,
        timeBlocks: dto.timeBlocks,
      },
    };
  } catch {
    // Preview falls back to the example values.
  }
}

watch(() => props.previewInstructorId, loadPreviewInstructor);

async function put(invoiceTemplate: string | null): Promise<InstructorSettingsDto | null> {
  saving.value = true;
  try {
    const res = await fetch('/api/instructor/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceTemplate }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      notify.error(body.error ?? 'Saving failed');
      return null;
    }
    return (await res.json()) as InstructorSettingsDto;
  } catch {
    notify.error('Saving failed');
    return null;
  } finally {
    saving.value = false;
  }
}

async function save() {
  if (!canSave.value) return;
  const dto = await put(template.value);
  if (!dto) return;
  usingDefault.value = dto.invoiceTemplate === null;
  if (dto.invoiceTemplate === null) template.value = DEFAULT_INSTRUCTOR_INVOICE_TEMPLATE;
  notify.success('Invoice text saved');
}

async function resetToDefault() {
  if (!loaded.value) return;
  const confirmed = await confirmAction({
    message: 'Reset the invoice text to the default?',
    header: 'Reset invoice text',
    acceptLabel: 'Reset',
  });
  if (!confirmed) return;
  const dto = await put(null);
  if (!dto) return;
  template.value = DEFAULT_INSTRUCTOR_INVOICE_TEMPLATE;
  usingDefault.value = true;
  notify.success('Invoice text reset to the default');
}

async function insertPlaceholder(key: string) {
  const token = `{${key}}`;
  const el = textarea.value?.$el ?? null;
  const start = el ? el.selectionStart : template.value.length;
  const end = el ? el.selectionEnd : template.value.length;
  template.value = template.value.slice(0, start) + token + template.value.slice(end);
  await nextTick();
  if (el) {
    el.focus();
    el.setSelectionRange(start + token.length, start + token.length);
  }
}

onMounted(async () => {
  await Promise.all([loadTemplate(), loadPreviewInstructor(props.previewInstructorId)]);
});
</script>

<template>
  <section class="stack gap-sm" data-testid="invoice-text-settings">
    <div>
      <h3 class="section-title">Invoice text</h3>
      <p class="muted intro">
        Text of the line item when an invoice is created from an instructor.
      </p>
    </div>

    <div class="text-settings">
      <div class="stack gap-sm">
        <Textarea
          ref="textarea"
          v-model="template"
          data-testid="invoice-template"
          rows="6"
          auto-resize
          aria-label="Invoice text"
          :readonly="!loaded"
          :invalid="!!shownError"
          fluid
        />
        <small v-if="usingDefault" data-testid="invoice-template-default-hint" class="muted"
          >Using the default text.</small
        >
        <Message
          v-if="shownError"
          severity="error"
          size="small"
          variant="simple"
          data-testid="invoice-template-error"
        >
          {{ shownError }}
        </Message>

        <div class="row gap-sm">
          <Button
            label="Save"
            icon="pi pi-check"
            :disabled="!canSave"
            :loading="saving"
            data-testid="save-invoice-template"
            @click="save"
          />
          <Button
            label="Reset to default"
            icon="pi pi-undo"
            severity="secondary"
            outlined
            :disabled="!loaded || saving"
            data-testid="reset-invoice-template"
            @click="resetToDefault"
          />
        </div>

        <div>
          <p class="muted small-label">
            Preview
            <span v-if="!previewSource" data-testid="invoice-template-example-caption"
              >(example values)</span
            >
          </p>
          <div data-testid="invoice-template-preview" class="preview-box" v-text="preview"></div>
        </div>
      </div>

      <div>
        <p class="muted small-label">Placeholders (click to insert)</p>
        <ul class="placeholders">
          <li v-for="p in INSTRUCTOR_INVOICE_PLACEHOLDERS" :key="p.key">
            <Button
              :label="'{' + p.key + '}'"
              text
              size="small"
              class="placeholder-button"
              :data-testid="`placeholder-${p.key}`"
              @click="insertPlaceholder(p.key)"
            />
            <span class="muted"> – {{ p.description }}</span>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<style scoped>
.intro {
  margin: 0.25rem 0 0;
  font-size: 0.875rem;
}

.text-settings {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: 1rem;
}

@media (max-width: 767px) {
  .text-settings {
    grid-template-columns: 1fr;
  }
}

.small-label {
  margin: 0 0 0.25rem;
  font-size: 0.8125rem;
}

.preview-box {
  white-space: pre-line;
  padding: 0.75rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: 0.5rem;
  font-size: 0.875rem;
}

.placeholders {
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 0.8125rem;
}

.placeholder-button {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
</style>
```

Notes for the implementer:

- PrimeVue `Textarea`'s root element is the `<textarea>`, so `textarea.value.$el` is the element (selection range, focus). If vue-tsc rejects the `{ $el: HTMLTextAreaElement }` ref type, use `InstanceType<typeof Textarea>` and cast `$el`.
- The old `InstructorView.vue` still renders this component until Task 4; it has no `window.confirm` dependency left for it, and its test only checks that `[data-testid="invoice-template"]` exists. That test mounts without `withPrimeVue`: if it now fails with "no PrimeVue config" (Button/Textarea need it), add `global: withPrimeVue({ stubs: … })` to its mount helper. This is a mechanical fix, so report it. Task 4 rewrites that test anyway.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit --workspace=frontend -- InvoiceTextSettings InstructorView`
Expected: PASS.

- [ ] **Step 5: Full verification and commit**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS.

```bash
git add frontend/src/components/InvoiceTextSettings.vue frontend/src/__tests__/InvoiceTextSettings.test.ts
git commit -m "feat: rebuild instructor invoice text settings with PrimeVue and toasts

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

(If you had to touch `InstructorView.test.ts` per the note, add it to the same commit.)

---

### Task 4: Instructor list with calculation settings

**Files:**

- Rewrite: `frontend/src/views/InstructorView.vue`
- Rewrite: `frontend/src/__tests__/InstructorView.test.ts`

**Interfaces:**

- Consumes: `InvoiceTextSettings` (Task 3); `useTableFilters`, `isControlClick`, `TABLE_DEFAULTS`, `globalFilter`, `AMOUNT_RANGE`, `AmountRangeFilter`, `PageHeader`, `useNotify`, `useAppStore` (`invoiceTemplateAvailable`, `checkTemplates`); `formatCents`, `formatHours`; from `shared`: `DEFAULT_WEEKS_PER_MONTH`, `validateWeeksPerMonth`.
- Produces (test hooks):
  - Rows have class `instructor-row`.
  - `data-testid`s: `new-instructor`, `calculation-settings` (Panel root), `weeks-per-month` (InputNumber root; input id `weeks-per-month`), `weeks-error`, `settings-load-error`, `save-settings`, `global-search`, `clear-filters`, `create-invoice-<id>`, `footer-total`.
  - Script bindings `filters`, `weeksPerMonth`.

Behavior:

- **Header:** title `Instructor Rent`; action `New instructor` → `/instructor/new`.
- **Calculation settings:** a `Panel` (toggleable, **collapsed by default**) with the header `Calculation settings (<saved weeks> weeks/month)`, e.g. `Calculation settings (3,25 weeks/month)`. It contains:
  - "Weeks per month": `InputNumber`, `locale="de-DE"`, up to 2 decimals.
    - It shows `validateWeeksPerMonth` errors live under the field (`weeks-error`).
    - Save is disabled while there is an error or the setting failed to load.
    - Save → `PUT /api/instructor/settings` `{ weeksPerMonth }` → toast `Weeks per month saved`, the panel header updates, and the list reloads. A failure → toast with the server error, or `Saving failed`.
    - A failed load shows `Could not load settings` inline (`settings-load-error`) and keeps Save disabled.
  - The `InvoiceTextSettings` editor, with the first instructor as preview source and the current weeks-per-month value (`0` when empty, so the component falls back to its default).
- **Table:** `DataTable` over `GET /api/instructor` (a failure shows the toast `Error loading instructors`; empty text `No instructors yet.`).
  - Global search over the name.
  - Column filters: Name (text) and Total (amount range in euros, field `calculation.totalCents`).
  - All value columns are sortable. Columns:
    - Name (link to `/instructor/:id`), Hourly rate (net), h/week, Per month (net), Months, Total (net).
    - A `Create invoice` button: disabled with the title `No active invoice template` when `invoiceTemplateAvailable === false`; navigates to `/invoice/new?fromInstructor=:id`.
  - The footer row shows `Sum` and the total of the rows **currently shown** (`footer-total`). It is updated from the DataTable `value-change` event, which fires after filtering.
  - A row click opens `/instructor/:id`, except clicks on controls.

- [ ] **Step 1: Write the failing test**

Replace `frontend/src/__tests__/InstructorView.test.ts` with:

```ts
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import type { DataTableFilterMeta } from 'primevue/datatable';
import InputNumber from 'primevue/inputnumber';
import type { InstructorListItemDto } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRouter } from 'vue-router';
import { useAppStore } from '../stores/app';
import InstructorView from '../views/InstructorView.vue';
import { withPrimeVue } from './helpers/primeVue';

const { notify, confirmAction } = vi.hoisted(() => ({
  notify: { success: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  confirmAction: vi.fn(),
}));

vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRouter: vi.fn(),
}));
vi.mock('../composables/useNotify', () => ({ useNotify: () => notify }));
vi.mock('../composables/useConfirmAction', () => ({
  useConfirmAction: () => ({ confirmAction }),
}));

interface ViewVM {
  filters: DataTableFilterMeta;
}

const instructors: InstructorListItemDto[] = [
  {
    id: 1,
    name: 'Anna Alt',
    hourlyRateCents: 1200,
    months: 6,
    calculation: { netMinutesPerWeek: 450, monthlyCents: 29250, totalCents: 175500 },
  },
  {
    id: 2,
    name: 'Bernd Bach',
    hourlyRateCents: 1000,
    months: 1,
    calculation: { netMinutesPerWeek: 60, monthlyCents: 3250, totalCents: 3250 },
  },
];

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: () => Promise.resolve(body) } as Response;
}

type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;
let fetchMock: ReturnType<typeof vi.fn>;
const push = vi.fn();

const defaultFetch: FetchImpl = (url, init) => {
  if (url === '/api/instructor') return Promise.resolve(jsonResponse(instructors));
  if (url === '/api/instructor/settings' && init?.method === 'PUT') {
    return Promise.resolve(
      jsonResponse({ invoiceTemplate: null, ...JSON.parse(String(init.body)) }),
    );
  }
  if (url === '/api/instructor/settings') {
    return Promise.resolve(jsonResponse({ weeksPerMonth: 3.25, invoiceTemplate: null }));
  }
  if (url === '/api/instructor/1')
    return Promise.resolve(
      jsonResponse({
        ...instructors[0],
        recipient: { id: 7, name: 'Anna Alt', street: '', city: '', email: null, salutation: null },
        timeBlocks: [],
      }),
    );
  return Promise.resolve(jsonResponse({}, false));
};

async function mountView() {
  const wrapper = mount(InstructorView, {
    attachTo: document.body,
    global: withPrimeVue({ stubs: { RouterLink: { template: '<a><slot /></a>' } } }),
  });
  await flushPromises();
  return wrapper;
}

function rows(wrapper: VueWrapper) {
  return wrapper.findAll('.instructor-row');
}

function weeksInput(wrapper: VueWrapper) {
  return wrapper
    .findAllComponents(InputNumber)
    .find((c) => c.attributes('data-testid') === 'weeks-per-month')!;
}

async function setWeeks(wrapper: VueWrapper, value: number | null) {
  weeksInput(wrapper).vm.$emit('update:modelValue', value);
  await flushPromises();
}

function puts() {
  return fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT');
}

beforeEach(() => {
  fetchMock = vi.fn(defaultFetch);
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(useRouter).mockReturnValue({ push } as unknown as ReturnType<typeof useRouter>);
  push.mockReset();
  confirmAction.mockReset().mockResolvedValue(true);
  Object.values(notify).forEach((fn) => fn.mockReset());
  setActivePinia(createPinia());
  useAppStore().invoiceTemplateAvailable = true;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('InstructorView', () => {
  it('shows the heading and the new-instructor action', async () => {
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="page-title"]').text()).toBe('Instructor Rent');
    await wrapper.find('[data-testid="new-instructor"]').trigger('click');
    expect(push).toHaveBeenCalledWith('/instructor/new');
  });

  it('renders one row per instructor and the sum of totals', async () => {
    const wrapper = await mountView();

    expect(rows(wrapper)).toHaveLength(2);
    expect(rows(wrapper)[0].text()).toContain('Anna Alt');
    expect(rows(wrapper)[0].text()).toContain('12,00');
    expect(rows(wrapper)[0].text()).toContain('7,5');
    expect(rows(wrapper)[0].text()).toContain('292,50');
    expect(rows(wrapper)[0].text()).toContain('1.755,00');
    expect(wrapper.find('[data-testid="footer-total"]').text()).toContain('1.787,50');
  });

  it('sums only the rows left by the filters', async () => {
    const wrapper = await mountView();

    await wrapper.find('[data-testid="global-search"]').setValue('bach');
    await flushPromises();
    expect(rows(wrapper)).toHaveLength(1);
    expect(wrapper.find('[data-testid="footer-total"]').text()).toContain('32,50');

    await wrapper.find('[data-testid="clear-filters"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="footer-total"]').text()).toContain('1.787,50');
  });

  it('filters by total amount in euros', async () => {
    const wrapper = await mountView();
    const vm = wrapper.vm as unknown as ViewVM;
    const current = vm.filters['calculation.totalCents'] as { matchMode: string };
    vm.filters = { ...vm.filters, 'calculation.totalCents': { ...current, value: [100, null] } };
    await flushPromises();

    expect(rows(wrapper)).toHaveLength(1);
    expect(rows(wrapper)[0].text()).toContain('Anna Alt');
  });

  it('keeps the calculation settings in a collapsed panel with the saved value in its header', async () => {
    const wrapper = await mountView();
    const panel = wrapper.find('[data-testid="calculation-settings"]');
    expect(panel.text()).toContain('Calculation settings (3,25 weeks/month)');
    expect(panel.find('[data-testid="invoice-template"]').exists()).toBe(true);
    expect(weeksInput(wrapper).props('modelValue')).toBe(3.25);
  });

  it('saves weeks per month, updates the header and reloads the list', async () => {
    const wrapper = await mountView();
    const listCallsBefore = fetchMock.mock.calls.filter(([u]) => u === '/api/instructor').length;

    await setWeeks(wrapper, 4);
    await wrapper.find('[data-testid="save-settings"]').trigger('click');
    await flushPromises();

    expect(JSON.parse(String(puts()[0][1].body))).toEqual({ weeksPerMonth: 4 });
    expect(notify.success).toHaveBeenCalledWith('Weeks per month saved');
    expect(wrapper.find('[data-testid="calculation-settings"]').text()).toContain(
      'Calculation settings (4 weeks/month)',
    );
    const listCallsAfter = fetchMock.mock.calls.filter(([u]) => u === '/api/instructor').length;
    expect(listCallsAfter).toBe(listCallsBefore + 1);
  });

  it.each([
    [0, 'Weeks per month must be greater than 0'],
    [null, 'Weeks per month must be greater than 0'],
  ])('shows an error and does not save weeks per month of %j', async (value, message) => {
    const wrapper = await mountView();

    await setWeeks(wrapper, value);
    expect(wrapper.find('[data-testid="weeks-error"]').text()).toBe(message);
    expect(wrapper.find('[data-testid="save-settings"]').attributes('disabled')).toBeDefined();

    await wrapper.find('[data-testid="save-settings"]').trigger('click');
    await flushPromises();
    expect(puts()).toHaveLength(0);
  });

  it.each([
    ['responds with an error', () => Promise.resolve(jsonResponse({}, false))],
    ['is unreachable', () => Promise.reject(new Error('offline'))],
  ])('disables saving when loading the setting %s', async (_label, settingsReply) => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      url === '/api/instructor/settings' && !init?.method
        ? settingsReply()
        : defaultFetch(url, init),
    );
    const wrapper = await mountView();

    expect(wrapper.find('[data-testid="settings-load-error"]').text()).toBe(
      'Could not load settings',
    );
    expect(wrapper.find('[data-testid="save-settings"]').attributes('disabled')).toBeDefined();
  });

  it('toasts the error when saving the setting fails', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      init?.method === 'PUT' ? Promise.reject(new Error('offline')) : defaultFetch(url, init),
    );
    const wrapper = await mountView();

    await setWeeks(wrapper, 4);
    await wrapper.find('[data-testid="save-settings"]').trigger('click');
    await flushPromises();

    expect(notify.error).toHaveBeenCalledWith('Saving failed');
    expect(wrapper.find('[data-testid="calculation-settings"]').text()).toContain(
      '(3,25 weeks/month)',
    );
  });

  it('navigates to a prefilled invoice without opening the instructor', async () => {
    const wrapper = await mountView();
    await wrapper.find('[data-testid="create-invoice-1"]').trigger('click');
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/invoice/new?fromInstructor=1');
  });

  it('disables invoice creation without an invoice template', async () => {
    useAppStore().invoiceTemplateAvailable = false;
    const wrapper = await mountView();
    const button = wrapper.find('[data-testid="create-invoice-1"]');
    expect(button.attributes('disabled')).toBeDefined();
    expect(button.attributes('title')).toBe('No active invoice template');
  });

  it('opens the instructor on row click', async () => {
    const wrapper = await mountView();
    await rows(wrapper)[1].trigger('click');
    expect(push).toHaveBeenCalledWith('/instructor/2');
  });

  it('uses the first instructor as preview source for the invoice text', async () => {
    await mountView();
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/instructor/1')).toBe(true);
  });

  it('reports a load error', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      url === '/api/instructor' ? Promise.reject(new Error('offline')) : defaultFetch(url, init),
    );
    await mountView();
    expect(notify.error).toHaveBeenCalledWith('Error loading instructors');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit --workspace=frontend -- InstructorView`
Expected: FAIL.

- [ ] **Step 3: Rewrite the view**

Replace `frontend/src/views/InstructorView.vue` with:

```vue
<script setup lang="ts">
import { FilterMatchMode } from '@primevue/core/api';
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable, {
  type DataTableFilterMeta,
  type DataTableRowClickEvent,
} from 'primevue/datatable';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Panel from 'primevue/panel';
import {
  DEFAULT_WEEKS_PER_MONTH,
  type InstructorListItemDto,
  type InstructorSettingsDto,
  validateWeeksPerMonth,
} from 'shared';
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import InvoiceTextSettings from '../components/InvoiceTextSettings.vue';
import AmountRangeFilter from '../components/ui/AmountRangeFilter.vue';
import PageHeader from '../components/ui/PageHeader.vue';
import { useNotify } from '../composables/useNotify';
import { useTableFilters } from '../composables/useTableFilters';
import { useAppStore } from '../stores/app';
import { formatCents, formatHours } from '../utils/format';
import { globalFilter, TABLE_DEFAULTS } from '../utils/tableDefaults';
import { AMOUNT_RANGE } from '../utils/tableFilters';
import { isControlClick } from '../utils/tableRowClick';

const router = useRouter();
const store = useAppStore();
const notify = useNotify();

// ── Instructors ─────────────────────────────
const instructors = ref<InstructorListItemDto[]>([]);
/** Rows left after filtering; the footer sum follows them. */
const visibleInstructors = ref<InstructorListItemDto[]>([]);
const loading = ref(false);

watch(instructors, (all) => {
  visibleInstructors.value = all;
});

function defaultFilters(): DataTableFilterMeta {
  return {
    ...globalFilter(),
    name: { value: null, matchMode: FilterMatchMode.CONTAINS },
    'calculation.totalCents': { value: null, matchMode: AMOUNT_RANGE },
  };
}

const { filters, globalSearch, clearFilters } = useTableFilters(defaultFilters);

const visibleTotalCents = computed(() =>
  visibleInstructors.value.reduce((sum, i) => sum + i.calculation.totalCents, 0),
);

function onValueChange(rows: InstructorListItemDto[]) {
  visibleInstructors.value = rows;
}

async function loadInstructors() {
  loading.value = true;
  try {
    const res = await fetch('/api/instructor');
    if (!res.ok) throw new Error('load failed');
    instructors.value = await res.json();
  } catch {
    notify.error('Error loading instructors');
  } finally {
    loading.value = false;
  }
}

function onRowClick(event: DataTableRowClickEvent<InstructorListItemDto>) {
  if (isControlClick(event.originalEvent)) return;
  router.push(`/instructor/${event.data.id}`);
}

// ── Calculation settings ─────────────────────────────
const weeksPerMonth = ref<number | null>(DEFAULT_WEEKS_PER_MONTH);
const savedWeeksPerMonth = ref(DEFAULT_WEEKS_PER_MONTH);
const settingsLoaded = ref(false);
const settingsLoadError = ref('');
const savingSettings = ref(false);

const weeksError = computed(() => validateWeeksPerMonth(weeksPerMonth.value ?? Number.NaN));
const canSaveSettings = computed(
  () => settingsLoaded.value && !weeksError.value && !savingSettings.value,
);

const weeksFormat = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });
const panelHeader = computed(
  () => `Calculation settings (${weeksFormat.format(savedWeeksPerMonth.value)} weeks/month)`,
);

async function loadSettings() {
  try {
    const res = await fetch('/api/instructor/settings');
    if (!res.ok) throw new Error('load failed');
    const value = ((await res.json()) as InstructorSettingsDto).weeksPerMonth;
    weeksPerMonth.value = value;
    savedWeeksPerMonth.value = value;
    settingsLoaded.value = true;
  } catch {
    settingsLoadError.value = 'Could not load settings';
  }
}

async function saveSettings() {
  if (!canSaveSettings.value || weeksPerMonth.value === null) return;
  const value = weeksPerMonth.value;
  savingSettings.value = true;
  try {
    const res = await fetch('/api/instructor/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weeksPerMonth: value }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      notify.error(body.error ?? 'Saving failed');
      return;
    }
  } catch {
    notify.error('Saving failed');
    return;
  } finally {
    savingSettings.value = false;
  }
  savedWeeksPerMonth.value = value;
  notify.success('Weeks per month saved');
  await loadInstructors();
}

onMounted(async () => {
  await Promise.all([
    loadSettings(),
    loadInstructors(),
    store.invoiceTemplateAvailable === null ? store.checkTemplates() : Promise.resolve(),
  ]);
});
</script>

<template>
  <div class="page">
    <PageHeader title="Instructor Rent">
      <template #actions>
        <Button
          label="New instructor"
          icon="pi pi-plus"
          data-testid="new-instructor"
          @click="router.push('/instructor/new')"
        />
      </template>
    </PageHeader>

    <div class="stack">
      <Panel :header="panelHeader" toggleable collapsed data-testid="calculation-settings">
        <div class="stack gap-lg">
          <div class="stack gap-sm">
            <div class="row gap-sm weeks-row">
              <div class="field">
                <label for="weeks-per-month">Weeks per month</label>
                <InputNumber
                  v-model="weeksPerMonth"
                  input-id="weeks-per-month"
                  data-testid="weeks-per-month"
                  locale="de-DE"
                  :min-fraction-digits="0"
                  :max-fraction-digits="2"
                  :invalid="!!weeksError"
                  class="weeks-input"
                />
              </div>
              <Button
                label="Save"
                icon="pi pi-check"
                severity="secondary"
                outlined
                :disabled="!canSaveSettings"
                :loading="savingSettings"
                data-testid="save-settings"
                @click="saveSettings"
              />
            </div>
            <Message
              v-if="settingsLoadError"
              severity="error"
              size="small"
              data-testid="settings-load-error"
            >
              {{ settingsLoadError }}
            </Message>
            <Message
              v-else-if="weeksError"
              severity="error"
              size="small"
              variant="simple"
              data-testid="weeks-error"
            >
              {{ weeksError }}
            </Message>
          </div>

          <InvoiceTextSettings
            :preview-instructor-id="instructors[0]?.id ?? null"
            :weeks-per-month="weeksPerMonth ?? 0"
          />
        </div>
      </Panel>

      <DataTable
        v-model:filters="filters"
        :value="instructors"
        data-key="id"
        v-bind="TABLE_DEFAULTS"
        :global-filter-fields="['name']"
        :loading="loading"
        row-hover
        :row-class="() => 'instructor-row'"
        @row-click="onRowClick"
        @value-change="onValueChange"
      >
        <template #header>
          <div class="row row--between">
            <IconField>
              <InputIcon class="pi pi-search" />
              <InputText
                v-model="globalSearch"
                placeholder="Search by name…"
                aria-label="Search instructors"
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
        <template #empty>No instructors yet.</template>

        <Column field="name" header="Name" sortable :show-filter-menu="false">
          <template #body="{ data }">
            <RouterLink :to="`/instructor/${data.id}`">{{ data.name }}</RouterLink>
          </template>
          <template #filter="{ filterModel, filterCallback }">
            <InputText
              v-model="filterModel.value"
              size="small"
              placeholder="Name"
              fluid
              aria-label="Filter by name"
              @input="filterCallback()"
            />
          </template>
          <template #footer><span class="strong">Sum</span></template>
        </Column>
        <Column field="hourlyRateCents" header="Hourly rate (net)" sortable class="col-amount">
          <template #body="{ data }">{{ formatCents(data.hourlyRateCents) }}</template>
        </Column>
        <Column field="calculation.netMinutesPerWeek" header="h/week" sortable class="col-amount">
          <template #body="{ data }">{{
            formatHours(data.calculation.netMinutesPerWeek)
          }}</template>
        </Column>
        <Column
          field="calculation.monthlyCents"
          header="Per month (net)"
          sortable
          class="col-amount"
        >
          <template #body="{ data }">{{ formatCents(data.calculation.monthlyCents) }}</template>
        </Column>
        <Column field="months" header="Months" sortable class="col-amount" />
        <Column
          field="calculation.totalCents"
          header="Total (net)"
          sortable
          :show-filter-menu="false"
          class="col-amount"
        >
          <template #body="{ data }">
            <span class="strong">{{ formatCents(data.calculation.totalCents) }}</span>
          </template>
          <template #filter="{ filterModel, filterCallback }">
            <AmountRangeFilter
              :model-value="filterModel.value"
              label="Total"
              @update:model-value="
                (value) => {
                  filterModel.value = value;
                  filterCallback();
                }
              "
            />
          </template>
          <template #footer>
            <span data-testid="footer-total" class="strong">{{
              formatCents(visibleTotalCents)
            }}</span>
          </template>
        </Column>
        <Column header-style="width: 10rem">
          <template #body="{ data }">
            <Button
              label="Create invoice"
              icon="pi pi-file"
              size="small"
              text
              :disabled="store.invoiceTemplateAvailable === false"
              :title="store.invoiceTemplateAvailable === false ? 'No active invoice template' : ''"
              :data-testid="`create-invoice-${data.id}`"
              @click.stop="router.push(`/invoice/new?fromInstructor=${data.id}`)"
            />
          </template>
        </Column>
      </DataTable>
    </div>
  </div>
</template>

<style scoped>
.weeks-row {
  align-items: flex-end;
}

.weeks-input :deep(input) {
  width: 8rem;
}

.strong {
  font-weight: 600;
}

:deep(.instructor-row) {
  cursor: pointer;
}

:deep(.col-amount) {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
```

Notes for the implementer:

- `Panel` renders its content with `v-show`, so the collapsed panel's fields exist in the DOM (the tests rely on it).
- DataTable emits `value-change` from its `filter()` step (see `node_modules/primevue/datatable/DataTable.vue`). If the "sums only the rows left by the filters" test shows the footer not following the filter in jsdom, inspect when `value-change` fires and report it. Do not compute the filtered rows by hand.
- PrimeVue resolves dotted field names (`calculation.totalCents`) for sorting and filtering.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit --workspace=frontend -- InstructorView`
Expected: PASS.

- [ ] **Step 5: Full verification and commit**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS.

```bash
git add frontend/src/views/InstructorView.vue frontend/src/__tests__/InstructorView.test.ts
git commit -m "feat: rebuild instructor list with calculation settings panel and filtered sum

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Instructor form

**Files:**

- Rewrite: `frontend/src/views/InstructorFormView.vue`
- Rewrite: `frontend/src/__tests__/InstructorFormView.test.ts`

**Interfaces:**

- Consumes: `RecipientPicker` (Task 2), `WeeklySchedule` (Task 1); `PageHeader`, `FormSection`, `useNotify`, `useConfirmAction`, `useAppStore`; `formatCents`, `formatHours`; `recipientForm` helpers; from `shared`: `calculateInstructorRent`, `validateInstructorRent`, `DEFAULT_WEEKS_PER_MONTH`.
- Produces (test hooks):
  - Script bindings `recipient`, `hourlyRateCents`, `months`, `timeBlocks`.
  - `data-testid`s: `hourly-rate` and `months` (InputNumber roots; input ids `hourly-rate` / `months`), `hourly-rate-error`, `months-error`, `recipient-error`, `summary-hours`, `summary-monthly`, `summary-total`, `save`, `create-invoice`, `delete`, `load-error`.

Behavior (rules unchanged):

- **Mode:** `params.id` → edit (`GET /api/instructor/:id`; 404 → `Instructor not found`), otherwise new.
- **Weeks per month** comes from `GET /api/instructor/settings` (default `DEFAULT_WEEKS_PER_MONTH`).
- **Validation and summary:**
  - `validateInstructorRent({ hourlyRateCents, months, timeBlocks })` drives the field errors (`hourlyRateCents`, `months`) and the per-block issues (passed to `WeeklySchedule`).
  - `Recipient name is required` shows under the recipient while the name is empty.
  - The live summary (`calculateInstructorRent`) shows hours/week, per month and total, or `—` while invalid.
  - The summary title is `Summary (net, 3,25 weeks/month)`.
- **Save** is the submit button (`type="submit"`, so Enter saves), disabled while invalid or saving.
  - Body: `{ recipientId? (when linked), recipientData: toRecipientData(recipient), hourlyRateCents, months, timeBlocks }`.
  - New → `POST /api/instructor`; edit → `PUT /api/instructor/:id`.
  - Success → toast `Instructor saved`, then `/instructor`. Failure → toast with the server error, or `Saving failed`.
- **Create invoice** (edit only): disabled with the title `Save your changes first` while the form differs from the loaded state, or `No active invoice template` when there is no invoice template. Otherwise it opens `/invoice/new?fromInstructor=:id`.
- **Delete** (edit only): a danger **confirm** (`Delete this instructor? The recipient is kept.`, header `Delete instructor`, accept `Delete`), then `DELETE /api/instructor/:id` → toast `Instructor deleted`, then `/instructor`. Failure → toast `Deleting failed`.

Changes:

- **Inputs:** the hourly rate is an `InputNumber` currency field (euros ↔ cents; `0` shows as empty); months is an `InputNumber` (integer, min 1, empty → 0, so the months rule reports it).
- **Load failures:** a failed instructor load (404 or network) shows `load-error` and **blocks saving** (Save disabled; `save()` returns early). A network failure while loading shows `Network error while loading`.
- **Feedback:** server errors are toasts (the old inline `form-error` is removed). The header has a Back button to `/instructor`.

- [ ] **Step 1: Write the failing test**

Replace `frontend/src/__tests__/InstructorFormView.test.ts` with:

```ts
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import InputNumber from 'primevue/inputnumber';
import type { InstructorDto } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRoute, useRouter } from 'vue-router';
import RecipientPicker from '../components/RecipientPicker.vue';
import InstructorFormView from '../views/InstructorFormView.vue';
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

const existing: InstructorDto = {
  id: 5,
  recipient: {
    id: 7,
    name: 'Anna Alt',
    street: 'Hauptstr. 1',
    city: '12345 Berlin',
    email: null,
    salutation: null,
  },
  hourlyRateCents: 1200,
  months: 6,
  timeBlocks: [{ weekday: 'MO', start: '08:00', end: '15:30', breaks: [] }],
  calculation: { netMinutesPerWeek: 450, monthlyCents: 29250, totalCents: 175500 },
  createdAt: '2026-10-05T10:00:00Z',
  updatedAt: '2026-10-05T10:00:00Z',
};

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: () => Promise.resolve(body) } as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;
let templates: { type: string }[];

const defaultFetch = (url: string, init?: RequestInit): Promise<Response> => {
  if (url === '/api/instructor/settings') {
    return Promise.resolve(jsonResponse({ weeksPerMonth: 3.25, invoiceTemplate: null }));
  }
  if (url === '/api/instructor/5' && !init?.method) return Promise.resolve(jsonResponse(existing));
  if (url === '/api/instructor' && init?.method === 'POST') {
    return Promise.resolve(jsonResponse({ id: 9 }));
  }
  if (url === '/api/instructor/5' && init?.method === 'PUT') {
    return Promise.resolve(jsonResponse({ id: 5 }));
  }
  if (url === '/api/instructor/5' && init?.method === 'DELETE') {
    return Promise.resolve({ ok: true, status: 204 } as Response);
  }
  if (url === '/api/templates') return Promise.resolve(jsonResponse(templates));
  return Promise.resolve(jsonResponse({}, false));
};

async function setup(params: Record<string, string> = {}) {
  vi.mocked(useRoute).mockReturnValue({ params, query: {} } as unknown as ReturnType<
    typeof useRoute
  >);
  const wrapper = mount(InstructorFormView, { attachTo: document.body, global: withPrimeVue() });
  await flushPromises();
  return wrapper;
}

function numberInput(wrapper: VueWrapper, testid: 'hourly-rate' | 'months') {
  return wrapper
    .findAllComponents(InputNumber)
    .find((c) => c.attributes('data-testid') === testid)!;
}

async function setNumber(
  wrapper: VueWrapper,
  testid: 'hourly-rate' | 'months',
  value: number | null,
) {
  numberInput(wrapper, testid).vm.$emit('update:modelValue', value);
  await flushPromises();
}

async function addMondayBlock(wrapper: VueWrapper, start: string, end: string) {
  await wrapper.find('[data-testid="add-block-MO"]').trigger('click');
  const blocks = wrapper.find('[data-testid="day-MO"]').findAll('[data-testid="block"]');
  const last = blocks[blocks.length - 1];
  await last.find('[data-testid="block-start"]').setValue(start);
  await last.find('[data-testid="block-end"]').setValue(end);
}

async function fillValidNew(wrapper: VueWrapper) {
  await wrapper.find('[data-testid="recipient-name"]').setValue('Anna Alt');
  await wrapper.find('[data-testid="recipient-street"]').setValue('Hauptstr. 1');
  await wrapper.find('[data-testid="recipient-city"]').setValue('12345 Berlin');
  await setNumber(wrapper, 'hourly-rate', 12.5);
  await setNumber(wrapper, 'months', 6);
  await addMondayBlock(wrapper, '08:00', '12:00');
}

function requestsWith(method: string) {
  return fetchMock.mock.calls.filter(([, init]) => init?.method === method);
}

beforeEach(() => {
  templates = [{ type: 'RECHNUNG' }];
  fetchMock = vi.fn(defaultFetch);
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(useRouter).mockReturnValue({ push: mockPush } as unknown as ReturnType<
    typeof useRouter
  >);
  mockPush.mockReset();
  confirmAction.mockReset().mockResolvedValue(true);
  Object.values(notify).forEach((fn) => fn.mockReset());
  setActivePinia(createPinia());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('InstructorFormView', () => {
  it('titles the new form and shows the required-field errors', async () => {
    const wrapper = await setup();
    expect(wrapper.find('[data-testid="page-title"]').text()).toBe('New instructor');
    expect(wrapper.find('[data-testid="recipient-error"]').text()).toBe(
      'Recipient name is required',
    );
    expect(wrapper.find('[data-testid="hourly-rate-error"]').text()).toBe(
      'Hourly rate must be greater than 0',
    );
    expect(wrapper.find('[data-testid="save"]').attributes('disabled')).toBeDefined();
  });

  it('updates the live summary while editing', async () => {
    const wrapper = await setup();
    expect(wrapper.text()).toContain('Summary (net, 3,25 weeks/month)');
    expect(wrapper.find('[data-testid="summary-total"]').text()).toBe('—');

    await setNumber(wrapper, 'hourly-rate', 12);
    await setNumber(wrapper, 'months', 6);
    await addMondayBlock(wrapper, '08:00', '15:30');

    expect(wrapper.find('[data-testid="summary-hours"]').text()).toContain('7,5');
    expect(wrapper.find('[data-testid="summary-monthly"]').text()).toContain('292,50');
    expect(wrapper.find('[data-testid="summary-total"]').text()).toContain('1.755,00');
  });

  it('stores a euro rate with decimals as cents', async () => {
    const wrapper = await setup();
    await setNumber(wrapper, 'hourly-rate', 12.5);
    expect((wrapper.vm as unknown as { hourlyRateCents: number }).hourlyRateCents).toBe(1250);
    await setNumber(wrapper, 'hourly-rate', null);
    expect((wrapper.vm as unknown as { hourlyRateCents: number }).hourlyRateCents).toBe(0);
  });

  it('reports months below 1', async () => {
    const wrapper = await setup();
    await setNumber(wrapper, 'months', null);
    expect(wrapper.find('[data-testid="months-error"]').text()).toBe(
      'Months must be a whole number of at least 1',
    );
  });

  it('shows an overlap error and disables save', async () => {
    const wrapper = await setup();
    await wrapper.find('[data-testid="recipient-name"]').setValue('Anna Alt');
    await setNumber(wrapper, 'hourly-rate', 12);
    await addMondayBlock(wrapper, '08:00', '12:00');
    await addMondayBlock(wrapper, '11:00', '13:00');

    expect(wrapper.text()).toContain('Time blocks on the same day must not overlap');
    expect(wrapper.find('[data-testid="save"]').attributes('disabled')).toBeDefined();
  });

  it('Save is the submit button of the form so Enter saves', async () => {
    const wrapper = await setup();
    expect(wrapper.find('[data-testid="save"]').attributes('type')).toBe('submit');
  });

  it('posts the expected body for a new instructor and returns to the list', async () => {
    const wrapper = await setup();
    await fillValidNew(wrapper);

    await wrapper.find('form').trigger('submit');
    await flushPromises();

    const [post] = requestsWith('POST');
    expect(post[0]).toBe('/api/instructor');
    expect(JSON.parse(String(post[1].body))).toEqual({
      recipientData: {
        name: 'Anna Alt',
        street: 'Hauptstr. 1',
        city: '12345 Berlin',
        email: null,
        salutation: null,
      },
      hourlyRateCents: 1250,
      months: 6,
      timeBlocks: [{ weekday: 'MO', start: '08:00', end: '12:00', breaks: [] }],
    });
    expect(notify.success).toHaveBeenCalledWith('Instructor saved');
    expect(mockPush).toHaveBeenCalledWith('/instructor');
  });

  it('keeps the linked recipient id and sends the edited fields', async () => {
    const wrapper = await setup();
    wrapper.findComponent(RecipientPicker).vm.$emit('update:modelValue', {
      id: 7,
      name: 'Anna Alt',
      street: 'Hauptstr. 1',
      city: '12345 Berlin',
      email: '',
      salutation: '',
    });
    await flushPromises();
    await wrapper.find('[data-testid="recipient-street"]').setValue('Neue Str. 2');
    await setNumber(wrapper, 'hourly-rate', 12);
    await addMondayBlock(wrapper, '08:00', '12:00');

    await wrapper.find('form').trigger('submit');
    await flushPromises();

    const body = JSON.parse(String(requestsWith('POST')[0][1].body));
    expect(body.recipientId).toBe(7);
    expect(body.recipientData).toMatchObject({ name: 'Anna Alt', street: 'Neue Str. 2' });
  });

  it('toasts the server error when saving fails', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      init?.method === 'POST'
        ? Promise.resolve(jsonResponse({ error: 'Recipient already has an instructor' }, false))
        : defaultFetch(url, init),
    );
    const wrapper = await setup();
    await fillValidNew(wrapper);

    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(notify.error).toHaveBeenCalledWith('Recipient already has an instructor');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('loads an existing instructor and offers invoice creation until edited', async () => {
    const wrapper = await setup({ id: '5' });

    expect(wrapper.find('[data-testid="page-title"]').text()).toBe('Edit instructor');
    expect(numberInput(wrapper, 'hourly-rate').props('modelValue')).toBe(12);
    expect(numberInput(wrapper, 'months').props('modelValue')).toBe(6);
    const createInvoice = wrapper.find('[data-testid="create-invoice"]');
    expect(createInvoice.attributes('disabled')).toBeUndefined();
    await createInvoice.trigger('click');
    expect(mockPush).toHaveBeenCalledWith('/invoice/new?fromInstructor=5');

    await setNumber(wrapper, 'months', 3);
    const blocked = wrapper.find('[data-testid="create-invoice"]');
    expect(blocked.attributes('disabled')).toBeDefined();
    expect(blocked.attributes('title')).toBe('Save your changes first');
  });

  it('updates an existing instructor with PUT', async () => {
    const wrapper = await setup({ id: '5' });
    await setNumber(wrapper, 'months', 3);

    await wrapper.find('form').trigger('submit');
    await flushPromises();

    const [put] = requestsWith('PUT');
    expect(put[0]).toBe('/api/instructor/5');
    expect(JSON.parse(String(put[1].body))).toMatchObject({ recipientId: 7, months: 3 });
  });

  it('disables invoice creation without an active invoice template', async () => {
    templates = [];
    const wrapper = await setup({ id: '5' });

    const createInvoice = wrapper.find('[data-testid="create-invoice"]');
    expect(createInvoice.attributes('disabled')).toBeDefined();
    expect(createInvoice.attributes('title')).toBe('No active invoice template');
  });

  it('deletes after confirmation', async () => {
    const wrapper = await setup({ id: '5' });

    await wrapper.find('[data-testid="delete"]').trigger('click');
    await flushPromises();

    expect(confirmAction).toHaveBeenCalledWith(
      expect.objectContaining({ header: 'Delete instructor', danger: true }),
    );
    expect(fetchMock).toHaveBeenCalledWith('/api/instructor/5', { method: 'DELETE' });
    expect(notify.success).toHaveBeenCalledWith('Instructor deleted');
    expect(mockPush).toHaveBeenCalledWith('/instructor');
  });

  it('does not delete when the confirmation is declined', async () => {
    confirmAction.mockResolvedValue(false);
    const wrapper = await setup({ id: '5' });

    await wrapper.find('[data-testid="delete"]').trigger('click');
    await flushPromises();

    expect(requestsWith('DELETE')).toHaveLength(0);
  });

  it('blocks saving when the instructor could not be loaded', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      url === '/api/instructor/5' && !init?.method
        ? Promise.resolve(jsonResponse({ error: 'Not found' }, false))
        : defaultFetch(url, init),
    );
    const wrapper = await setup({ id: '5' });

    expect(wrapper.find('[data-testid="load-error"]').text()).toContain('Instructor not found');
    expect(wrapper.find('[data-testid="save"]').attributes('disabled')).toBeDefined();
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(requestsWith('PUT')).toHaveLength(0);
  });

  it('reports a network error while loading', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      url === '/api/instructor/5' ? Promise.reject(new Error('offline')) : defaultFetch(url, init),
    );
    const wrapper = await setup({ id: '5' });
    expect(wrapper.find('[data-testid="load-error"]').text()).toContain(
      'Network error while loading',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit --workspace=frontend -- InstructorFormView`
Expected: FAIL.

- [ ] **Step 3: Rewrite the view**

Replace `frontend/src/views/InstructorFormView.vue` with:

```vue
<script setup lang="ts">
import Button from 'primevue/button';
import InputNumber from 'primevue/inputnumber';
import Message from 'primevue/message';
import {
  calculateInstructorRent,
  DEFAULT_WEEKS_PER_MONTH,
  type InstructorDto,
  type InstructorRentInputs,
  type InstructorSettingsDto,
  type TimeBlock,
  validateInstructorRent,
} from 'shared';
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import RecipientPicker from '../components/RecipientPicker.vue';
import FormSection from '../components/ui/FormSection.vue';
import PageHeader from '../components/ui/PageHeader.vue';
import WeeklySchedule from '../components/WeeklySchedule.vue';
import { useConfirmAction } from '../composables/useConfirmAction';
import { useNotify } from '../composables/useNotify';
import { useAppStore } from '../stores/app';
import { formatCents, formatHours } from '../utils/format';
import {
  emptyRecipient,
  fromRecipientDto,
  type RecipientFormValue,
  toRecipientData,
} from '../utils/recipientForm';

const route = useRoute();
const router = useRouter();
const store = useAppStore();
const notify = useNotify();
const { confirmAction } = useConfirmAction();

const instructorId = route.params.id ? Number(route.params.id) : null;
const isEdit = instructorId !== null;

const recipient = ref<RecipientFormValue>(emptyRecipient());
const hourlyRateCents = ref(0);
const months = ref<number | null>(1);
const timeBlocks = ref<TimeBlock[]>([]);
const weeksPerMonth = ref(DEFAULT_WEEKS_PER_MONTH);

const loadError = ref('');
const saving = ref(false);
const savedSnapshot = ref('');

const hourlyRateEuros = computed<number | null>({
  get: () => (hourlyRateCents.value > 0 ? hourlyRateCents.value / 100 : null),
  set: (euros) => {
    hourlyRateCents.value = euros === null ? 0 : Math.round(euros * 100);
  },
});

const rentInputs = computed<InstructorRentInputs>(() => ({
  hourlyRateCents: hourlyRateCents.value,
  months: months.value ?? 0,
  timeBlocks: timeBlocks.value,
}));
const issues = computed(() => validateInstructorRent(rentInputs.value));
const recipientError = computed(() =>
  recipient.value.name.trim() ? '' : 'Recipient name is required',
);
const result = computed(() =>
  issues.value.length === 0 ? calculateInstructorRent(rentInputs.value, weeksPerMonth.value) : null,
);
const canSave = computed(
  () => issues.value.length === 0 && !recipientError.value && !saving.value && !loadError.value,
);

const pageTitle = isEdit ? 'Edit instructor' : 'New instructor';
const summaryTitle = computed(
  () => `Summary (net, ${String(weeksPerMonth.value).replace('.', ',')} weeks/month)`,
);

function fieldIssue(path: string): string {
  return issues.value.find((issue) => issue.path === path)?.message ?? '';
}

function snapshot(): string {
  return JSON.stringify([recipient.value, hourlyRateCents.value, months.value, timeBlocks.value]);
}
const isDirty = computed(() => snapshot() !== savedSnapshot.value);
const createInvoiceBlockedReason = computed(() => {
  if (isDirty.value) return 'Save your changes first';
  if (store.invoiceTemplateAvailable === false) return 'No active invoice template';
  return '';
});

async function loadSettings() {
  const res = await fetch('/api/instructor/settings');
  if (res.ok) weeksPerMonth.value = ((await res.json()) as InstructorSettingsDto).weeksPerMonth;
}

async function loadInstructor(id: number) {
  const res = await fetch(`/api/instructor/${id}`);
  if (!res.ok) {
    loadError.value = 'Instructor not found';
    return;
  }
  const dto = (await res.json()) as InstructorDto;
  recipient.value = fromRecipientDto(dto.recipient);
  hourlyRateCents.value = dto.hourlyRateCents;
  months.value = dto.months;
  timeBlocks.value = dto.timeBlocks;
  savedSnapshot.value = snapshot();
}

async function save() {
  if (!canSave.value) return;
  saving.value = true;
  try {
    const body = {
      ...(recipient.value.id !== null && { recipientId: recipient.value.id }),
      recipientData: toRecipientData(recipient.value),
      ...rentInputs.value,
    };
    const res = await fetch(isEdit ? `/api/instructor/${instructorId}` : '/api/instructor', {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const result = (await res.json().catch(() => ({}))) as { error?: string };
      notify.error(result.error ?? 'Saving failed');
      return;
    }
    notify.success('Instructor saved');
    router.push('/instructor');
  } catch {
    notify.error('Saving failed');
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!isEdit) return;
  const confirmed = await confirmAction({
    message: 'Delete this instructor? The recipient is kept.',
    header: 'Delete instructor',
    acceptLabel: 'Delete',
    danger: true,
  });
  if (!confirmed) return;
  try {
    const res = await fetch(`/api/instructor/${instructorId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('delete failed');
    notify.success('Instructor deleted');
    router.push('/instructor');
  } catch {
    notify.error('Deleting failed');
  }
}

function createInvoice() {
  router.push(`/invoice/new?fromInstructor=${instructorId}`);
}

onMounted(async () => {
  try {
    await Promise.all([
      loadSettings(),
      instructorId !== null ? loadInstructor(instructorId) : Promise.resolve(),
      store.invoiceTemplateAvailable === null ? store.checkTemplates() : Promise.resolve(),
    ]);
  } catch {
    loadError.value = 'Network error while loading';
  }
});
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
          @click="router.push('/instructor')"
        />
      </template>
    </PageHeader>

    <Message v-if="loadError" severity="error" data-testid="load-error" class="load-error">
      {{ loadError }}
    </Message>

    <form @submit.prevent="save">
      <FormSection title="Recipient">
        <RecipientPicker v-model="recipient" />
        <Message
          v-if="recipientError"
          severity="error"
          size="small"
          variant="simple"
          data-testid="recipient-error"
          class="recipient-error"
        >
          {{ recipientError }}
        </Message>
      </FormSection>

      <FormSection title="Rent">
        <div class="grid-2">
          <div class="field">
            <label for="hourly-rate">Hourly rate (net)</label>
            <InputNumber
              v-model="hourlyRateEuros"
              input-id="hourly-rate"
              data-testid="hourly-rate"
              mode="currency"
              currency="EUR"
              locale="de-DE"
              placeholder="12,50 €"
              :invalid="!!fieldIssue('hourlyRateCents')"
              fluid
            />
            <Message
              v-if="fieldIssue('hourlyRateCents')"
              severity="error"
              size="small"
              variant="simple"
              data-testid="hourly-rate-error"
            >
              {{ fieldIssue('hourlyRateCents') }}
            </Message>
          </div>
          <div class="field">
            <label for="months">Months</label>
            <InputNumber
              v-model="months"
              input-id="months"
              data-testid="months"
              :min="1"
              :use-grouping="false"
              :invalid="!!fieldIssue('months')"
              fluid
            />
            <Message
              v-if="fieldIssue('months')"
              severity="error"
              size="small"
              variant="simple"
              data-testid="months-error"
            >
              {{ fieldIssue('months') }}
            </Message>
          </div>
        </div>
      </FormSection>

      <FormSection title="Weekly schedule">
        <WeeklySchedule v-model="timeBlocks" :issues="issues" />
      </FormSection>

      <FormSection :title="summaryTitle">
        <dl class="facts">
          <div>
            <dt>Hours per week</dt>
            <dd data-testid="summary-hours" class="strong">
              {{ result ? `${formatHours(result.netMinutesPerWeek)} h` : '—' }}
            </dd>
          </div>
          <div>
            <dt>Per month</dt>
            <dd data-testid="summary-monthly" class="strong">
              {{ result ? formatCents(result.monthlyCents) : '—' }}
            </dd>
          </div>
          <div>
            <dt>Total</dt>
            <dd data-testid="summary-total" class="strong total">
              {{ result ? formatCents(result.totalCents) : '—' }}
            </dd>
          </div>
        </dl>
      </FormSection>

      <div class="form-actions">
        <Button
          type="submit"
          label="Save"
          icon="pi pi-check"
          :disabled="!canSave"
          :loading="saving"
          data-testid="save"
        />
        <Button
          v-if="isEdit"
          label="Create invoice"
          icon="pi pi-file"
          severity="secondary"
          outlined
          :disabled="!!createInvoiceBlockedReason"
          :title="createInvoiceBlockedReason"
          data-testid="create-invoice"
          @click="createInvoice"
        />
        <Button
          v-if="isEdit"
          label="Delete"
          icon="pi pi-trash"
          severity="danger"
          outlined
          data-testid="delete"
          class="form-actions__delete"
          @click="remove"
        />
      </div>
    </form>
  </div>
</template>

<style scoped>
.load-error {
  margin-bottom: 1rem;
}

.recipient-error {
  margin-top: 0.5rem;
}

.strong {
  font-weight: 600;
}

.total {
  font-size: 1.125rem;
}

.form-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.form-actions__delete {
  margin-left: auto;
}
</style>
```

Notes for the implementer:

- Check how `InvoiceFormView.vue` / `DonationReceiptFormView.vue` space their `FormSection` cards. If the cards touch in this form, apply the same spacing so all three forms look alike.
- A disabled `<button>` does not show its `title` tooltip in every browser. That is accepted here (parity with today), and the test asserts the attribute.
- If PrimeVue's `Button` with `type="submit"` does not render `type="submit"` (the test asserts it), pass it through `:pt="{ root: { type: 'submit' } }"` and report it. Plan 2 showed that it does render it.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit --workspace=frontend -- InstructorFormView`
Expected: PASS.

- [ ] **Step 5: Full verification and commit**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS.

```bash
git add frontend/src/views/InstructorFormView.vue frontend/src/__tests__/InstructorFormView.test.ts
git commit -m "feat: rebuild instructor form with PrimeVue inputs, toasts and delete confirmation

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Browser verification of the instructor screens

**Files:** none. This task only verifies: report defects precisely and do not fix them.

- [ ] **Step 1: Suite and build**

Run: `npm run lint && npm run test:unit && npm run test:integration && npm run build`
Expected: all pass.

- [ ] **Step 2: Walkthrough (dev servers, scratch DB)**

From the worktree, start both servers in the background with the Bash tool's `run_in_background`. Use ports that don't clash with the user's Docker app (3000/5173). Before starting, check with `ss -ltnp` that 3996 and 5179 are free.

```bash
PORT=3996 DATABASE_URL="file:/tmp/primevue-instructors.sqlite" DATA_DIR=/tmp/primevue-instructors-data npm run dev --workspace=backend
VITE_API_TARGET=http://localhost:3996 npx --workspace=frontend vite --port 5179 --strictPort
```

(The backend `dev` script migrates the scratch DB itself.)

Use Playwright MCP (`mcp__playwright__*`) at http://localhost:5179. Walk through in light mode, then repeat the key screens in dark mode and at 390×844:

1. **Instructor list, empty:** "No instructors yet."; the Calculation settings panel is collapsed and its header shows `(3,25 weeks/month)`.
2. **Panel:**
   - Expand it. Set weeks per month to `0`: the error shows and Save is disabled. Set `3,5`, then Save: a toast appears, the header updates, and the value persists after a reload.
   - In the invoice text: insert a placeholder at the cursor, type an unknown placeholder `{monat}` (error shown, Save disabled), fix it, then Save (toast).
   - Reset to default asks for confirmation; decline once, then confirm.
3. **New instructor:**
   - Search an unknown recipient name; "New recipient" fills the name. Fill street and city, enter hourly rate `12,50`, set months `6`.
   - Add Monday 08:00–12:00 with a pause 10:00–10:30, and Thursday 09:00–13:00. The live summary shows 7,5 h/week.
   - Add an overlapping Monday block: the error shows under that block and Save is disabled. Remove the block and save: a toast, then the list.
4. **Second instructor:** pick the **existing** recipient from the search. The fields fill, and the linked hint shows. Change the street and save. Check under Invoice Settings → Recipients that the street was updated.
5. **List:**
   - Two rows; the footer Sum equals both totals. Global search for one name: the Sum shows only that row's total. Clear filters.
   - Sort by Total. A row click opens the instructor.
   - "Create invoice" is disabled with the tooltip `No active invoice template` when no invoice template exists. Then upload `e2e/fixture/Rechnung.docx` in Invoice Settings, come back, and "Create invoice" opens the invoice form pre-filled from the instructor.
6. **Edit instructor:**
   - Change months: "Create invoice" becomes disabled (`Save your changes first`). Save.
   - Delete asks for confirmation (decline once, then confirm), then a toast and the list.
   - Open `/instructor/999`: the load error shows and Save is disabled.
7. **Weekly schedule at 390×844:** the day fieldsets stack in one column, the time inputs are usable, and there is no horizontal page scroll.
8. **Console:** no errors other than the PrimeUI license warning and deliberate 4xx responses.
9. **Screenshots:** list in light and dark, the expanded panel, the form (light and dark), and the mobile form. Save them into `/home/sebastian/code/mv-dashboard/.claude/worktrees/feat-primevue/.superpowers/sdd/2026-10-06-primevue-4-instructor-rent/screens/`, named accurately (`-dark` only when dark mode is active). Delete any `.playwright-mcp/` in the worktree.

Close the browser and stop **both** servers. Check that nothing listens on 3996/5179 (`ss -ltnp`), and that no `tsx watch` or `vite` process with this worktree as its working directory survives (`pgrep -af "tsx watch|vite"`, then check `/proc/<pid>/cwd`). Delete `/tmp/primevue-instructors.sqlite` and `/tmp/primevue-instructors-data`.

- [ ] **Step 3: Branch status**

Run: `git status --short && git log --oneline master..HEAD`
Expected: a clean tree, and only plan-1 to plan-4 commits.
