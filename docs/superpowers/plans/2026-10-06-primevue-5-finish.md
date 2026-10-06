# PrimeVue Rewrite — Plan 5: Finish (number inputs, polish, Tailwind removal, e2e, verification) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the PrimeVue rewrite. Number fields update live and accept both `12,50` and `12.50`; the deferred polish lands; Tailwind is removed; the e2e suite is updated and green; the whole app is verified on the production build. After that the branch is ready for its single merge.

**Architecture:** A small text-based `DecimalInput` (parse/format helpers in `utils/decimalInput.ts`) replaces every PrimeVue `InputNumber`. It emits on every keystroke, so totals and summaries update live. It parses German and English decimal styles, and the field text is never rewritten while the user is typing. Then come the list and polish fixes; then Tailwind removal, with a tiny `@layer base` reset that keeps today's look; then the e2e selectors; then verification. The merge itself is not a task: it happens afterwards, through superpowers:finishing-a-development-branch, with the user's decision.

**Tech Stack:** Vue 3 `<script setup>` + TypeScript, PrimeVue 5.0.2 (InputText, InputGroup, InputGroupAddon, Message, Button), Vitest + @vue/test-utils + jsdom, WebdriverIO 8 (e2e), Playwright MCP (walkthrough).

**Spec:** `docs/superpowers/specs/2026-10-05-primevue-frontend-design.md`. Migration order steps 6–7 and the "Testing → E2E / Verification" sections are binding. One deviation, decided by the user on 2026-10-06: money and decimal fields use `DecimalInput` instead of `InputNumber`. Values must update live while typing, and both `,` and `.` must be accepted as decimal separators; `InputNumber` can do neither.

**Series:** plan 5 of 5 on branch `feat/primevue`. Plans 1–4 are done (all screens are on PrimeVue).

## Global Constraints

- Work only in the worktree `.claude/worktrees/feat-primevue` on branch `feat/primevue`. Never touch `master` or other branches, never push, and never merge (the merge is the user's decision after this plan).
- Verification after every task: `npm run lint && npm run test:unit && npm run test:integration` (all pass, zero lint warnings).
- No backend/API changes and no changes to `shared/`.
- **The user's Docker app runs on ports 3000/5173, from the main checkout mounted at `/app`.**
  - Never run `npm run test:e2e`, `npm test` or `e2e/run-tests.sh`: they run `docker compose up`/`down` and would stop that app.
  - Never point e2e at port 3000: every spec resets the backend database through `/api/e2e/reset`.
  - Never stop processes whose working directory is under `/app` or whose environment uses port 3000/5173.
  - Scratch servers use ports 3996 (backend) and 5179 (frontend), with a scratch DB under `/tmp`.
  - Every task that starts servers stops them again by PID and proves it: nothing listens on 3996/5179, and no `tsx watch`/`vite` process has this worktree as its working directory.
- Explicit PrimeVue component imports; no Tailwind classes anywhere (Task 6 makes this a test).
- Feedback conventions:
  - Toasts via `useNotify`.
  - Field errors as `Message severity="error" size="small" variant="simple"`.
  - Confirmations via `useConfirmAction`.
- Money stays integer cents in the models. Forms convert euros ↔ cents at the input (`Math.round(euros * 100)`).
- Tests: mount with `global: withPrimeVue(...)`; type into inputs with `setValue`; auto-unmount and the `matchMedia`/`ResizeObserver` shims are in `src/__tests__/setup.ts`.
- Commit messages: conventional commits with lower-case subjects (commitlint), ending with exactly `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **Typing `12.50`, `12,50`, `1.250,00` or `1250` into a money field** → 12,50 € / 1.250,00 € / 1.250,00 €. Garbage (`abc`, `12,505`) shows a format hint and is never silently stored as 0 or as a different number. Test: Task 1.
2. **Typing a price, amount, rate or months value** → the gross amount, rent summary and "Save your changes first" state update on every keystroke, without leaving the field. Test: Task 2.
3. **Typing `3.5` weeks per month** → 3,5 (not 35), and the saved value is 3.5. Test: Task 3.
4. **Removing Tailwind's preflight reset** → spacing, borders, box sizing and headings look the same as before. Test: Task 6 (the reset rules exist; no Tailwind import or utility classes), plus the Task 8 screenshot comparison.
5. **Running the e2e suite** → it only ever talks to the configured scratch backend; no request goes to a hard-coded `localhost:3000`. Test: Task 7 (grep check, plus the run against 3996/5179).

---

## File Structure

| File                                                                                                                                  | Responsibility                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/utils/decimalInput.ts` (new)                                                                                            | `parseDecimal(text, maxFractionDigits)`, `formatDecimal(value, min, max)`                                                                          |
| `frontend/src/components/ui/DecimalInput.vue` (new)                                                                                   | Text input for decimals: live emits, format hint, optional suffix addon                                                                            |
| `frontend/src/utils/format.ts` (modify)                                                                                               | Remove the unused `parseEuroToCents` / `centsToEuroInput`                                                                                          |
| `InvoiceFormView.vue`, `DonationReceiptFormView.vue`, `InstructorFormView.vue` (modify)                                               | Price, amount, rate and months use `DecimalInput`                                                                                                  |
| `InstructorView.vue`, `components/ui/AmountRangeFilter.vue` (modify)                                                                  | Weeks per month and the amount filter use `DecimalInput`                                                                                           |
| `InvoiceView.vue`, `DonationReceiptView.vue`, `InstructorView.vue` (modify)                                                           | A distinct "could not be loaded" empty state                                                                                                       |
| `WeeklySchedule.vue`, `InvoiceTextSettings.vue`, `TemplateCard.vue`, `assets/layout.css` + list views (modify)                        | Polish                                                                                                                                             |
| `frontend/package.json`, `package-lock.json`, `vite.config.ts`, `src/main.ts`, `src/style.css` (delete), `assets/layout.css` (modify) | Tailwind removal + base reset                                                                                                                      |
| `MEMORY.md` (repo root, modify)                                                                                                       | Styling row: PrimeVue instead of Tailwind                                                                                                          |
| `e2e/tests/*.ts` (modify)                                                                                                             | New selectors; backend URL from env                                                                                                                |
| Tests                                                                                                                                 | `decimalInput.test.ts`, `DecimalInput.test.ts`, `noTailwind.test.ts` (new); `format.test.ts` and the view/component tests listed per task (modify) |

---

### Task 1: DecimalInput and its parse/format helpers

**Files:**

- Create: `frontend/src/utils/decimalInput.ts`, `frontend/src/components/ui/DecimalInput.vue`
- Modify: `frontend/src/utils/format.ts` (remove `parseEuroToCents`, `centsToEuroInput`), `frontend/src/__tests__/format.test.ts` (remove their tests)
- Test: `frontend/src/__tests__/decimalInput.test.ts`, `frontend/src/__tests__/DecimalInput.test.ts`

**Interfaces:**

- Produces:
  - `parseDecimal(text: string, maxFractionDigits: number): number | null`.
    - Empty or whitespace → `null`; invalid → `NaN`.
    - It accepts `12,50`, `12.50`, `12.5`, `1250`, `1.250`, `1.250,00`, and `12,50 €` (spaces and `€` are ignored).
    - A dot followed by exactly three digits groups thousands (German), so `1.250` is 1250 and `12.505` is 12505.
    - Any other single dot is a decimal point. More fraction digits than allowed → `NaN`. Negative numbers → `NaN`.
  - `formatDecimal(value: number, minFractionDigits: number, maxFractionDigits: number): string`: de-DE with grouping (`1.250,50`).
  - `<DecimalInput v-model="number | null" input-id="…" :min-fraction-digits="0" :max-fraction-digits="2" suffix="€" placeholder="…" aria-label="…" :invalid="bool" size="small" data-testid="…" />`
    - It emits `update:modelValue` on **every keystroke** with the parsed value: `null` when empty **or invalid**.
    - With invalid text it shows `Message` `data-testid="decimal-format-error"`: `Enter a number like 12,50` (or `Enter a number like 6` when `maxFractionDigits` is 0).
    - While the input has focus, model changes from the parent never rewrite the text. When not focused, the text follows the model.
    - On blur, valid text is normalized to `formatDecimal(modelValue)`; invalid text stays.
    - Root: one wrapper `<div class="decimal-input">` (it receives `data-testid` and `class`). The `<input>` gets `id=inputId`, `inputmode="decimal"`, `aria-label`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/__tests__/decimalInput.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatDecimal, parseDecimal } from '../utils/decimalInput';

describe('parseDecimal', () => {
  it.each([
    ['12,50', 2, 12.5],
    ['12.50', 2, 12.5],
    ['12.5', 2, 12.5],
    ['1250', 2, 1250],
    ['1.250', 2, 1250],
    ['1.250,00', 2, 1250],
    ['1.234.567,8', 2, 1234567.8],
    [' 12,50 € ', 2, 12.5],
    ['0', 2, 0],
    ['6', 0, 6],
    ['3.25', 2, 3.25],
  ])('parses %j (max %i decimals) as %d', (text, max, expected) => {
    expect(parseDecimal(text, max)).toBe(expected);
  });

  it.each(['', '   ', ' € '])('returns null for empty input %j', (text) => {
    expect(parseDecimal(text, 2)).toBeNull();
  });

  it.each([
    ['abc', 2],
    ['12,505', 2],
    ['1,2,3', 2],
    ['1,5', 0],
    ['1.5', 0],
    ['-5', 2],
    ['12,', 2],
    [',5', 2],
    ['1.25.0', 2],
  ])('rejects %j (max %i decimals)', (text, max) => {
    expect(parseDecimal(text, max)).toBeNaN();
  });
});

describe('formatDecimal', () => {
  it.each([
    [1250.5, 2, 2, '1.250,50'],
    [12, 2, 2, '12,00'],
    [3.25, 0, 2, '3,25'],
    [3.5, 0, 2, '3,5'],
    [6, 0, 0, '6'],
  ])('formats %d (min %i, max %i) as %j', (value, min, max, expected) => {
    expect(formatDecimal(value, min, max)).toBe(expected);
  });
});
```

Create `frontend/src/__tests__/DecimalInput.test.ts`:

```ts
import { mount, type VueWrapper } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import DecimalInput from '../components/ui/DecimalInput.vue';
import { withPrimeVue } from './helpers/primeVue';

function mountInput(props: Record<string, unknown> = {}) {
  return mount(DecimalInput, {
    props: { modelValue: null, inputId: 'amount', ...props },
    global: withPrimeVue(),
  });
}

function input(wrapper: VueWrapper) {
  return wrapper.find('input#amount');
}

function lastEmitted(wrapper: VueWrapper): unknown {
  const events = wrapper.emitted('update:modelValue') as unknown[][];
  return events[events.length - 1][0];
}

describe('DecimalInput', () => {
  it('shows the value in German format and an empty field for null', () => {
    expect(
      (input(mountInput({ modelValue: 1250.5, minFractionDigits: 2 })).element as HTMLInputElement)
        .value,
    ).toBe('1.250,50');
    expect((input(mountInput()).element as HTMLInputElement).value).toBe('');
  });

  it('marks the input for decimal keyboards and passes the aria-label', () => {
    const field = input(mountInput({ ariaLabel: 'Price' }));
    expect(field.attributes('inputmode')).toBe('decimal');
    expect(field.attributes('aria-label')).toBe('Price');
  });

  it.each([
    ['12,50', 12.5],
    ['12.50', 12.5],
    ['1.250,00', 1250],
    ['1250', 1250],
    ['', null],
  ])('emits %j as %j on every keystroke', async (text, value) => {
    const wrapper = mountInput();
    await input(wrapper).setValue(text);
    expect(lastEmitted(wrapper)).toBe(value);
    expect(wrapper.find('[data-testid="decimal-format-error"]').exists()).toBe(false);
  });

  it.each(['abc', '12,505'])('emits null and explains the format for %j', async (text) => {
    const wrapper = mountInput();
    await input(wrapper).setValue(text);
    expect(lastEmitted(wrapper)).toBeNull();
    expect(wrapper.find('[data-testid="decimal-format-error"]').text()).toBe(
      'Enter a number like 12,50',
    );
  });

  it('rejects decimals for whole numbers', async () => {
    const wrapper = mountInput({ maxFractionDigits: 0 });
    await input(wrapper).setValue('1,5');
    expect(lastEmitted(wrapper)).toBeNull();
    expect(wrapper.find('[data-testid="decimal-format-error"]').text()).toBe(
      'Enter a number like 6',
    );
  });

  it('keeps the typed text while focused even when the model changes', async () => {
    const wrapper = mountInput();
    await input(wrapper).trigger('focus');
    await input(wrapper).setValue('0,');
    await wrapper.setProps({ modelValue: null });
    expect((input(wrapper).element as HTMLInputElement).value).toBe('0,');
  });

  it('follows model changes while not focused', async () => {
    const wrapper = mountInput({ minFractionDigits: 2 });
    await wrapper.setProps({ modelValue: 12 });
    expect((input(wrapper).element as HTMLInputElement).value).toBe('12,00');
    await wrapper.setProps({ modelValue: null });
    expect((input(wrapper).element as HTMLInputElement).value).toBe('');
  });

  it('normalizes valid text on blur', async () => {
    const wrapper = mountInput({ minFractionDigits: 2 });
    await input(wrapper).trigger('focus');
    await input(wrapper).setValue('1250.5');
    await wrapper.setProps({ modelValue: 1250.5 });
    await input(wrapper).trigger('blur');
    expect((input(wrapper).element as HTMLInputElement).value).toBe('1.250,50');
  });

  it('keeps invalid text and the hint on blur', async () => {
    const wrapper = mountInput();
    await input(wrapper).trigger('focus');
    await input(wrapper).setValue('abc');
    await input(wrapper).trigger('blur');
    expect((input(wrapper).element as HTMLInputElement).value).toBe('abc');
    expect(wrapper.find('[data-testid="decimal-format-error"]').exists()).toBe(true);
  });

  it('shows the suffix addon', () => {
    const wrapper = mountInput({ suffix: '€' });
    expect(wrapper.find('.p-inputgroupaddon').text()).toBe('€');
  });

  it('puts data-testid on the wrapper', () => {
    const wrapper = mount(DecimalInput, {
      props: { modelValue: null, inputId: 'x' },
      attrs: { 'data-testid': 'price' },
      global: withPrimeVue(),
    });
    expect(wrapper.attributes('data-testid')).toBe('price');
  });
});
```

In `frontend/src/__tests__/format.test.ts`, remove the `parseEuroToCents` and `centsToEuroInput` imports and their `describe`/`it` blocks.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit --workspace=frontend -- decimalInput DecimalInput`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

Create `frontend/src/utils/decimalInput.ts`:

```ts
/** "1250" or "1250,5" — comma as decimal separator, no grouping. */
const COMMA_DECIMAL = /^\d+(,\d+)?$/;
/** "1.250" or "1.250,5" — German thousands grouping with dots. */
const GROUPED = /^\d{1,3}(\.\d{3})+(,\d+)?$/;
/** "12.5" — a single dot as decimal point (English style). */
const DOT_DECIMAL = /^\d+\.\d+$/;

/**
 * Parses German or English decimals ("12,50", "12.50", "1.250,00").
 * Returns null for empty input and NaN for anything it cannot read unambiguously
 * or with more than `maxFractionDigits` decimals. A dot followed by exactly three
 * digits groups thousands, as in German ("1.250" = 1250).
 */
export function parseDecimal(text: string, maxFractionDigits: number): number | null {
  const compact = text.replace(/[\s€]/g, '');
  if (compact === '') return null;

  let normalized: string;
  if (COMMA_DECIMAL.test(compact)) normalized = compact.replace(',', '.');
  else if (GROUPED.test(compact)) normalized = compact.replace(/\./g, '').replace(',', '.');
  else if (DOT_DECIMAL.test(compact)) normalized = compact;
  else return Number.NaN;

  const fraction = normalized.split('.')[1] ?? '';
  if (fraction.length > maxFractionDigits) return Number.NaN;
  return Number(normalized);
}

export function formatDecimal(
  value: number,
  minFractionDigits: number,
  maxFractionDigits: number,
): string {
  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: minFractionDigits,
    maximumFractionDigits: maxFractionDigits,
  }).format(value);
}
```

Create `frontend/src/components/ui/DecimalInput.vue`:

```vue
<script setup lang="ts">
import InputGroup from 'primevue/inputgroup';
import InputGroupAddon from 'primevue/inputgroupaddon';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import { computed, ref, watch } from 'vue';
import { formatDecimal, parseDecimal } from '../../utils/decimalInput';

const props = withDefaults(
  defineProps<{
    modelValue: number | null;
    inputId?: string;
    minFractionDigits?: number;
    maxFractionDigits?: number;
    suffix?: string;
    placeholder?: string;
    ariaLabel?: string;
    invalid?: boolean;
    size?: 'small' | 'large';
  }>(),
  { minFractionDigits: 0, maxFractionDigits: 2 },
);

const emit = defineEmits<{
  'update:modelValue': [value: number | null];
}>();

function display(value: number | null): string {
  return value === null || Number.isNaN(value)
    ? ''
    : formatDecimal(value, props.minFractionDigits, props.maxFractionDigits);
}

const text = ref(display(props.modelValue));
const focused = ref(false);

const parsed = computed(() => parseDecimal(text.value, props.maxFractionDigits));
const formatError = computed(() => Number.isNaN(parsed.value));
const example = computed(() => (props.maxFractionDigits === 0 ? '6' : '12,50'));

// The user's own typing wins while the field has focus; other changes (load, reset) show up
watch(
  () => props.modelValue,
  (value) => {
    if (!focused.value) text.value = display(value);
  },
);

function onInput(value: string | undefined) {
  text.value = value ?? '';
  const result = parsed.value;
  emit('update:modelValue', result === null || Number.isNaN(result) ? null : result);
}

function onBlur() {
  focused.value = false;
  if (!formatError.value) text.value = display(props.modelValue);
}
</script>

<template>
  <div class="decimal-input">
    <InputGroup>
      <InputText
        :id="inputId"
        :model-value="text"
        inputmode="decimal"
        :placeholder="placeholder"
        :aria-label="ariaLabel"
        :invalid="invalid || formatError"
        :size="size"
        class="decimal-input__field"
        @update:model-value="onInput"
        @focus="focused = true"
        @blur="onBlur"
      />
      <InputGroupAddon v-if="suffix">{{ suffix }}</InputGroupAddon>
    </InputGroup>
    <Message
      v-if="formatError"
      severity="error"
      size="small"
      variant="simple"
      data-testid="decimal-format-error"
    >
      Enter a number like {{ example }}
    </Message>
  </div>
</template>

<style scoped>
.decimal-input {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}

.decimal-input__field {
  text-align: right;
  font-variant-numeric: tabular-nums;
  min-width: 0;
}
</style>
```

In `frontend/src/utils/format.ts`, delete `parseEuroToCents` and `centsToEuroInput` (check with `grep -rn "parseEuroToCents\|centsToEuroInput" frontend/src` that nothing else uses them).

Notes for the implementer:

- `InputGroup` with a single `InputText` and no addon renders fine. Keep one template path; don't duplicate the `InputText` markup for the no-suffix case.
- If vue-tsc rejects `@update:model-value="onInput"` because of the InputText emit type, type the parameter as `string | undefined` (as above) and report any other mismatch.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit --workspace=frontend -- decimalInput DecimalInput format`
Expected: PASS.

- [ ] **Step 5: Full verification and commit**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS.

```bash
git add frontend/src/utils/decimalInput.ts frontend/src/components/ui/DecimalInput.vue frontend/src/utils/format.ts frontend/src/__tests__/decimalInput.test.ts frontend/src/__tests__/DecimalInput.test.ts frontend/src/__tests__/format.test.ts
git commit -m "feat: add decimal input that updates live and accepts comma or dot

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Forms use DecimalInput (live totals)

**Files:**

- Modify: `frontend/src/views/InvoiceFormView.vue`, `frontend/src/views/DonationReceiptFormView.vue`, `frontend/src/views/InstructorFormView.vue`
- Modify tests: `frontend/src/__tests__/InvoiceFormView.test.ts`, `DonationReceiptFormView.test.ts`, `InstructorFormView.test.ts`

**Interfaces:**

- Consumes: `DecimalInput` (Task 1).
- Produces: no new exports. The field ids and test ids are unchanged (`line-item-price`, `#amount`, `#hourly-rate` / `hourly-rate`, `#months` / `months`).

Changes (replace each `InputNumber` element; remove the `InputNumber` imports):

`InvoiceFormView.vue`, line-item price:

```vue
<DecimalInput
  :model-value="pos.priceInCents / 100"
  :min-fraction-digits="2"
  suffix="€"
  :aria-label="`Line item ${idx + 1} price`"
  data-testid="line-item-price"
  class="line-item__price"
  @update:model-value="(value: number | null) => setPrice(idx, value)"
/>
```

(`setPrice(idx, null)` already stores 0. In `<style scoped>`, change `.line-item__price :deep(input) { width: 8rem; … }` to `.line-item__price { width: 10rem; }`.)

`DonationReceiptFormView.vue`, amount:

```vue
<DecimalInput
  v-model="amountEuros"
  input-id="amount"
  :min-fraction-digits="2"
  suffix="€"
  :invalid="!!fieldErrors.amount"
/>
```

`InstructorFormView.vue`, hourly rate and months:

```vue
<DecimalInput
  v-model="hourlyRateEuros"
  input-id="hourly-rate"
  data-testid="hourly-rate"
  :min-fraction-digits="2"
  suffix="€"
  placeholder="12,50"
  :invalid="!!fieldIssue('hourlyRateCents')"
/>
```

```vue
<DecimalInput
  v-model="months"
  input-id="months"
  data-testid="months"
  :max-fraction-digits="0"
  :invalid="!!fieldIssue('months')"
/>
```

Each form imports `DecimalInput from '../components/ui/DecimalInput.vue'`.

Test changes (keep every assertion's intent; only the way values are entered changes):

- `InvoiceFormView.test.ts`:
  - Remove the `InputNumber` import.
  - In "stores euro prices as cents and computes the gross amount", replace the two `findComponent(InputNumber).vm.$emit(...)` lines with `await wrapper.find('[data-testid="line-item-price"] input').setValue('12.50')` and `…setValue('')`.
  - Then add, in the same test, a second check: after `setValue('12,50')`, the gross shows `14,88` **without** a blur event (live total).
- `DonationReceiptFormView.test.ts`: remove the `InputNumber` import and replace `setAmount` with:

```ts
async function setAmount(wrapper: VueWrapper, euros: number | null) {
  await wrapper.find('#amount').setValue(euros === null ? '' : String(euros).replace('.', ','));
  await flushPromises();
}
```

- `InstructorFormView.test.ts`:
  - Remove the `InputNumber` import. Delete `numberInput` and replace `setNumber` with:

```ts
async function setNumber(
  wrapper: VueWrapper,
  testid: 'hourly-rate' | 'months',
  value: number | null,
) {
  await wrapper.find(`#${testid}`).setValue(value === null ? '' : String(value).replace('.', ','));
  await flushPromises();
}

function inputValue(wrapper: VueWrapper, id: 'hourly-rate' | 'months'): string {
  return (wrapper.find(`#${id}`).element as HTMLInputElement).value;
}
```

- Replace `expect(numberInput(wrapper, 'hourly-rate').props('modelValue')).toBe(12)` with `expect(inputValue(wrapper, 'hourly-rate')).toBe('12,00')`, and the months one with `expect(inputValue(wrapper, 'months')).toBe('6')`.
- Delete the test that asserts the Months `InputNumber` has `locale="de-DE"` (the component no longer exists). Keep the `1,5` test: `setNumber(wrapper, 'months', 1.5)` types `1,5`, and the months error must still show.
- Add a live-update test:

```ts
it('updates the summary and the dirty state while typing, without leaving the field', async () => {
  const wrapper = await setup({ id: '5' });
  await wrapper.find('#months').trigger('focus');
  await wrapper.find('#months').setValue('3');
  await flushPromises();

  expect(wrapper.find('[data-testid="summary-total"]').text()).toContain('877,50');
  expect(wrapper.find('[data-testid="create-invoice"]').attributes('title')).toBe(
    'Save your changes first',
  );
});
```

(1200 cents × 7,5 h × 3,25 weeks = 292,50 €/month × 3 months = 877,50 €.)

- [ ] **Step 1: Update the tests first** (as listed above) and run them

Run: `npm run test:unit --workspace=frontend -- InvoiceFormView DonationReceiptFormView InstructorFormView`
Expected: FAIL (the views still render `InputNumber`, so `#amount` etc. don't take typed text the new way, and there are no live totals).

- [ ] **Step 2: Replace the InputNumber elements** as listed

- [ ] **Step 3: Run the tests again**

Run: `npm run test:unit --workspace=frontend -- InvoiceFormView DonationReceiptFormView InstructorFormView`
Expected: PASS.

- [ ] **Step 4: Full verification and commit**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS.

```bash
git add frontend/src/views/InvoiceFormView.vue frontend/src/views/DonationReceiptFormView.vue frontend/src/views/InstructorFormView.vue frontend/src/__tests__/InvoiceFormView.test.ts frontend/src/__tests__/DonationReceiptFormView.test.ts frontend/src/__tests__/InstructorFormView.test.ts
git commit -m "feat: live totals and comma-or-dot money input in all forms

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Weeks per month and the amount filter use DecimalInput

**Files:**

- Modify: `frontend/src/views/InstructorView.vue`, `frontend/src/components/ui/AmountRangeFilter.vue`
- Modify tests: `frontend/src/__tests__/InstructorView.test.ts`, `frontend/src/__tests__/AmountRangeFilter.test.ts`

**Interfaces:**

- Consumes: `DecimalInput`.
- Produces:
  - `AmountRangeFilter`'s props and emits are unchanged. Its inputs keep `data-testid="amount-from"` / `"amount-to"` (now on the DecimalInput wrapper), and the aria-labels `<label> from` / `<label> to` move to the inner input.
  - Weeks per month keeps input id `weeks-per-month` and `data-testid="weeks-per-month"`.

Changes:

`InstructorView.vue`: replace the weeks `InputNumber` with:

```vue
<DecimalInput
  v-model="weeksPerMonth"
  input-id="weeks-per-month"
  data-testid="weeks-per-month"
  :max-fraction-digits="2"
  :invalid="!!weeksError"
  class="weeks-input"
/>
```

Then change `.weeks-input :deep(input) { width: 8rem; }` to `.weeks-input { width: 8rem; }` and remove the `InputNumber` import. A `NaN`-safe validation already exists (`validateWeeksPerMonth(weeksPerMonth ?? NaN)`). An invalid text now arrives as `null`, which shows the existing error.

`AmountRangeFilter.vue`: replace both `InputNumber`s with:

```vue
<DecimalInput
  :model-value="modelValue?.[0] ?? null"
  size="small"
  placeholder="from"
  :aria-label="`${label} from`"
  data-testid="amount-from"
  @update:model-value="(value: number | null) => update(0, value)"
/>
<DecimalInput
  :model-value="modelValue?.[1] ?? null"
  size="small"
  placeholder="to"
  :aria-label="`${label} to`"
  data-testid="amount-to"
  @update:model-value="(value: number | null) => update(1, value)"
/>
```

(Keep `.amount-range` flex; replace the `:deep(input)` width rule with `.amount-range > * { flex: 1; min-width: 4.5rem; }`.)

After this task, `grep -rn "primevue/inputnumber" frontend/src` must return nothing.

Test changes:

- `AmountRangeFilter.test.ts`: remove the `InputNumber` import and replace the three `vm.$emit` lines with typing:
  - `await wrapper.find('[data-testid="amount-from"] input').setValue('10')` → expect `[[10, null]]`.
  - In "keeps the other end": mount with `[10, null]`, then type `50` into `amount-to` → expect `[[10, 50]]`.
  - In "emits null when both ends are cleared": mount with `[10, null]`, then `setValue('')` on `amount-from` → expect `[null]`.
  - Add: typing `12.5` into `amount-from` emits `[[12.5, null]]`.
  - The aria-label assertions keep checking `wrapper.html()` for `Amount from` / `Amount to`.
- `InstructorView.test.ts`: remove the `InputNumber` import; delete `weeksInput`; replace `setWeeks` with:

```ts
async function setWeeks(wrapper: VueWrapper, value: string) {
  await wrapper.find('#weeks-per-month').setValue(value);
  await flushPromises();
}
```

- Update the calls: `setWeeks(wrapper, '4')`; `it.each` becomes `[['0', …], ['', …]]`.
- Replace `expect(weeksInput(wrapper).props('modelValue')).toBe(3.25)` with `expect((wrapper.find('#weeks-per-month').element as HTMLInputElement).value).toBe('3,25')`.
- Add:

```ts
it('saves "3.5" weeks per month as 3.5', async () => {
  const wrapper = await mountView();
  await setWeeks(wrapper, '3.5');
  await wrapper.find('[data-testid="save-settings"]').trigger('click');
  await flushPromises();
  expect(JSON.parse(String(puts()[0][1].body))).toEqual({ weeksPerMonth: 3.5 });
});
```

- [ ] **Step 1: Update the tests** (as listed) and run them

Run: `npm run test:unit --workspace=frontend -- AmountRangeFilter InstructorView`
Expected: FAIL.

- [ ] **Step 2: Replace the InputNumber elements**

- [ ] **Step 3: Run the tests again; check that no InputNumber is left**

Run: `npm run test:unit --workspace=frontend -- AmountRangeFilter InstructorView InvoiceView DonationReceiptView` then `grep -rn "primevue/inputnumber" frontend/src`
Expected: PASS; grep prints nothing. The list views' tests set the amount filter through `filters`, so they are unaffected.

- [ ] **Step 4: Full verification and commit**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS.

```bash
git add frontend/src/views/InstructorView.vue frontend/src/components/ui/AmountRangeFilter.vue frontend/src/__tests__/InstructorView.test.ts frontend/src/__tests__/AmountRangeFilter.test.ts
git commit -m "feat: use the decimal input for weeks per month and amount filters

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Lists say when loading failed

**Files:**

- Modify: `frontend/src/views/InvoiceView.vue`, `frontend/src/views/DonationReceiptView.vue`, `frontend/src/views/InstructorView.vue`
- Modify tests: `frontend/src/__tests__/InvoiceView.test.ts`, `DonationReceiptView.test.ts`, `InstructorView.test.ts`

**Interfaces:**

- Produces: `data-testid="list-load-error"` on the table's empty-state text after a failed load.

Behavior: when the list request fails (network or non-OK), the table's empty slot shows `Invoices could not be loaded. Reload the page to try again.` (respectively `Receipts …` / `Instructors …`) instead of `No invoices found.` / `No receipts found.` / `No instructors yet.`. The existing error toast stays.

In each view, add `const loadFailed = ref(false);`, set it to `true` in the load function's `catch`, and set it to `false` at the start of the load. Replace the `#empty` template; for InvoiceView:

```vue
<template #empty>
  <span v-if="loadFailed" data-testid="list-load-error"
    >Invoices could not be loaded. Reload the page to try again.</span
  >
  <span v-else>No invoices found.</span>
</template>
```

(DonationReceiptView: `Receipts could not be loaded. Reload the page to try again.` / `No receipts found.`; InstructorView: `Instructors could not be loaded. Reload the page to try again.` / `No instructors yet.`)

Tests: in each view's existing "reports a load error" test, add:

```ts
expect(wrapper.find('[data-testid="list-load-error"]').text()).toContain('could not be loaded');
```

(The test must keep the wrapper returned by `mountView()`.) Also add one test per view where the list request returns `{ ok: false }` (non-OK, not a rejection), with the same assertion and the error toast.

- [ ] **Step 1: Add the test assertions/tests and run them** — Run: `npm run test:unit --workspace=frontend -- InvoiceView DonationReceiptView InstructorView` — Expected: FAIL.
- [ ] **Step 2: Implement** as above.
- [ ] **Step 3: Run the tests again** — Expected: PASS.
- [ ] **Step 4: Full verification and commit**

Run: `npm run lint && npm run test:unit && npm run test:integration`

```bash
git add frontend/src/views/InvoiceView.vue frontend/src/views/DonationReceiptView.vue frontend/src/views/InstructorView.vue frontend/src/__tests__/InvoiceView.test.ts frontend/src/__tests__/DonationReceiptView.test.ts frontend/src/__tests__/InstructorView.test.ts
git commit -m "feat: show a load-failed state in the lists

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Polish

**Files:**

- Modify: `frontend/src/assets/layout.css`, `frontend/src/views/InvoiceView.vue`, `frontend/src/views/DonationReceiptView.vue`, `frontend/src/views/InstructorView.vue`, `frontend/src/components/WeeklySchedule.vue`, `frontend/src/components/InvoiceTextSettings.vue`, `frontend/src/components/TemplateCard.vue`
- Modify tests: `frontend/src/__tests__/InvoiceTextSettings.test.ts`, `frontend/src/__tests__/TemplateCard.test.ts`

Items:

1. **Right-aligned numeric columns, defined once.** Add to `layout.css`:

```css
/* Numeric DataTable columns: values and headers right-aligned, digits aligned */
.p-datatable .col-amount {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.p-datatable th.col-amount .p-datatable-column-header-content {
  justify-content: flex-end;
}
```

Then delete the `:deep(.col-amount) { … }` rules from the three list views' `<style scoped>`.

2. **WeeklySchedule layout.**
   - Day boxes no longer stretch to the tallest in their row: add `align-items: start;` to `.schedule`.
   - Block controls stay on one line: `.schedule` grid columns become `repeat(auto-fill, minmax(22rem, 1fr))`. The block's first row gets `flex-wrap: nowrap` (add a class `schedule__row` to that `div.row` and give it `.schedule__row { flex-wrap: nowrap; }`). Time inputs get `width: 7rem` (`.schedule input[type='time'] { width: 7rem; }`).
   - No test changes (the existing tests use test ids only).
3. **InvoiceTextSettings: Save only when changed.** Track `savedTemplate = ref(DEFAULT_INSTRUCTOR_INVOICE_TEMPLATE)`. Set it after a successful load (`dto.invoiceTemplate ?? DEFAULT…`), after a successful save (the template shown afterwards), and after a reset. `canSave` additionally requires `template.value !== savedTemplate.value`. Tests:
   - A freshly loaded template has Save disabled.
   - Typing enables it; after saving it is disabled again.
   - Existing tests that click Save without editing first must now type a change before clicking. "toasts the server error when saving fails" types e.g. `'Miete {name}'` before clicking Save. "shows the default text after saving a blank template" already types `'   '`, which counts as a change.
4. **TemplateCard download as a button-style link.** Replace the `<a … class="template-card__download">Download</a>` with:

```vue
<Button
  v-if="template"
  as="a"
  :href="`/api/templates/${type}/download`"
  label="Download"
  icon="pi pi-download"
  text
  size="small"
  data-testid="template-download"
/>
```

Then delete the `.template-card__download` style. The existing `TemplateCard.test.ts` assertion on `href` must still pass (`Button as="a"` renders an `<a href>`). If PrimeVue 5's `Button` does not support `as="a"` (check `node_modules/primevue/button/Button.vue`), keep the `<a>` and give it the classes `p-button p-button-text p-button-sm` plus an icon span instead. Report which. 5. **Panel header click.** Leave as is: PrimeVue's `Panel` toggles via its toggle button, consistent with the component library.

- [ ] **Step 1: Add the InvoiceTextSettings "save only when changed" tests and run them** — Expected: FAIL.
- [ ] **Step 2: Implement items 1–4.**
- [ ] **Step 3: Run** `npm run test:unit --workspace=frontend -- InvoiceTextSettings TemplateCard WeeklySchedule InvoiceView DonationReceiptView InstructorView` — Expected: PASS.
- [ ] **Step 4: Full verification and commit**

Run: `npm run lint && npm run test:unit && npm run test:integration`

```bash
git add frontend/src/assets/layout.css frontend/src/views/InvoiceView.vue frontend/src/views/DonationReceiptView.vue frontend/src/views/InstructorView.vue frontend/src/components/WeeklySchedule.vue frontend/src/components/InvoiceTextSettings.vue frontend/src/components/TemplateCard.vue frontend/src/__tests__/InvoiceTextSettings.test.ts frontend/src/__tests__/TemplateCard.test.ts
git commit -m "style: align numeric columns, tidy schedule layout, save text only when changed

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Remove Tailwind

**Files:**

- Modify: `frontend/package.json`, `package-lock.json` (via npm), `frontend/vite.config.ts`, `frontend/src/main.ts`, `frontend/src/assets/layout.css`, `MEMORY.md` (repo root)
- Delete: `frontend/src/style.css`
- Test: `frontend/src/__tests__/noTailwind.test.ts` (new)

**Interfaces:** none.

- [ ] **Step 1: Write the failing guard test**

Create `frontend/src/__tests__/noTailwind.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const FRONTEND = fileURLToPath(new URL('../..', import.meta.url));
const SRC = join(FRONTEND, 'src');
const THIS_FILE = fileURLToPath(import.meta.url);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(vue|ts|css)$/.test(name) && path !== THIS_FILE ? [path] : [];
  });
}

/** Typical Tailwind utilities that never appear in our own class names. */
const TAILWIND_UTILITY =
  /(^|\s)(flex-col|items-center|justify-between|text-(xs|sm|lg|xl|2xl)|text-(gray|red|blue|green|amber|orange)-\d{2,3}|bg-[a-z]+-\d{2,3}|p[xy]?-\d|m[btxy]?-\d|rounded(-[a-z]+)?|shadow(-[a-z]+)?|space-[xy]-\d|(hover|focus|disabled|md):[\w-]+)(?=\s|$)/;

describe('no Tailwind left', () => {
  it('has no Tailwind dependency, plugin or import', () => {
    const pkg = readFileSync(join(FRONTEND, 'package.json'), 'utf8');
    expect(pkg).not.toMatch(/tailwind/i);
    expect(readFileSync(join(FRONTEND, 'vite.config.ts'), 'utf8')).not.toMatch(/tailwind/i);
    expect(readFileSync(join(FRONTEND, 'index.html'), 'utf8')).not.toMatch(/tailwind/i);
    for (const file of sourceFiles(SRC)) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/tailwind/i);
    }
  });

  it('uses no Tailwind utility classes in templates', () => {
    for (const file of sourceFiles(SRC).filter((f) => f.endsWith('.vue'))) {
      const classAttributes = readFileSync(file, 'utf8').match(/\sclass="[^"]*"/g) ?? [];
      for (const attribute of classAttributes) {
        const classes = attribute.slice(' class="'.length, -1);
        expect(TAILWIND_UTILITY.test(classes), `${file}: ${attribute}`).toBe(false);
      }
    }
  });

  it('keeps the base reset that replaced Tailwind preflight', () => {
    const layout = readFileSync(join(SRC, 'assets', 'layout.css'), 'utf8');
    expect(layout).toContain('@layer base');
    expect(layout).toMatch(/box-sizing:\s*border-box/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:unit --workspace=frontend -- noTailwind`
Expected: FAIL (`package.json`, `vite.config.ts` and `style.css` mention tailwind; no `@layer base` yet). The utility-class test may already pass, because plans 2–4 removed all utilities. If it fails, the message names the file and attribute: replace those classes with `layout.css` helpers or scoped CSS.

- [ ] **Step 3: Remove Tailwind and add the base reset**

1. `npm uninstall --workspace=frontend tailwindcss @tailwindcss/vite` (updates `frontend/package.json` and `package-lock.json`).
2. `frontend/vite.config.ts`: remove `import tailwindcss from '@tailwindcss/vite';` and change `plugins: [vue(), tailwindcss()]` to `plugins: [vue()]`.
3. `frontend/src/main.ts`: remove `import './style.css';`; then `git rm frontend/src/style.css`.
4. Add to the **top** of `frontend/src/assets/layout.css`, directly after the file's header comment:

```css
/* Minimal reset replacing Tailwind's preflight, which all screens were built on.
   It sits in the lowest-priority layer, as preflight did, so PrimeVue's and our own
   styles always win. */
@layer base {
  *,
  ::before,
  ::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
    border: 0 solid;
  }

  html {
    line-height: 1.5;
    -webkit-text-size-adjust: 100%;
  }

  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    font-size: inherit;
    font-weight: inherit;
  }

  ol,
  ul,
  menu {
    list-style: none;
  }

  img,
  svg,
  video,
  canvas,
  iframe {
    display: block;
    max-width: 100%;
  }

  button,
  input,
  select,
  textarea {
    font: inherit;
    color: inherit;
  }

  a {
    color: inherit;
    text-decoration: inherit;
  }
}
```

5. `MEMORY.md` (repository root): in the stack table, change the row `| Styling         | Tailwind CSS v4                |` to `| Styling         | PrimeVue 5 (Aura theme) + layout.css |` (keep the table formatting; run prettier on the file).

- [ ] **Step 4: Run tests and build**

Run: `npm run test:unit --workspace=frontend -- noTailwind` then `npm run build --workspace=frontend`
Expected: PASS; the build succeeds and `frontend/dist/assets/*.css` contains no `tailwindcss` banner (`grep -l "tailwindcss" frontend/dist/assets/*.css` prints nothing).

- [ ] **Step 5: Full verification and commit**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS.

```bash
git add frontend/package.json package-lock.json frontend/vite.config.ts frontend/src/main.ts frontend/src/assets/layout.css frontend/src/__tests__/noTailwind.test.ts MEMORY.md
git commit -m "chore: remove tailwind and add a minimal base reset

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

(The `git rm` in Step 3 already staged the deletion of `style.css`. Before committing, check `git status --short`: only the listed files plus the deleted `style.css`.)

Notes for the implementer:

- `npm uninstall` needs the npm registry only to rewrite the lockfile; if it fails offline, report BLOCKED instead of hand-editing `package-lock.json`.
- Visual parity is checked in Task 8 against the plan-4 screenshots. Don't try to judge it here.

---

### Task 7: E2E selectors and a safe e2e run

**Files:**

- Modify: `e2e/tests/helpers.ts`, `e2e/tests/invoice.spec.ts`, `e2e/tests/donation-receipt.spec.ts`, `e2e/tests/settings.spec.ts`, `e2e/tests/template-upload.spec.ts`
- (`e2e/tests/home.spec.ts` and `e2e/wdio.conf.ts` stay unchanged unless the run proves otherwise; report any change.)

**Interfaces:**

- Produces: `export const BACKEND_URL = process.env.E2E_BACKEND_URL ?? 'http://localhost:3000';` in `e2e/tests/helpers.ts`, used by every Node-side `fetch` in the specs.

Changes:

1. **`helpers.ts`:** add the `BACKEND_URL` export (with a comment: "same default as wdio.conf.ts; set E2E_BACKEND_URL to run against another backend") and use it in `uploadTemplateViaApi`: ``fetch(`${BACKEND_URL}/api/templates/${type}/upload`, … )``.
2. **`invoice.spec.ts`:**
   - Import `BACKEND_URL` and replace all three `'http://localhost:3000/api/…'` URLs with `` `${BACKEND_URL}/api/…` ``.
   - In "Invoice list", replace the date-inputs test, the "Show cancelled" test and the empty-state test with:

```ts
it('shows the date range filter', async () => {
  await expect($('[aria-label="Filter by invoice date"]')).toBeDisplayed();
});
it('shows the status filter with Active selected', async () => {
  const filter = await $('[data-testid="status-filter"]');
  await expect(filter).toBeDisplayed();
  await expect(filter.$('[aria-pressed="true"]')).toHaveText('Active');
});
it('shows empty state when no invoices exist', async () => {
  await expect($('td*=No invoices found.')).toBeDisplayed();
});
```

- In "creates a new invoice via API", replace the whole `if (id) { … } else { … }` block with:

```ts
expect(id).toBeGreaterThan(0);
await browser.url(`/invoice/${id}`);
```

3. **`donation-receipt.spec.ts`:**
   - Same three list replacements, with `[aria-label="Filter by donation date"]` and `td*=No receipts found.`.
   - Replace every `h2=Receipt Details` with `h2*=Receipt `, `span=R1` with `span=Revision 1`, and `span=R2` with `span=Revision 2`.
4. **`settings.spec.ts`:**
   - "shows the Templates section" and "shows ANSCHREIBEN and QUITTUNG template sections" and "shows 'No template uploaded' …" first open the tab: `await (await $('button=Templates')).click();`.
   - "saves settings and shows success message" replaces both `.bg-green-50` waits with:

```ts
await browser.waitUntil(async () => (await $('body').getText()).includes('Settings saved'), {
  timeout: 10000,
  timeoutMsg: 'Success toast did not appear',
});
```

5. **`template-upload.spec.ts`:** in `describe('Donation Receipt Settings')`'s `beforeEach`, after `browser.url(...)`, add `await (await $('button=Templates')).click();`.
6. **Hard-coded URL check:** `grep -rn "localhost:3000" e2e/tests` must print only the `BACKEND_URL` default line in `helpers.ts`.

- [ ] **Step 1: Make the changes above**

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: PASS. If the root ESLint config doesn't cover `e2e/`, also run `npx tsc --noEmit -p e2e/tsconfig.json`.

- [ ] **Step 3: Start scratch servers against the production frontend build**

Check that 3996, 5179 and 9515 are free (`ss -ltnp | grep -E ':(3996|5179|9515)\b'` prints nothing). Then build and start both servers (Bash `run_in_background`), and record their PIDs:

```bash
npm run build --workspace=shared && npm run build --workspace=frontend
PORT=3996 DATABASE_URL="file:/tmp/primevue-e2e.sqlite" DATA_DIR=/tmp/primevue-e2e-data npm run dev --workspace=backend
VITE_API_TARGET=http://localhost:3996 npx --workspace=frontend vite preview --port 5179 --strictPort
```

`vite preview` serves the production bundle and reuses `server.proxy`, so `/api` goes to 3996. Wait until `curl -s localhost:3996/api/health` and `curl -s -o /dev/null -w '%{http_code}' localhost:5179` answer.

- [ ] **Step 4: Run e2e against the scratch servers**

```bash
cd e2e && E2E_BACKEND_URL=http://localhost:3996 E2E_FRONTEND_URL=http://localhost:5179 npx wdio run wdio.conf.ts
```

Expected: all specs pass. (`onPrepare` downloads Chrome/ChromeDriver into `.browser-cache` on the first run; that folder is git-ignored.)

- If a spec fails, read the failure. If the selector or wait is wrong for the new UI, fix the spec, keeping the scenario: the spec says "all scenarios kept". If the app is wrong, report DONE_WITH_CONCERNS with the details; don't change app code in this task.
- The `.docx` preview test tolerates slow LibreOffice by design.

- [ ] **Step 5: Stop everything and prove it**

Stop the backend, the preview server and any leftover chromedriver by PID. Confirm `ss -ltnp | grep -E ':(3996|5179|9515)\b'` prints nothing, and that no `tsx watch`/`vite`/`chromedriver` process has this worktree as its working directory (check `/proc/<pid>/cwd`). Delete `/tmp/primevue-e2e.sqlite` and `/tmp/primevue-e2e-data`.

- [ ] **Step 6: Full verification and commit**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS. `git status --short` shows only the e2e spec files.

```bash
git add e2e/tests/helpers.ts e2e/tests/invoice.spec.ts e2e/tests/donation-receipt.spec.ts e2e/tests/settings.spec.ts e2e/tests/template-upload.spec.ts
git commit -m "test: update e2e selectors for the PrimeVue screens

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

(Also add any spec/config file you had to change in Step 4, and say why in the report.)

---

### Task 8: Final verification on the production build

**Files:** none. This task only verifies: report defects precisely and do not fix them.

- [ ] **Step 1: Suite, build, Tailwind grep**

Run: `npm run lint && npm run test:unit && npm run test:integration && npm run build`, then `grep -rniE "tailwind" frontend/src frontend/index.html frontend/vite.config.ts frontend/package.json`.
Expected: all pass; the grep prints nothing.

- [ ] **Step 2: Servers on the production frontend build** (same commands as Task 7 Step 3, with `DATABASE_URL="file:/tmp/primevue-final.sqlite" DATA_DIR=/tmp/primevue-final-data`; check that the ports are free first and record the PIDs).

- [ ] **Step 3: Walkthrough with Playwright MCP** (`mcp__playwright__*`) at http://localhost:5179. Cover every screen in light **and** dark mode, plus 390×844 for the lists and forms:

1. **Dashboard and sidebar:** theme toggle System/Light/Dark, active highlighting, mobile drawer.
2. **Invoices:**
   - Upload `e2e/fixture/Rechnung.docx` in Invoice settings; the preview dialog shows; save.
   - New invoice with two line items. Type the prices `12.50` and `1.250,00` and watch the gross update **while typing**. Type `abc`: the format hint shows and the gross ignores it. Fix it and create the invoice.
   - **Download the PDF and verify it is a real PDF:** `curl -s localhost:3996/api/invoice/revision/<id>/download | head -c 5` prints `%PDF-`, and the content-type is `application/pdf`.
   - Then revision, duplicate, a draft (save, Enter, activate), cancel with confirmation, list filters (status, search, amount range typed as `12.5`, date range), batch download.
3. **Donation receipts:**
   - Upload `e2e/fixture/geldspende_verein.pdf` (and the cover letter `.docx`).
   - New receipt with amount `100.00`, the donor picker and a new donor. Check the download returns `%PDF-`.
   - Revision with a changed donor city, list, and settings tabs (association data save, donors inline edit, templates).
4. **Instructor rent:**
   - In the panel, set weeks per month to `3.5` and save; the header shows `3,5`.
   - New instructor with rate `12.50`, months `6`, and a schedule with a pause; the summary updates while typing.
   - Then edit, "Create invoice" (opens a pre-filled invoice form), delete with confirmation.
5. **Visual parity after removing Tailwind:** compare against the plan-4 screenshots in `/tmp/claude-1000/-home-sebastian-code-mv-dashboard/6a8edce9-9444-494c-b398-fc68400ec504/scratchpad/primevue-instructors-screens/` (and `…/primevue-receipts-screens/`, `…/primevue-invoices-screens/`). Report any spacing, border, heading-size or list-bullet change, with side-by-side screenshot names.
6. **Console:** no errors other than the PrimeUI license warning and deliberate 4xx responses.
7. **Screenshots:** every screen in light and dark, plus the mobile list and form. Save them to `/home/sebastian/code/mv-dashboard/.claude/worktrees/feat-primevue/.superpowers/sdd/2026-10-06-primevue-5-finish/screens/`, named accurately. Delete `.playwright-mcp/` in the worktree.

- [ ] **Step 4: Stop everything and prove it** (as in Task 7 Step 5; delete `/tmp/primevue-final*`).

- [ ] **Step 5: Branch status**

Run: `git status --short && git log --oneline master..HEAD | wc -l && git log --oneline -1 master`
Expected: a clean tree. Master is still at `dffb789`, so the merge can be a fast-forward. Report the commit count.

---

## After the plan: merge (not a task)

After the final whole-branch review is clean, the controller uses superpowers:finishing-a-development-branch and asks the user how to integrate. Facts to include when asking:

- `master` (checked out in the main checkout, `/home/sebastian/code/mv-dashboard`) has not moved since the branch started, so a local merge is a fast-forward.
- The main checkout is mounted into the user's running Docker app (`/app`). A merge changes its files live: Vite reloads, and `vite.config.ts` no longer uses Tailwind. The container's `node_modules` still contains Tailwind, which is harmless.
- `/api/e2e/reset` (backend, untouched by this rewrite) deletes all data and has no environment guard. Suggest gating it as a separate follow-up.
