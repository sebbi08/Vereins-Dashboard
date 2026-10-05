# Instructor Invoice Text Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the prefilled instructor invoice line text a configurable multi-line template with placeholders (global setting, built-in default), and allow multi-line line items on all invoices (form, detail view, PDF).

**Architecture:** A pure shared module (`shared/src/instructorInvoiceText.ts`) owns placeholders, default template, formatting, validation and rendering. The backend stores the template as a `SystemSetting`, extends the instructor settings endpoints, and renders the prefill text with the shared function; the Instructor Rent page gets a self-contained settings component that uses the same function for a live preview. Invoice line item text becomes an auto-growing textarea, the detail view preserves line breaks, and the DOCX-building step of the invoice PDF is extracted so a test can prove `\n` → `<w:br/>`.

**Tech Stack:** TypeScript, Express 4, Prisma 7 (SQLite), docxtemplater + PizZip, Vue 3 `<script setup>`, Pinia, Tailwind v4, Vitest (+ supertest, @vue/test-utils, jsdom).

**Spec:** `docs/superpowers/specs/2026-10-05-instructor-invoice-text-design.md`

## Global Constraints

- Work only in the worktree `.claude/worktrees/feat-instructor-invoice-text` on branch `feat/instructor-invoice-text`. Never touch `master` or other branches; never push.
- Verification after every task: `npm run lint && npm run test:unit && npm run test:integration` (all pass, zero lint warnings).
- Backend `src/` imports runtime values from shared only via relative `.js` paths (e.g. `'../../../shared/src/instructorInvoiceText.js'`); `import type … from 'shared'` is fine. Never `import { value } from 'shared'` in backend `src/`. Frontend imports from `'shared'`.
- Placeholder names (exact): `name`, `monate`, `stunden_pro_woche`, `wochen_pro_monat`, `stundensatz`, `betrag_pro_monat`, `betrag_gesamt`, `zeiten`. Token pattern `/\{([a-z_]+)\}/g`.
- Default template (exact): `Raummiete {monate}\n{stunden_pro_woche}/Woche × {wochen_pro_monat} Wochen × {monate} × {stundensatz}`.
- `SystemSetting` key `instructorInvoiceTemplate`; missing/blank → default. Max template length 2000 (after `\r\n`→`\n`).
- Error strings (exact): `Nothing to update`, `Invalid request body`, `Unknown placeholders: {a}, {b}` (unique, first-appearance order, comma+space), `Invoice text must be at most 2000 characters`.
- Money formatting: German, thousands `.`, decimal `,`, exactly 2 decimals, suffix ` €`, no `Intl`.
- `{zeiten}`: sorted Mo→So then start; `Mo 14:00–18:00 (Pause 16:00–16:30, 17:00–17:10)`; en dash `–`; lines joined by `\n`; empty schedule → `''`.
- Title stays `Raummiete`; prefill amount stays `calculation.totalCents`.
- Commit messages: conventional commits, ending with the line `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **Template saved with Windows line endings** (`\r\n` from a textarea paste) → stored and rendered with `\n` only, so the PDF never shows stray `\r`. Test: Task 2 (integration: PUT with `\r\n`, stored value has no `\r`).
2. **Whitespace-only template** (`'   \n  '`) → treated as "use default", not saved as an empty invoice text. Test: Task 2 (PUT stores nothing, prefill uses default) and Task 1 (`effectiveInstructorInvoiceTemplate`).
3. **Braces that are not placeholders** (`{ }`, `{12}`, `{Name}`) → kept literally and NOT rejected as unknown, so users can write text with braces. Test: Task 1.
4. **Large totals** (≥ 1.000 €, ≥ 1.000.000 €) → thousands separators correct (`1.828,13 €`, `1.234.567,89 €`). Test: Task 1.
5. **Settings save while the weeks-per-month card is untouched** → saving only the template must not reset `weeksPerMonth`, and saving only `weeksPerMonth` must not reset the template. Test: Task 2.

---

## File Structure

| File                                                    | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/src/instructorInvoiceText.ts` (new)             | Placeholders, default template, number/schedule formatting, values builder, validation, rendering                                                                                                                                                                                                                                                                                                                                                                     |
| `shared/src/index.ts`                                   | Re-export the new module; `InstructorSettingsDto.invoiceTemplate`                                                                                                                                                                                                                                                                                                                                                                                                     |
| `backend/src/services/instructorRent.ts`                | `INVOICE_TEMPLATE_KEY`, `parseSettingsUpdate`, `buildInvoicePrefill` uses template; old text helpers removed                                                                                                                                                                                                                                                                                                                                                          |
| `backend/src/routes/instructor.ts`                      | Settings GET/PUT with template; prefill reads template                                                                                                                                                                                                                                                                                                                                                                                                                |
| `backend/src/services/pdfGeneration.ts`                 | Extract `buildInvoiceDocx` (pure refactor, fresh zip for pass 2)                                                                                                                                                                                                                                                                                                                                                                                                      |
| `frontend/src/directives/autogrow.ts` (new)             | `vAutogrow` textarea auto-height directive                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `frontend/src/views/InvoiceFormView.vue`                | Line item text → textarea with `vAutogrow`                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `frontend/src/views/InvoiceDetailView.vue`              | Line item text `whitespace-pre-line`                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `frontend/src/components/InvoiceTextSettings.vue` (new) | Template editor card: load, placeholders, preview, validate, save, reset                                                                                                                                                                                                                                                                                                                                                                                              |
| `frontend/src/views/InstructorView.vue`                 | Embed `InvoiceTextSettings`                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Tests                                                   | `backend/src/__tests__/unit/instructorInvoiceText.test.ts` (new), `backend/src/__tests__/unit/invoiceDocx.test.ts` (new), `backend/src/__tests__/unit/instructorRentService.test.ts`, `backend/src/__tests__/integration/instructor.test.ts`, `frontend/src/__tests__/InvoiceTextSettings.test.ts` (new), `frontend/src/__tests__/InstructorView.test.ts`, `frontend/src/__tests__/InvoiceFormView.test.ts`, `frontend/src/__tests__/InvoiceDetailView.test.ts` (new) |

---

### Task 1: Shared invoice text module

**Files:**

- Create: `shared/src/instructorInvoiceText.ts`
- Modify: `shared/src/index.ts` (add re-export next to `export * from './instructorRent.js';`)
- Test: `backend/src/__tests__/unit/instructorInvoiceText.test.ts`

**Interfaces:**

- Consumes (from `shared/src/instructorRent.ts`): `calculateInstructorRent`, `toMinutes`, `WEEKDAYS`, types `InstructorRentInputs`, `TimeBlock`, `TimeRange`, `Weekday`
- Produces:
  - `type InstructorInvoicePlaceholder`
  - `const INSTRUCTOR_INVOICE_PLACEHOLDERS: readonly { key: InstructorInvoicePlaceholder; description: string }[]`
  - `const DEFAULT_INSTRUCTOR_INVOICE_TEMPLATE: string`
  - `const MAX_INSTRUCTOR_INVOICE_TEMPLATE_LENGTH = 2000`
  - `type InstructorInvoiceTextValues = Record<InstructorInvoicePlaceholder, string>`
  - `formatDecimal(value: number, fractionDigits: number, trimZeros: boolean): string`
  - `formatEuro(cents: number): string`
  - `formatMonths(months: number): string`
  - `formatWeeklyHours(netMinutesPerWeek: number): string`
  - `formatSchedule(blocks: TimeBlock[]): string`
  - `buildInstructorInvoiceTextValues(name: string, inputs: InstructorRentInputs, weeksPerMonth: number): InstructorInvoiceTextValues`
  - `normalizeInstructorInvoiceTemplate(template: string): string` (`\r\n`/`\r` → `\n`)
  - `findUnknownPlaceholders(template: string): string[]`
  - `renderInstructorInvoiceText(template: string, values: InstructorInvoiceTextValues): string`
  - `effectiveInstructorInvoiceTemplate(template: string | null | undefined): string`
  - `validateInstructorInvoiceTemplate(template: string): string | null`

- [ ] **Step 1: Write the failing test**

Create `backend/src/__tests__/unit/instructorInvoiceText.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  buildInstructorInvoiceTextValues,
  DEFAULT_INSTRUCTOR_INVOICE_TEMPLATE,
  effectiveInstructorInvoiceTemplate,
  findUnknownPlaceholders,
  formatDecimal,
  formatEuro,
  formatSchedule,
  INSTRUCTOR_INVOICE_PLACEHOLDERS,
  renderInstructorInvoiceText,
  validateInstructorInvoiceTemplate,
} from '../../../../shared/src/instructorInvoiceText';
import type { InstructorRentInputs, TimeBlock } from '../../../../shared/src/instructorRent';

const example: InstructorRentInputs = {
  hourlyRateCents: 1250,
  months: 6,
  timeBlocks: [
    { weekday: 'MO', start: '14:00', end: '18:00', breaks: [{ start: '16:00', end: '16:30' }] },
    { weekday: 'DO', start: '09:00', end: '13:00', breaks: [] },
  ],
};

describe('INSTRUCTOR_INVOICE_PLACEHOLDERS', () => {
  it('lists the eight placeholders in order', () => {
    expect(INSTRUCTOR_INVOICE_PLACEHOLDERS.map((p) => p.key)).toEqual([
      'name',
      'monate',
      'stunden_pro_woche',
      'wochen_pro_monat',
      'stundensatz',
      'betrag_pro_monat',
      'betrag_gesamt',
      'zeiten',
    ]);
    expect(INSTRUCTOR_INVOICE_PLACEHOLDERS.every((p) => p.description.length > 0)).toBe(true);
  });
});

describe('formatDecimal', () => {
  it.each([
    [7.5, 2, true, '7,5'],
    [3.25, 2, true, '3,25'],
    [8, 2, true, '8'],
    [10, 2, true, '10'],
    [1 / 3, 2, true, '0,33'],
    [12, 2, false, '12,00'],
    [12.5, 2, false, '12,50'],
  ])('formats %s', (value, digits, trim, expected) => {
    expect(formatDecimal(value, digits, trim)).toBe(expected);
  });
});

describe('formatEuro', () => {
  it.each([
    [0, '0,00 €'],
    [1250, '12,50 €'],
    [30469, '304,69 €'],
    [182813, '1.828,13 €'],
    [123456789, '1.234.567,89 €'],
  ])('formats %s cents', (cents, expected) => {
    expect(formatEuro(cents)).toBe(expected);
  });
});

describe('formatSchedule', () => {
  it('sorts blocks by weekday and start, and breaks by start', () => {
    const blocks: TimeBlock[] = [
      { weekday: 'DO', start: '09:00', end: '13:00', breaks: [] },
      {
        weekday: 'MO',
        start: '14:00',
        end: '18:00',
        breaks: [
          { start: '17:00', end: '17:10' },
          { start: '16:00', end: '16:30' },
        ],
      },
      { weekday: 'MO', start: '08:00', end: '10:00', breaks: [] },
    ];
    expect(formatSchedule(blocks)).toBe(
      'Mo 08:00–10:00\nMo 14:00–18:00 (Pause 16:00–16:30, 17:00–17:10)\nDo 09:00–13:00',
    );
  });

  it('is empty for an empty schedule', () => {
    expect(formatSchedule([])).toBe('');
  });
});

describe('buildInstructorInvoiceTextValues', () => {
  it('formats every value for the example', () => {
    expect(buildInstructorInvoiceTextValues('Anna Alt', example, 3.25)).toEqual({
      name: 'Anna Alt',
      monate: '6 Monate',
      stunden_pro_woche: '7,5 h',
      wochen_pro_monat: '3,25',
      stundensatz: '12,50 €',
      betrag_pro_monat: '304,69 €',
      betrag_gesamt: '1.828,13 €',
      zeiten: 'Mo 14:00–18:00 (Pause 16:00–16:30)\nDo 09:00–13:00',
    });
  });

  it('uses the singular for one month and hours with minutes when not exact', () => {
    const values = buildInstructorInvoiceTextValues(
      'Anna Alt',
      {
        ...example,
        months: 1,
        timeBlocks: [
          {
            weekday: 'MO',
            start: '14:00',
            end: '18:00',
            breaks: [{ start: '16:00', end: '16:10' }],
          },
          { weekday: 'DO', start: '09:00', end: '13:00', breaks: [] },
        ],
      },
      4,
    );
    expect(values.monate).toBe('1 Monat');
    expect(values.stunden_pro_woche).toBe('7 h 50 min');
    expect(values.wochen_pro_monat).toBe('4');
  });

  it('gives an empty schedule text without blocks', () => {
    expect(buildInstructorInvoiceTextValues('A', { ...example, timeBlocks: [] }, 3.25).zeiten).toBe(
      '',
    );
  });
});

describe('renderInstructorInvoiceText', () => {
  const values = buildInstructorInvoiceTextValues('Anna Alt', example, 3.25);

  it('renders the default template as two lines', () => {
    expect(renderInstructorInvoiceText(DEFAULT_INSTRUCTOR_INVOICE_TEMPLATE, values)).toBe(
      'Raummiete 6 Monate\n7,5 h/Woche × 3,25 Wochen × 6 Monate × 12,50 €',
    );
  });

  it('replaces every placeholder, also repeated ones', () => {
    expect(
      renderInstructorInvoiceText(
        '{name}: {betrag_gesamt} ({betrag_pro_monat}/Monat, {name})\n{zeiten}',
        values,
      ),
    ).toBe(
      'Anna Alt: 1.828,13 € (304,69 €/Monat, Anna Alt)\nMo 14:00–18:00 (Pause 16:00–16:30)\nDo 09:00–13:00',
    );
  });

  it('keeps braces that are not placeholders', () => {
    expect(renderInstructorInvoiceText('{ } {12} {Name} {name}', values)).toBe(
      '{ } {12} {Name} Anna Alt',
    );
  });

  it('normalizes Windows line endings', () => {
    expect(renderInstructorInvoiceText('a\r\nb\rc', values)).toBe('a\nb\nc');
  });
});

describe('findUnknownPlaceholders', () => {
  it('lists unknown placeholders once, in order', () => {
    expect(findUnknownPlaceholders('{monat} {name} {xyz} {monat}')).toEqual(['{monat}', '{xyz}']);
  });

  it('ignores known placeholders and non-placeholder braces', () => {
    expect(findUnknownPlaceholders('{name} { } {12} {Name}')).toEqual([]);
  });
});

describe('validateInstructorInvoiceTemplate', () => {
  it('accepts the default template', () => {
    expect(validateInstructorInvoiceTemplate(DEFAULT_INSTRUCTOR_INVOICE_TEMPLATE)).toBeNull();
  });

  it('reports unknown placeholders', () => {
    expect(validateInstructorInvoiceTemplate('Raummiete {monat} {xyz}')).toBe(
      'Unknown placeholders: {monat}, {xyz}',
    );
  });

  it('limits the length to 2000 characters after normalizing line endings', () => {
    expect(validateInstructorInvoiceTemplate('a'.repeat(2000))).toBeNull();
    expect(validateInstructorInvoiceTemplate('a'.repeat(2001))).toBe(
      'Invoice text must be at most 2000 characters',
    );
    expect(validateInstructorInvoiceTemplate('a\r\n'.repeat(1000))).toBeNull();
  });
});

describe('effectiveInstructorInvoiceTemplate', () => {
  it.each([null, undefined, '', '   \n  '])('falls back to the default for %j', (value) => {
    expect(effectiveInstructorInvoiceTemplate(value)).toBe(DEFAULT_INSTRUCTOR_INVOICE_TEMPLATE);
  });

  it('keeps a custom template', () => {
    expect(effectiveInstructorInvoiceTemplate('Miete {name}')).toBe('Miete {name}');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit --workspace=backend -- instructorInvoiceText`
Expected: FAIL — cannot resolve `../../../../shared/src/instructorInvoiceText`.

- [ ] **Step 3: Implement the module**

Create `shared/src/instructorInvoiceText.ts`:

```ts
import {
  calculateInstructorRent,
  type InstructorRentInputs,
  type TimeBlock,
  type TimeRange,
  toMinutes,
  type Weekday,
  WEEKDAYS,
} from './instructorRent.js';

export type InstructorInvoicePlaceholder =
  | 'name'
  | 'monate'
  | 'stunden_pro_woche'
  | 'wochen_pro_monat'
  | 'stundensatz'
  | 'betrag_pro_monat'
  | 'betrag_gesamt'
  | 'zeiten';

export const INSTRUCTOR_INVOICE_PLACEHOLDERS: readonly {
  key: InstructorInvoicePlaceholder;
  description: string;
}[] = [
  { key: 'name', description: 'Recipient name' },
  { key: 'monate', description: 'Number of months, e.g. "6 Monate"' },
  { key: 'stunden_pro_woche', description: 'Net hours per week, e.g. "7,5 h"' },
  { key: 'wochen_pro_monat', description: 'Weeks per month, e.g. "3,25"' },
  { key: 'stundensatz', description: 'Net hourly rate, e.g. "12,50 €"' },
  { key: 'betrag_pro_monat', description: 'Net amount per month' },
  { key: 'betrag_gesamt', description: 'Net total (the line amount)' },
  { key: 'zeiten', description: 'Weekly schedule, one line per time block' },
];

export const DEFAULT_INSTRUCTOR_INVOICE_TEMPLATE =
  'Raummiete {monate}\n{stunden_pro_woche}/Woche × {wochen_pro_monat} Wochen × {monate} × {stundensatz}';

export const MAX_INSTRUCTOR_INVOICE_TEMPLATE_LENGTH = 2000;

export type InstructorInvoiceTextValues = Record<InstructorInvoicePlaceholder, string>;

const PLACEHOLDER_PATTERN = /\{([a-z_]+)\}/g;
const KNOWN_PLACEHOLDERS = new Set<string>(INSTRUCTOR_INVOICE_PLACEHOLDERS.map((p) => p.key));

const WEEKDAY_LABELS: Record<Weekday, string> = {
  MO: 'Mo',
  DI: 'Di',
  MI: 'Mi',
  DO: 'Do',
  FR: 'Fr',
  SA: 'Sa',
  SO: 'So',
};

/** German decimal formatting without thousands separators (deterministic, no ICU dependency). */
export function formatDecimal(value: number, fractionDigits: number, trimZeros: boolean): string {
  let text = value.toFixed(fractionDigits);
  if (trimZeros && text.includes('.')) text = text.replace(/\.?0+$/, '');
  return text.replace('.', ',');
}

/** German money format with thousands separators, e.g. "1.828,13 €" (no Intl). */
export function formatEuro(cents: number): string {
  const [whole, fraction] = (cents / 100).toFixed(2).split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${fraction} €`;
}

export function formatMonths(months: number): string {
  return months === 1 ? '1 Monat' : `${months} Monate`;
}

/**
 * Weekly hours, printed exactly so the line text reproduces the billed amount:
 * a trimmed decimal when it is exact with 2 decimals, otherwise hours and minutes.
 */
export function formatWeeklyHours(netMinutesPerWeek: number): string {
  if (netMinutesPerWeek % 3 === 0) return `${formatDecimal(netMinutesPerWeek / 60, 2, true)} h`;
  return `${Math.floor(netMinutesPerWeek / 60)} h ${netMinutesPerWeek % 60} min`;
}

function formatRange(range: TimeRange): string {
  return `${range.start}–${range.end}`;
}

function byStart(a: TimeRange, b: TimeRange): number {
  return toMinutes(a.start) - toMinutes(b.start);
}

export function formatSchedule(blocks: TimeBlock[]): string {
  return [...blocks]
    .sort((a, b) => WEEKDAYS.indexOf(a.weekday) - WEEKDAYS.indexOf(b.weekday) || byStart(a, b))
    .map((block) => {
      const line = `${WEEKDAY_LABELS[block.weekday]} ${formatRange(block)}`;
      if (block.breaks.length === 0) return line;
      const breaks = [...block.breaks].sort(byStart).map(formatRange).join(', ');
      return `${line} (Pause ${breaks})`;
    })
    .join('\n');
}

export function buildInstructorInvoiceTextValues(
  name: string,
  inputs: InstructorRentInputs,
  weeksPerMonth: number,
): InstructorInvoiceTextValues {
  const result = calculateInstructorRent(inputs, weeksPerMonth);
  return {
    name,
    monate: formatMonths(inputs.months),
    stunden_pro_woche: formatWeeklyHours(result.netMinutesPerWeek),
    wochen_pro_monat: formatDecimal(weeksPerMonth, 2, true),
    stundensatz: formatEuro(inputs.hourlyRateCents),
    betrag_pro_monat: formatEuro(result.monthlyCents),
    betrag_gesamt: formatEuro(result.totalCents),
    zeiten: formatSchedule(inputs.timeBlocks),
  };
}

export function normalizeInstructorInvoiceTemplate(template: string): string {
  return template.replace(/\r\n?/g, '\n');
}

export function findUnknownPlaceholders(template: string): string[] {
  const unknown: string[] = [];
  for (const match of template.matchAll(PLACEHOLDER_PATTERN)) {
    if (!KNOWN_PLACEHOLDERS.has(match[1]) && !unknown.includes(match[0])) unknown.push(match[0]);
  }
  return unknown;
}

export function renderInstructorInvoiceText(
  template: string,
  values: InstructorInvoiceTextValues,
): string {
  return normalizeInstructorInvoiceTemplate(template).replace(
    PLACEHOLDER_PATTERN,
    (token, key: string) =>
      KNOWN_PLACEHOLDERS.has(key) ? values[key as InstructorInvoicePlaceholder] : token,
  );
}

export function effectiveInstructorInvoiceTemplate(template: string | null | undefined): string {
  return template && template.trim() !== '' ? template : DEFAULT_INSTRUCTOR_INVOICE_TEMPLATE;
}

export function validateInstructorInvoiceTemplate(template: string): string | null {
  const normalized = normalizeInstructorInvoiceTemplate(template);
  const unknown = findUnknownPlaceholders(normalized);
  if (unknown.length > 0) return `Unknown placeholders: ${unknown.join(', ')}`;
  if (normalized.length > MAX_INSTRUCTOR_INVOICE_TEMPLATE_LENGTH) {
    return `Invoice text must be at most ${MAX_INSTRUCTOR_INVOICE_TEMPLATE_LENGTH} characters`;
  }
  return null;
}
```

In `shared/src/index.ts`, directly below `export * from './instructorRent.js';` add:

```ts
export * from './instructorInvoiceText.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit --workspace=backend -- instructorInvoiceText`
Expected: PASS.

- [ ] **Step 5: Full verification and commit**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS.

```bash
git add shared/src/instructorInvoiceText.ts shared/src/index.ts backend/src/__tests__/unit/instructorInvoiceText.test.ts
git commit -m "feat: add shared instructor invoice text templating

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Backend — template setting and prefill

**Files:**

- Modify: `shared/src/index.ts` (`InstructorSettingsDto`)
- Modify: `backend/src/services/instructorRent.ts`
- Modify: `backend/src/routes/instructor.ts`
- Test: `backend/src/__tests__/unit/instructorRentService.test.ts`
- Test: `backend/src/__tests__/integration/instructor.test.ts`

**Interfaces:**

- Consumes (Task 1, via relative `.js` import): `buildInstructorInvoiceTextValues`, `effectiveInstructorInvoiceTemplate`, `normalizeInstructorInvoiceTemplate`, `renderInstructorInvoiceText`, `validateInstructorInvoiceTemplate`; existing `validateWeeksPerMonth`
- Produces:
  - `InstructorSettingsDto { weeksPerMonth: number; invoiceTemplate: string | null }`
  - service: `INVOICE_TEMPLATE_KEY = 'instructorInvoiceTemplate'`, `interface SettingsUpdate { weeksPerMonth?: number; invoiceTemplate?: string | null }`, `parseSettingsUpdate(body: unknown): SettingsUpdate | { error: string }`, `storedInvoiceTemplate(value: string | undefined): string | null`, `buildInvoicePrefill(row: InstructorRow, weeksPerMonth: number, invoiceTemplate: string | null): InstructorInvoicePrefillDto`
  - removed from service: `formatDecimal`, `monthsLabel`, `formatWeeklyHours`, `buildInvoiceLineText` (now in shared)
  - HTTP: `GET /api/instructor/settings` → `InstructorSettingsDto`; `PUT /api/instructor/settings` with `{ weeksPerMonth?, invoiceTemplate? }` → `InstructorSettingsDto`

- [ ] **Step 1: Update the service unit tests (failing)**

In `backend/src/__tests__/unit/instructorRentService.test.ts`:

1. Change the import from `../../services/instructorRent` so it no longer imports `buildInvoiceLineText` or `formatDecimal`, and imports `parseSettingsUpdate` and `storedInvoiceTemplate` instead (keep `parseInstructorSaveBody`, `parseWeeksPerMonth`).
2. Delete the whole `describe('formatDecimal', …)` and `describe('buildInvoiceLineText', …)` blocks (both are now covered by `instructorInvoiceText.test.ts`).
3. Append:

```ts
describe('parseSettingsUpdate', () => {
  it('accepts weeksPerMonth alone', () => {
    expect(parseSettingsUpdate({ weeksPerMonth: 4 })).toEqual({ weeksPerMonth: 4 });
  });

  it('accepts a template alone and normalizes line endings', () => {
    expect(parseSettingsUpdate({ invoiceTemplate: 'Miete {name}\r\n{zeiten}' })).toEqual({
      invoiceTemplate: 'Miete {name}\n{zeiten}',
    });
  });

  it.each([null, '', '  \n '])('treats template %j as reset to default', (invoiceTemplate) => {
    expect(parseSettingsUpdate({ invoiceTemplate })).toEqual({ invoiceTemplate: null });
  });

  it('accepts both keys together', () => {
    expect(parseSettingsUpdate({ weeksPerMonth: 4, invoiceTemplate: '{name}' })).toEqual({
      weeksPerMonth: 4,
      invoiceTemplate: '{name}',
    });
  });

  it.each([{}, { other: 1 }])('rejects %j as nothing to update', (body) => {
    expect(parseSettingsUpdate(body)).toEqual({ error: 'Nothing to update' });
  });

  it.each([null, 'x', [1]])('rejects non-object body %j', (body) => {
    expect(parseSettingsUpdate(body)).toEqual({ error: 'Invalid request body' });
  });

  it('rejects a non-string template', () => {
    expect(parseSettingsUpdate({ invoiceTemplate: 5 })).toEqual({ error: 'Invalid request body' });
  });

  it('rejects an invalid template with the validator message', () => {
    expect(parseSettingsUpdate({ invoiceTemplate: '{monat}' })).toEqual({
      error: 'Unknown placeholders: {monat}',
    });
  });

  it.each([null, '4'])('rejects weeksPerMonth %j', (weeksPerMonth) => {
    expect(parseSettingsUpdate({ weeksPerMonth })).toEqual({
      error: 'Weeks per month must be greater than 0',
    });
  });

  it('rejects weeksPerMonth with more than 2 decimals', () => {
    expect(parseSettingsUpdate({ weeksPerMonth: 4.333 })).toEqual({
      error: 'Weeks per month may have at most 2 decimals',
    });
  });

  it('validates both keys before accepting either', () => {
    expect(parseSettingsUpdate({ weeksPerMonth: 4, invoiceTemplate: '{monat}' })).toEqual({
      error: 'Unknown placeholders: {monat}',
    });
  });
});

describe('storedInvoiceTemplate', () => {
  it.each([undefined, '', '  \n'])('maps %j to null', (value) => {
    expect(storedInvoiceTemplate(value)).toBeNull();
  });

  it('keeps a stored template', () => {
    expect(storedInvoiceTemplate('Miete {name}')).toBe('Miete {name}');
  });
});
```

- [ ] **Step 2: Update and add the integration tests (failing)**

In `backend/src/__tests__/integration/instructor.test.ts`:

1. In `describe('GET /api/instructor/settings')` change both expectations to include the template:
   - `expect(res.body).toEqual({ weeksPerMonth: 3.25, invoiceTemplate: null });` (both tests)
2. In `describe('PUT /api/instructor/settings')`, test "stores the value and returns it": change both `toEqual({ weeksPerMonth: 4.33 })` to `toEqual({ weeksPerMonth: 4.33, invoiceTemplate: null })`.
3. In `describe('GET /api/instructor/:id/invoice-prefill')` change the expected texts:
   - first test: `text: 'Raummiete 6 Monate\n7,5 h/Woche × 3,25 Wochen × 6 Monate × 12,00 €',`
   - singular test: `'Raummiete 1 Monat\n7,5 h/Woche × 3,25 Wochen × 1 Monat × 12,00 €',`
   - the `7 h 50 min/Woche × 4,33 Wochen` `toContain` test stays unchanged.
4. Append a new describe block at the end of the file:

```ts
describe('instructor invoice template setting', () => {
  const custom = 'Raummiete für {name}\n{zeiten}\nGesamt: {betrag_gesamt}';

  it('stores a custom template, returns it and uses it for the prefill', async () => {
    const put = await request.put('/api/instructor/settings').send({ invoiceTemplate: custom });
    expect(put.status).toBe(200);
    expect(put.body).toEqual({ weeksPerMonth: 3.25, invoiceTemplate: custom });
    expect((await request.get('/api/instructor/settings')).body.invoiceTemplate).toBe(custom);

    const { body } = await request.post('/api/instructor').send(newInstructorBody());
    const res = await request.get(`/api/instructor/${body.id}/invoice-prefill`);

    expect(res.body.lineItems[0]).toEqual({
      text: 'Raummiete für Anna Alt\nMo 14:00–18:00 (Pause 16:00–16:30)\nDo 09:00–13:00\nGesamt: 1.755,00 €',
      priceInCents: 175500,
    });
  });

  it('stores Windows line endings as \\n', async () => {
    await request.put('/api/instructor/settings').send({ invoiceTemplate: 'A {name}\r\nB' });
    const row = await prisma.systemSetting.findUnique({
      where: { key: 'instructorInvoiceTemplate' },
    });
    expect(row?.value).toBe('A {name}\nB');
  });

  it.each([null, '', '   \n  '])('resets to the default with %j', async (invoiceTemplate) => {
    await request.put('/api/instructor/settings').send({ invoiceTemplate: custom });

    const res = await request.put('/api/instructor/settings').send({ invoiceTemplate });

    expect(res.status).toBe(200);
    expect(res.body.invoiceTemplate).toBeNull();
    expect(
      await prisma.systemSetting.findUnique({ where: { key: 'instructorInvoiceTemplate' } }),
    ).toBeNull();
    const { body } = await request.post('/api/instructor').send(newInstructorBody());
    const prefill = await request.get(`/api/instructor/${body.id}/invoice-prefill`);
    expect(prefill.body.lineItems[0].text).toBe(
      'Raummiete 6 Monate\n7,5 h/Woche × 3,25 Wochen × 6 Monate × 12,00 €',
    );
  });

  it('rejects unknown placeholders and stores nothing', async () => {
    const res = await request
      .put('/api/instructor/settings')
      .send({ invoiceTemplate: 'Raummiete {monat} {xyz}' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Unknown placeholders: {monat}, {xyz}' });
    expect(
      await prisma.systemSetting.findUnique({ where: { key: 'instructorInvoiceTemplate' } }),
    ).toBeNull();
  });

  it('rejects templates longer than 2000 characters', async () => {
    const res = await request
      .put('/api/instructor/settings')
      .send({ invoiceTemplate: 'a'.repeat(2001) });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invoice text must be at most 2000 characters' });
  });

  it('keeps the template when only weeksPerMonth is saved, and vice versa', async () => {
    await request.put('/api/instructor/settings').send({ invoiceTemplate: custom });
    await request.put('/api/instructor/settings').send({ weeksPerMonth: 4 });
    expect((await request.get('/api/instructor/settings')).body).toEqual({
      weeksPerMonth: 4,
      invoiceTemplate: custom,
    });

    await request.put('/api/instructor/settings').send({ invoiceTemplate: '{name}' });
    expect((await request.get('/api/instructor/settings')).body).toEqual({
      weeksPerMonth: 4,
      invoiceTemplate: '{name}',
    });
  });

  it('writes nothing when one of two keys is invalid', async () => {
    const res = await request
      .put('/api/instructor/settings')
      .send({ weeksPerMonth: 4, invoiceTemplate: '{monat}' });
    expect(res.status).toBe(400);
    expect((await request.get('/api/instructor/settings')).body).toEqual({
      weeksPerMonth: 3.25,
      invoiceTemplate: null,
    });
  });

  it('rejects an empty body', async () => {
    const res = await request.put('/api/instructor/settings').send({});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Nothing to update' });
  });
});
```

Note: `newInstructorBody()` (rate 1200 → `{betrag_gesamt}` `1.755,00 €`) and `prisma` are already defined/imported in this file; the new block must come after `newInstructorBody` is declared (end of file).

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test:unit --workspace=backend -- instructorRentService && npm run test:integration --workspace=backend -- instructor`
Expected: FAIL (`parseSettingsUpdate` missing; settings responses lack `invoiceTemplate`; prefill text still one line).

- [ ] **Step 4: Update the settings DTO**

In `shared/src/index.ts` replace the `InstructorSettingsDto` interface with:

```ts
export interface InstructorSettingsDto {
  weeksPerMonth: number;
  invoiceTemplate: string | null; // null = built-in default in use
}
```

- [ ] **Step 5: Update the service**

In `backend/src/services/instructorRent.ts`:

1. Replace the runtime import from `'../../../shared/src/instructorRent.js'` with:

```ts
import {
  buildInstructorInvoiceTextValues,
  effectiveInstructorInvoiceTemplate,
  normalizeInstructorInvoiceTemplate,
  renderInstructorInvoiceText,
  validateInstructorInvoiceTemplate,
} from '../../../shared/src/instructorInvoiceText.js';
import {
  calculateInstructorRent,
  DEFAULT_WEEKS_PER_MONTH,
  validateWeeksPerMonth,
} from '../../../shared/src/instructorRent.js';
```

2. Below `export const WEEKS_PER_MONTH_KEY = 'instructorWeeksPerMonth';` add:

```ts
export const INVOICE_TEMPLATE_KEY = 'instructorInvoiceTemplate';

/** Stored setting value → template, or null when the default is in use. */
export function storedInvoiceTemplate(value: string | undefined): string | null {
  return value !== undefined && value.trim() !== '' ? value : null;
}

export interface SettingsUpdate {
  weeksPerMonth?: number;
  invoiceTemplate?: string | null; // null = reset to default
}

/** Validates the whole body before anything is written. */
export function parseSettingsUpdate(body: unknown): SettingsUpdate | { error: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { error: 'Invalid request body' };
  }
  const { weeksPerMonth, invoiceTemplate } = body as Record<string, unknown>;
  if (weeksPerMonth === undefined && invoiceTemplate === undefined) {
    return { error: 'Nothing to update' };
  }
  const update: SettingsUpdate = {};
  if (weeksPerMonth !== undefined) {
    if (typeof weeksPerMonth !== 'number') {
      return { error: 'Weeks per month must be greater than 0' };
    }
    const error = validateWeeksPerMonth(weeksPerMonth);
    if (error) return { error };
    update.weeksPerMonth = weeksPerMonth;
  }
  if (invoiceTemplate !== undefined) {
    if (invoiceTemplate !== null && typeof invoiceTemplate !== 'string') {
      return { error: 'Invalid request body' };
    }
    if (invoiceTemplate === null || invoiceTemplate.trim() === '') {
      update.invoiceTemplate = null;
    } else {
      const normalized = normalizeInstructorInvoiceTemplate(invoiceTemplate);
      const error = validateInstructorInvoiceTemplate(normalized);
      if (error) return { error };
      update.invoiceTemplate = normalized;
    }
  }
  return update;
}
```

3. Delete `formatDecimal`, `monthsLabel`, `formatWeeklyHours` and `buildInvoiceLineText` (the block between `toListItem` and `buildInvoicePrefill`), and replace `buildInvoicePrefill` with:

```ts
export function buildInvoicePrefill(
  row: InstructorRow,
  weeksPerMonth: number,
  invoiceTemplate: string | null,
): InstructorInvoicePrefillDto {
  const inputs = toInputs(row);
  const values = buildInstructorInvoiceTextValues(row.recipient.name, inputs, weeksPerMonth);
  return {
    recipient: toRecipientDto(row.recipient),
    title: 'Raummiete',
    lineItems: [
      {
        text: renderInstructorInvoiceText(
          effectiveInstructorInvoiceTemplate(invoiceTemplate),
          values,
        ),
        priceInCents: calculateInstructorRent(inputs, weeksPerMonth).totalCents,
      },
    ],
  };
}
```

- [ ] **Step 6: Update the routes**

In `backend/src/routes/instructor.ts`:

1. Remove `validateWeeksPerMonth` from the shared import (keep `validateInstructorRent`), and extend the service import with `INVOICE_TEMPLATE_KEY`, `parseSettingsUpdate`, `storedInvoiceTemplate`.
2. Replace `getWeeksPerMonth` and both settings routes with:

```ts
async function getWeeksPerMonth(): Promise<number> {
  const row = await prisma.systemSetting.findUnique({ where: { key: WEEKS_PER_MONTH_KEY } });
  return parseWeeksPerMonth(row?.value);
}

async function getInvoiceTemplate(): Promise<string | null> {
  const row = await prisma.systemSetting.findUnique({ where: { key: INVOICE_TEMPLATE_KEY } });
  return storedInvoiceTemplate(row?.value);
}

async function getSettings(): Promise<InstructorSettingsDto> {
  const [weeksPerMonth, invoiceTemplate] = await Promise.all([
    getWeeksPerMonth(),
    getInvoiceTemplate(),
  ]);
  return { weeksPerMonth, invoiceTemplate };
}

// GET /api/instructor/settings
instructorRouter.get('/settings', async (_req, res) => {
  res.json(await getSettings());
});

// PUT /api/instructor/settings
instructorRouter.put('/settings', async (req, res) => {
  const update = parseSettingsUpdate(req.body);
  if ('error' in update) {
    res.status(400).json({ error: update.error });
    return;
  }
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    if (update.weeksPerMonth !== undefined) {
      const value = String(update.weeksPerMonth);
      await tx.systemSetting.upsert({
        where: { key: WEEKS_PER_MONTH_KEY },
        update: { value },
        create: { key: WEEKS_PER_MONTH_KEY, value },
      });
    }
    if (update.invoiceTemplate === null) {
      await tx.systemSetting.deleteMany({ where: { key: INVOICE_TEMPLATE_KEY } });
    } else if (update.invoiceTemplate !== undefined) {
      await tx.systemSetting.upsert({
        where: { key: INVOICE_TEMPLATE_KEY },
        update: { value: update.invoiceTemplate },
        create: { key: INVOICE_TEMPLATE_KEY, value: update.invoiceTemplate },
      });
    }
  });
  res.json(await getSettings());
});
```

3. In the `GET /:id/invoice-prefill` route replace `res.json(buildInvoicePrefill(row, await getWeeksPerMonth()));` with:

```ts
const { weeksPerMonth, invoiceTemplate } = await getSettings();
res.json(buildInvoicePrefill(row, weeksPerMonth, invoiceTemplate));
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm run test:unit --workspace=backend -- instructorRentService && npm run test:integration --workspace=backend -- instructor`
Expected: PASS.

- [ ] **Step 8: Full verification and commit**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS. (Frontend still compiles: it only reads `weeksPerMonth` from the settings DTO.)

```bash
git add shared/src/index.ts backend/src/services/instructorRent.ts backend/src/routes/instructor.ts backend/src/__tests__/unit/instructorRentService.test.ts backend/src/__tests__/integration/instructor.test.ts
git commit -m "feat: configurable instructor invoice text setting

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Extract `buildInvoiceDocx` and prove multi-line items in the DOCX

**Files:**

- Modify: `backend/src/services/pdfGeneration.ts` (`generateInvoicePdf`)
- Test: `backend/src/__tests__/unit/invoiceDocx.test.ts`

**Interfaces:**

- Produces:
  - `export interface InvoiceDocxInput { salutation: string; name: string; street: string; city: string; invoiceDate: Date; title: string; invoiceNumber: string; vat: number; emailSalutation: string; directDebit: boolean; lineItems: Array<{ text: string; priceInCents: number }> }`
  - `export function buildInvoiceDocx(templateBuffer: Buffer, input: InvoiceDocxInput): Buffer`
  - `generateInvoicePdf(prisma, revisionId)` unchanged signature/behavior; now calls `buildInvoiceDocx`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/__tests__/unit/invoiceDocx.test.ts`:

```ts
import fs from 'fs';
import path from 'path';
import PizZip from 'pizzip';
import { fileURLToPath } from 'url';
import { describe, expect, it, vi } from 'vitest';
import { buildInvoiceDocx } from '../../services/pdfGeneration';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.resolve(__dirname, '../../../../e2e/fixture/Rechnung.docx');

function documentXml(docx: Buffer): string {
  return new PizZip(docx).file('word/document.xml')!.asText();
}

const baseInput = {
  salutation: 'Frau',
  name: 'Anna Alt',
  street: 'Hauptstr. 1',
  city: '12345 Berlin',
  invoiceDate: new Date('2026-10-05T10:00:00Z'),
  title: 'Raummiete',
  invoiceNumber: '1 / 2026',
  vat: 19,
  emailSalutation: 'Hallo',
  directDebit: false,
};

describe('buildInvoiceDocx', () => {
  it('renders a line break in a line item as <w:br/>', () => {
    const docx = buildInvoiceDocx(fs.readFileSync(templatePath), {
      ...baseInput,
      lineItems: [{ text: 'Zeile 1\nZeile 2', priceInCents: 182813 }],
    });

    expect(documentXml(docx)).toMatch(
      /Zeile 1<\/w:t><\/w:r><w:r><w:br\/><\/w:r><w:r><w:t[^>]*>Zeile 2/,
    );
  });

  it('renders every line item text and price', () => {
    const xml = documentXml(
      buildInvoiceDocx(fs.readFileSync(templatePath), {
        ...baseInput,
        lineItems: [
          { text: 'Erste Position', priceInCents: 1000 },
          { text: 'Zweite Position', priceInCents: 2550 },
        ],
      }),
    );
    expect(xml).toContain('Erste Position');
    expect(xml).toContain('Zweite Position');
    expect(xml).toContain('25.50€');
    expect(xml).not.toContain('{text0}');
  });

  it('does not warn about reusing a generated zip', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    buildInvoiceDocx(fs.readFileSync(templatePath), {
      ...baseInput,
      lineItems: [{ text: 'A', priceInCents: 100 }],
    });
    const messages = [...warn.mock.calls, ...log.mock.calls].flat().join(' ');
    expect(messages).not.toContain('previous docxtemplater generation');
    warn.mockRestore();
    log.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit --workspace=backend -- invoiceDocx`
Expected: FAIL — `buildInvoiceDocx` is not exported.

- [ ] **Step 3: Extract the function**

In `backend/src/services/pdfGeneration.ts`, add above `generateInvoicePdf`:

```ts
export interface InvoiceDocxInput {
  salutation: string;
  name: string;
  street: string;
  city: string;
  invoiceDate: Date;
  title: string;
  invoiceNumber: string;
  vat: number;
  emailSalutation: string;
  directDebit: boolean;
  lineItems: Array<{ text: string; priceInCents: number }>;
}

/** Fills the invoice DOCX template (two passes). `\n` in line item texts becomes a line break. */
export function buildInvoiceDocx(templateBuffer: Buffer, input: InvoiceDocxInput): Buffer {
  const net = input.lineItems.reduce((sum, p) => sum + p.priceInCents, 0);
  const tax = Math.round(net * (input.vat / 100));
  const gross = net + tax;

  const paymentDetails = input.directDebit
    ? `Der Betrag wird in den nächsten Tagen mit dem Vermerk "${input.invoiceNumber}" von Ihrem Konto eingezogen.`
    : 'Bitte Überweisen Sie den Betrag unter Angabe der Rechnungsnummer an das untenstehende Konto.';

  // Pass 1: Template-level placeholders
  const doc1 = new Docxtemplater(new PizZip(templateBuffer), {
    paragraphLoop: true,
    linebreaks: true,
  });
  doc1.render({
    Anrede: input.salutation,
    Name: input.name,
    Strasse: input.street,
    Ort: input.city,
    Heute: input.invoiceDate.toLocaleDateString('de'),
    Title: input.title,
    ReNr: input.invoiceNumber,
    Netto: (net / 100).toFixed(2),
    Steuer: (tax / 100).toFixed(2),
    Brutto: (gross / 100).toFixed(2),
    ust: input.vat,
    MailAnrede: input.emailSalutation,
    PaymentDetails: paymentDetails,
    TableWithServices: getDocxTableLineItems(input.lineItems),
    monthlyPay: false,
    MonthlyBruto: '',
  });

  // Pass 2: Per-line-item placeholders (fresh zip from pass 1 output)
  const pass1Buffer = doc1.getZip().generate({ type: 'nodebuffer' }) as Buffer;
  const doc2 = new Docxtemplater(new PizZip(pass1Buffer), {
    paragraphLoop: true,
    linebreaks: true,
  });
  const pass2Data: Record<string, string> = {};
  input.lineItems.forEach((item, idx) => {
    pass2Data[`text${idx}`] = item.text;
    pass2Data[`price${idx}`] = (item.priceInCents / 100).toFixed(2);
  });
  doc2.render(pass2Data);

  return doc2.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
}
```

Then replace the body of `generateInvoicePdf` between loading `revision` and `const pdfBuffer = await docxToPdf(docxBuffer);` so it reads:

```ts
const lineItems: Array<{ text: string; priceInCents: number }> = JSON.parse(revision.positions);
const templateBuffer = await fs.promises.readFile(toAbsolutePath(revision.template.filePath));

const docxBuffer = buildInvoiceDocx(templateBuffer, {
  salutation: revision.salutation,
  name: revision.name,
  street: revision.street,
  city: revision.city,
  invoiceDate: revision.invoiceDate,
  title: revision.title,
  invoiceNumber: revision.invoice.number,
  vat: revision.vat,
  emailSalutation: revision.emailSalutation,
  directDebit: revision.directDebit,
  lineItems,
});
const pdfBuffer = await docxToPdf(docxBuffer);
```

Everything after `docxToPdf` (output dir, file name, write, return) stays as is. Remove the now-unused local variables (`net`, `tax`, `gross`, `invoiceDateFormatted`, `paymentDetails`, `tableXml`, `zip1`, `doc1`, `doc2`, `pass2Data`) from `generateInvoicePdf`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit --workspace=backend -- invoiceDocx`
Expected: PASS (3 tests), no docxtemplater warning in the output.

- [ ] **Step 5: Full verification and commit**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS (existing invoice/email integration tests cover `generateInvoicePdf` callers).

```bash
git add backend/src/services/pdfGeneration.ts backend/src/__tests__/unit/invoiceDocx.test.ts
git commit -m "refactor: extract invoice DOCX building and test multi-line line items

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Multi-line line items in the invoice form and detail view

**Files:**

- Create: `frontend/src/directives/autogrow.ts`
- Modify: `frontend/src/views/InvoiceFormView.vue` (line item text input only)
- Modify: `frontend/src/views/InvoiceDetailView.vue` (line item text span only)
- Test: `frontend/src/__tests__/InvoiceFormView.test.ts` (append to the "new invoice" describe)
- Test: `frontend/src/__tests__/InvoiceDetailView.test.ts` (new)

**Interfaces:**

- Produces: `export const vAutogrow: Directive<HTMLTextAreaElement>` (sets `style.height` to `scrollHeight` on mount and update)
- `data-testid="line-item-text"` on the form textarea and on the detail view text element

- [ ] **Step 1: Write the failing tests**

Append inside `describe('InvoiceFormView — new invoice', …)` in `frontend/src/__tests__/InvoiceFormView.test.ts`:

```ts
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
```

Create `frontend/src/__tests__/InvoiceDetailView.test.ts`:

```ts
import { flushPromises, mount } from '@vue/test-utils';
import type { InvoiceDto } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRoute, useRouter } from 'vue-router';
import InvoiceDetailView from '../views/InvoiceDetailView.vue';

vi.mock('vue-router', () => ({
  useRoute: vi.fn(),
  useRouter: vi.fn(),
}));

const invoice: InvoiceDto = {
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
  revisions: [
    {
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
        email: '',
        emailSalutation: 'Hallo',
      },
      filePath: null,
      createdAt: '2026-10-05T10:00:00.000Z',
    },
  ],
};

describe('InvoiceDetailView', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(invoice) } as Response),
    );
    (useRoute as ReturnType<typeof vi.fn>).mockReturnValue({ params: { id: '1' } });
    (useRouter as ReturnType<typeof vi.fn>).mockReturnValue({ push: vi.fn() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps line breaks in line item texts', async () => {
    const wrapper = mount(InvoiceDetailView, {
      global: { stubs: { 'router-link': { template: '<a><slot /></a>' } } },
    });
    await flushPromises();

    const text = wrapper.find('[data-testid="line-item-text"]');
    expect(text.classes()).toContain('whitespace-pre-line');
    expect(text.element.textContent).toBe('Raummiete 6 Monate\n7,5 h/Woche');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit --workspace=frontend -- InvoiceFormView InvoiceDetailView`
Expected: FAIL (no `line-item-text` elements).

- [ ] **Step 3: Add the directive**

Create `frontend/src/directives/autogrow.ts`:

```ts
import type { Directive } from 'vue';

function resize(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

/** Grows a textarea with its content (initial load and every update). */
export const vAutogrow: Directive<HTMLTextAreaElement> = {
  mounted: resize,
  updated: resize,
};
```

- [ ] **Step 4: Use a textarea in the invoice form**

In `frontend/src/views/InvoiceFormView.vue`:

1. Add to the `<script setup>` imports: `import { vAutogrow } from '../directives/autogrow';`
2. Replace the line item text `<input>` (the one with `v-model="pos.text"`) with:

```vue
<textarea
  v-model="pos.text"
  v-autogrow
  data-testid="line-item-text"
  rows="1"
  class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none overflow-hidden focus:outline-none focus:ring-2 focus:ring-blue-500"
  @input="updateGross"
></textarea>
```

Nothing else in the file changes.

- [ ] **Step 5: Preserve line breaks in the detail view**

In `frontend/src/views/InvoiceDetailView.vue`, replace

```vue
<span class="text-gray-700">{{ pos.text }}</span>
```

with

```vue
<span data-testid="line-item-text" class="text-gray-700 whitespace-pre-line">{{
                      pos.text
                    }}</span>
```

(Keep `{{ pos.text }}` with no extra whitespace inside the span so `textContent` is exactly the text; let prettier format the line.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test:unit --workspace=frontend -- InvoiceFormView InvoiceDetailView`
Expected: PASS. If prettier reformats the span so whitespace appears around the text and the `textContent` assertion fails, use `v-text="pos.text"` on the span instead of the mustache (do not change the test).

- [ ] **Step 7: Full verification and commit**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS.

```bash
git add frontend/src/directives/autogrow.ts frontend/src/views/InvoiceFormView.vue frontend/src/views/InvoiceDetailView.vue frontend/src/__tests__/InvoiceFormView.test.ts frontend/src/__tests__/InvoiceDetailView.test.ts
git commit -m "feat: allow multi-line invoice line items

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Invoice text settings card on the Instructor Rent page

**Files:**

- Create: `frontend/src/components/InvoiceTextSettings.vue`
- Modify: `frontend/src/views/InstructorView.vue` (import + one element)
- Test: `frontend/src/__tests__/InvoiceTextSettings.test.ts` (new)
- Test: `frontend/src/__tests__/InstructorView.test.ts` (one new test)

**Interfaces:**

- Consumes (from `'shared'`): `buildInstructorInvoiceTextValues`, `DEFAULT_INSTRUCTOR_INVOICE_TEMPLATE`, `DEFAULT_WEEKS_PER_MONTH`, `INSTRUCTOR_INVOICE_PLACEHOLDERS`, `renderInstructorInvoiceText`, `validateInstructorInvoiceTemplate`, types `InstructorDto`, `InstructorRentInputs`, `InstructorSettingsDto`; HTTP `GET/PUT /api/instructor/settings`, `GET /api/instructor/:id`
- Produces: `<InvoiceTextSettings :preview-instructor-id="number | null" :weeks-per-month="number" />`
- `data-testid`s: `invoice-template`, `invoice-template-default-hint`, `invoice-template-error`, `placeholder-{key}`, `invoice-template-preview`, `invoice-template-example-caption`, `save-invoice-template`, `reset-invoice-template`, `invoice-template-saved`

- [ ] **Step 1: Write the failing component test**

Create `frontend/src/__tests__/InvoiceTextSettings.test.ts`:

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { DEFAULT_INSTRUCTOR_INVOICE_TEMPLATE, type InstructorDto } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import InvoiceTextSettings from '../components/InvoiceTextSettings.vue';

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

function mountCard(previewInstructorId: number | null = 1) {
  return mount(InvoiceTextSettings, {
    props: { previewInstructorId, weeksPerMonth: 3.25 },
    attachTo: document.body,
  });
}

function textarea(wrapper: ReturnType<typeof mountCard>) {
  return wrapper.find('[data-testid="invoice-template"]').element as HTMLTextAreaElement;
}

describe('InvoiceTextSettings', () => {
  beforeEach(() => {
    storedTemplate = null;
    fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/instructor/settings' && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body)) as { invoiceTemplate: string | null };
        storedTemplate = body.invoiceTemplate;
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
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('shows the default text with a hint when none is configured', async () => {
    const wrapper = mountCard();
    await flushPromises();

    expect(textarea(wrapper).value).toBe(DEFAULT_INSTRUCTOR_INVOICE_TEMPLATE);
    expect(wrapper.find('[data-testid="invoice-template-default-hint"]').exists()).toBe(true);
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

    expect(wrapper.find('[data-testid="invoice-template-preview"]').element.textContent).toBe(
      'Raummiete 6 Monate\n7,5 h/Woche × 3,25 Wochen × 6 Monate × 12,00 €',
    );
    expect(wrapper.find('[data-testid="invoice-template-example-caption"]').exists()).toBe(false);
  });

  it('previews with example values when there is no instructor', async () => {
    const wrapper = mountCard(null);
    await flushPromises();

    expect(wrapper.find('[data-testid="invoice-template-preview"]').element.textContent).toBe(
      'Raummiete 6 Monate\n7,5 h/Woche × 3,25 Wochen × 6 Monate × 12,50 €',
    );
    expect(wrapper.find('[data-testid="invoice-template-example-caption"]').exists()).toBe(true);
  });

  it('updates the preview while typing', async () => {
    const wrapper = mountCard();
    await flushPromises();

    await wrapper.find('[data-testid="invoice-template"]').setValue('Für {name}\n{zeiten}');

    expect(wrapper.find('[data-testid="invoice-template-preview"]').element.textContent).toBe(
      'Für Bernd Bach\nMo 08:00–15:30',
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

    await wrapper.find('[data-testid="placeholder-name"]').trigger('click');

    expect(textarea(wrapper).value).toBe('A{name}B');
  });

  it('saves the template', async () => {
    const wrapper = mountCard();
    await flushPromises();
    await wrapper.find('[data-testid="invoice-template"]').setValue('Miete {name}');

    await wrapper.find('[data-testid="save-invoice-template"]').trigger('click');
    await flushPromises();

    const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT');
    expect(JSON.parse(String(put?.[1]?.body))).toEqual({ invoiceTemplate: 'Miete {name}' });
    expect(wrapper.find('[data-testid="invoice-template-saved"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="invoice-template-default-hint"]').exists()).toBe(false);
  });

  it('resets to the default after confirmation', async () => {
    storedTemplate = 'Miete {name}';
    const wrapper = mountCard();
    await flushPromises();

    await wrapper.find('[data-testid="reset-invoice-template"]').trigger('click');
    await flushPromises();

    const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT');
    expect(JSON.parse(String(put?.[1]?.body))).toEqual({ invoiceTemplate: null });
    expect(textarea(wrapper).value).toBe(DEFAULT_INSTRUCTOR_INVOICE_TEMPLATE);
    expect(wrapper.find('[data-testid="invoice-template-default-hint"]').exists()).toBe(true);
  });

  it('shows the server error when saving fails', async () => {
    const wrapper = mountCard();
    await flushPromises();
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(
        jsonResponse({ error: 'Invoice text must be at most 2000 characters' }, false),
      ),
    );

    await wrapper.find('[data-testid="save-invoice-template"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="invoice-template-error"]').text()).toBe(
      'Invoice text must be at most 2000 characters',
    );
  });

  it('disables save when the settings cannot be loaded', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({}, false)));
    const wrapper = mountCard();
    await flushPromises();

    expect(wrapper.find('[data-testid="invoice-template-error"]').text()).toBe(
      'Could not load invoice text',
    );
    expect(
      wrapper.find('[data-testid="save-invoice-template"]').attributes('disabled'),
    ).toBeDefined();
  });
});
```

Append to `frontend/src/__tests__/InstructorView.test.ts` inside the main `describe`:

```ts
it('shows the invoice text settings with the first instructor as preview source', async () => {
  const wrapper = mountView();
  await flushPromises();

  expect(wrapper.find('[data-testid="invoice-template"]').exists()).toBe(true);
  expect(fetchMock.mock.calls.some(([url]) => url === '/api/instructor/1')).toBe(true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit --workspace=frontend -- InvoiceTextSettings InstructorView`
Expected: FAIL (component missing).

- [ ] **Step 3: Create the component**

Create `frontend/src/components/InvoiceTextSettings.vue`:

```vue
<script setup lang="ts">
import {
  buildInstructorInvoiceTextValues,
  DEFAULT_INSTRUCTOR_INVOICE_TEMPLATE,
  DEFAULT_WEEKS_PER_MONTH,
  INSTRUCTOR_INVOICE_PLACEHOLDERS,
  type InstructorDto,
  type InstructorRentInputs,
  type InstructorSettingsDto,
  renderInstructorInvoiceText,
  validateInstructorInvoiceTemplate,
} from 'shared';
import { computed, nextTick, onMounted, ref, watch } from 'vue';

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

const template = ref(DEFAULT_INSTRUCTOR_INVOICE_TEMPLATE);
const usingDefault = ref(true);
const loaded = ref(false);
const serverError = ref('');
const saved = ref(false);
const textarea = ref<HTMLTextAreaElement | null>(null);
const previewSource = ref<PreviewSource | null>(null);

const validationError = computed(() => validateInstructorInvoiceTemplate(template.value));
const shownError = computed(() => validationError.value ?? serverError.value);
const canSave = computed(() => loaded.value && !validationError.value);

const preview = computed(() => {
  const source = previewSource.value ?? EXAMPLE;
  const weeks =
    Number.isFinite(props.weeksPerMonth) && props.weeksPerMonth > 0
      ? props.weeksPerMonth
      : DEFAULT_WEEKS_PER_MONTH;
  return renderInstructorInvoiceText(
    template.value,
    buildInstructorInvoiceTextValues(source.name, source.inputs, weeks),
  );
});

function edited() {
  saved.value = false;
  serverError.value = '';
}

async function loadTemplate() {
  try {
    const res = await fetch('/api/instructor/settings');
    if (!res.ok) throw new Error('load failed');
    const dto = (await res.json()) as InstructorSettingsDto;
    template.value = dto.invoiceTemplate ?? DEFAULT_INSTRUCTOR_INVOICE_TEMPLATE;
    usingDefault.value = dto.invoiceTemplate === null;
    loaded.value = true;
  } catch {
    serverError.value = 'Could not load invoice text';
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
  serverError.value = '';
  saved.value = false;
  try {
    const res = await fetch('/api/instructor/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceTemplate }),
    });
    if (!res.ok) {
      serverError.value = ((await res.json()) as { error?: string }).error ?? 'Saving failed';
      return null;
    }
    return (await res.json()) as InstructorSettingsDto;
  } catch {
    serverError.value = 'Saving failed';
    return null;
  }
}

async function save() {
  if (!canSave.value) return;
  const dto = await put(template.value);
  if (!dto) return;
  usingDefault.value = dto.invoiceTemplate === null;
  saved.value = true;
}

async function resetToDefault() {
  if (!loaded.value || !confirm('Reset the invoice text to the default?')) return;
  const dto = await put(null);
  if (!dto) return;
  template.value = DEFAULT_INSTRUCTOR_INVOICE_TEMPLATE;
  usingDefault.value = true;
  saved.value = true;
}

async function insertPlaceholder(key: string) {
  const token = `{${key}}`;
  const el = textarea.value;
  const start = el ? el.selectionStart : template.value.length;
  const end = el ? el.selectionEnd : template.value.length;
  template.value = template.value.slice(0, start) + token + template.value.slice(end);
  edited();
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
  <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
    <h3 class="font-semibold text-gray-800 mb-1">Invoice text</h3>
    <p class="text-sm text-gray-500 mb-3">
      Text of the line item when an invoice is created from an instructor.
    </p>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div class="md:col-span-2">
        <textarea
          ref="textarea"
          v-model="template"
          data-testid="invoice-template"
          rows="6"
          aria-label="Invoice text"
          class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          @input="edited"
        ></textarea>
        <p
          v-if="usingDefault"
          data-testid="invoice-template-default-hint"
          class="text-xs text-gray-500 mt-1"
        >
          Using the default text.
        </p>
        <p v-if="shownError" data-testid="invoice-template-error" class="text-sm text-red-600 mt-1">
          {{ shownError }}
        </p>

        <div class="flex items-center gap-3 mt-3">
          <button
            type="button"
            data-testid="save-invoice-template"
            :disabled="!canSave"
            class="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            @click="save"
          >
            Save
          </button>
          <button
            type="button"
            data-testid="reset-invoice-template"
            :disabled="!loaded"
            class="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            @click="resetToDefault"
          >
            Reset to default
          </button>
          <p v-if="saved" data-testid="invoice-template-saved" class="text-sm text-green-600">
            Saved
          </p>
        </div>

        <div class="mt-4">
          <p class="text-xs font-medium text-gray-600 mb-1">
            Preview
            <span v-if="!previewSource" data-testid="invoice-template-example-caption"
              >(example values)</span
            >
          </p>
          <div
            data-testid="invoice-template-preview"
            class="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 whitespace-pre-line"
            v-text="preview"
          ></div>
        </div>
      </div>

      <div>
        <p class="text-xs font-medium text-gray-600 mb-1">Placeholders (click to insert)</p>
        <ul class="space-y-1">
          <li v-for="p in INSTRUCTOR_INVOICE_PLACEHOLDERS" :key="p.key" class="text-xs">
            <button
              type="button"
              :data-testid="`placeholder-${p.key}`"
              class="font-mono text-blue-600 hover:underline"
              @click="insertPlaceholder(p.key)"
              v-text="'{' + p.key + '}'"
            ></button>
            <span class="text-gray-500"> – {{ p.description }}</span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Embed it in the Instructor Rent page**

In `frontend/src/views/InstructorView.vue`:

1. Add to the imports: `import InvoiceTextSettings from '../components/InvoiceTextSettings.vue';`
2. Directly after the closing `</div>` of the weeks-per-month card (the `div` containing `data-testid="save-settings"`), add:

```vue
<InvoiceTextSettings
  :preview-instructor-id="instructors[0]?.id ?? null"
  :weeks-per-month="Number(weeksPerMonth)"
/>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test:unit --workspace=frontend -- InvoiceTextSettings InstructorView`
Expected: PASS (all existing `InstructorView` tests still pass — the card only issues GET requests on mount).

- [ ] **Step 6: Full verification and commit**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS.

```bash
git add frontend/src/components/InvoiceTextSettings.vue frontend/src/views/InstructorView.vue frontend/src/__tests__/InvoiceTextSettings.test.ts frontend/src/__tests__/InstructorView.test.ts
git commit -m "feat: edit the instructor invoice text with placeholders and preview

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full suite and build**

Run: `npm run lint && npm run test:unit && npm run test:integration && npm run build`
Expected: all pass.

- [ ] **Step 2: Production-build walkthrough with a real PDF**

Local LibreOffice is available (`/usr/bin/libreoffice`). Start the production build against a scratch DB, as in the previous feature:

```bash
cd backend && DATABASE_URL="file:/tmp/invoice-text-e2e.sqlite" npx prisma migrate deploy && cd ..
mkdir -p backend/dist/frontend && ln -sfn "$(pwd)/frontend/dist" backend/dist/frontend/dist
DATABASE_URL="file:/tmp/invoice-text-e2e.sqlite" DATA_DIR=/tmp/invoice-text-e2e-data PORT=3997 NODE_ENV=production node backend/dist/backend/src/index.js
```

(run the server in the background; the symlink emulates the Docker layout and lives in git-ignored `backend/dist`). Upload `e2e/fixture/Rechnung.docx` as the invoice template (see `backend/src/routes/templates.ts`). Then in a browser at http://localhost:3997:

1. Instructor Rent: the "Invoice text" card shows the default text and "Using the default text."; the preview shows example values.
2. Create an instructor (rate 12,50, 6 months, Mo 14:00–18:00 with Pause 16:00–16:30, Do 09:00–13:00). Back on the list, the preview uses that instructor.
3. Change the text to `Raummiete {name}\n{zeiten}\nGesamt: {betrag_gesamt}` using the placeholder buttons; type `{monat}` and confirm the error + disabled Save; fix it and Save.
4. Create invoice from the instructor: the line item textarea shows the three-plus lines; create the invoice.
5. Open the invoice detail: line breaks visible. Download the PDF and confirm the line item is multi-line (e.g. `pdftotext` the file and check the lines appear on separate lines).
6. Reset to default works.

Stop the server, remove `/tmp/invoice-text-e2e.sqlite`, `/tmp/invoice-text-e2e-data`, the `backend/dist/frontend` symlink and any `.playwright-mcp/` directory.

- [ ] **Step 3: Branch status**

Run: `git status --short && git log --oneline master..HEAD`
Expected: clean tree; spec, plan and task commits only.
