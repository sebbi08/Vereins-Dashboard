# Instructor Rent Calculator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store instructors (linked to invoice recipients) with a weekly Mo–So schedule of time blocks and breaks, calculate their net room rent for N months, and open the invoice form prefilled with that amount.

**Architecture:** Calculation and validation live once in `shared/src/instructorRent.ts` (pure functions) and are used by the backend (relative import, compiled into `backend/dist`) and the frontend (via the `shared` alias, bundled by Vite). The backend adds one Prisma model (`Instructor`, time blocks as JSON), a thin Express router plus a pure service module. The frontend adds a list view, a form view built from two new components (`RecipientPicker`, `WeeklySchedule`) and a small additive prefill branch in `InvoiceFormView`.

**Tech Stack:** TypeScript, Express 4, Prisma 7 (SQLite), Vue 3 `<script setup>`, Pinia, Vue Router 4, Tailwind v4, Vitest (+ supertest, @vue/test-utils, jsdom).

**Spec:** `docs/superpowers/specs/2026-10-05-instructor-rent-design.md`

## Global Constraints

- Work only in the worktree `.claude/worktrees/feat-instructor-rent` on branch `feat/instructor-rent`. Another agent works on `feat/invoice-drafts` in the main checkout — never touch it.
- Verification after every task: `npm run lint && npm run test:unit && npm run test:integration` (all must pass, zero lint warnings).
- All money values are integer cents. Calculation rounds exactly once, at the final value: `Math.round(netMinutesPerWeek * hourlyRateCents * weeksPerMonth * months / 60)`.
- Default weeks per month: `3.25`; stored in `SystemSetting` key `instructorWeeksPerMonth`.
- Months: whole number ≥ 1. Times: `HH:MM` 00:00–23:59, no crossing midnight. Same-day blocks must not overlap; touching is allowed.
- Backend must import runtime values from shared via a relative path ending in `.js` (e.g. `'../../../shared/src/instructorRent.js'`). `import type … from 'shared'` is fine. Never `import { value } from 'shared'` in backend `src/` (crashes in production).
- Frontend imports from `'shared'` (alias).
- Validation messages (exact strings): `Invalid time format (HH:MM)`, `Start must be before end`, `Break start must be before break end`, `Break must be within the time block`, `Breaks must not overlap`, `Time blocks on the same day must not overlap`, `Invalid weekday`, `Hourly rate must be greater than 0`, `Months must be a whole number of at least 1`, `Weeks per month must be greater than 0`.
- HTTP errors (exact strings): `Recipient is required`, `Recipient not found`, `Recipient already has an instructor` (409), `Instructor not found` (404), `Invalid request body` (400), `Recipient name is required` (400).
- Invoice prefill title: `Raummiete`. Line text: `Raummiete {M} (… h/Woche × … Wochen × {M} × … €)` where `{M}` is `1 Monat` or `N Monate`.
- Do not refactor `InvoiceFormView.vue` beyond the additive prefill branch (merge-conflict avoidance with the drafts branch).
- Commit messages: conventional commits (`feat:`, `test:`, `chore:`, `docs:`), ending with the line `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **Malformed request bodies** (e.g. `timeBlocks` missing or not an array, a break without `end`, `hourlyRateCents: "12"`) → `400 { error: 'Invalid request body' }`, never a 500 or a hanging request. Test: Task 5.
2. **Non-numeric or unknown ids** (`/api/instructor/abc`, `/api/instructor/999/invoice-prefill`, `DELETE /api/instructor/abc`) → `404 Instructor not found`. Test: Tasks 5 and 6.
3. **Reassigning an instructor to a recipient that already has one** (PUT with the other recipient's id and edited `recipientData`) → `409`, and the other recipient's name is **not** changed (transaction rolled back). Test: Task 5.
4. **German decimal input in the form** (`12,50` €) → `1250` cents, and empty / garbage input → validation error rather than `NaN` reaching the API. Test: Tasks 7 and 10.
5. **Corrupt or empty `instructorWeeksPerMonth` row** (e.g. value `''` or `'abc'`) → falls back to `3.25` instead of producing `NaN` totals. Test: Task 4.

---

## File Structure

| File                                                                              | Responsibility                                                                                                    |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `shared/package.json`, `shared/tsconfig.json`                                     | Make `shared` an ES module package so its compiled output runs inside `backend/dist`                              |
| `shared/src/instructorRent.ts`                                                    | Types, constants, `blockNetMinutes`, `calculateInstructorRent`, `validateInstructorRent`, `validateWeeksPerMonth` |
| `shared/src/index.ts`                                                             | Re-export `instructorRent.ts`; add DTOs                                                                           |
| `backend/prisma/schema.prisma` + migration                                        | `Instructor` model                                                                                                |
| `backend/src/services/instructorRent.ts`                                          | Pure backend helpers: body parsing, DTO mapping, weeks-per-month parsing, invoice prefill text                    |
| `backend/src/routes/instructor.ts`                                                | Express router `/api/instructor` (DB access, HTTP)                                                                |
| `backend/src/routes/index.ts`                                                     | Mount router; e2e reset deletes instructors                                                                       |
| `backend/src/__tests__/unit/instructorRent.test.ts`                               | Shared calc + validation unit tests                                                                               |
| `backend/src/__tests__/unit/instructorRentService.test.ts`                        | Backend service unit tests                                                                                        |
| `backend/src/__tests__/integration/instructor.test.ts`                            | Endpoint integration tests                                                                                        |
| `backend/src/__tests__/integration/helpers.ts`                                    | `cleanDatabase` deletes instructors first                                                                         |
| `frontend/src/utils/format.ts`                                                    | `formatCents`, `formatHours`, `parseEuroToCents`, `centsToEuroInput`                                              |
| `frontend/src/utils/recipientForm.ts`                                             | `RecipientFormValue` type + helpers                                                                               |
| `frontend/src/components/RecipientPicker.vue`                                     | Search/select/create/edit recipient (v-model `RecipientFormValue`)                                                |
| `frontend/src/components/WeeklySchedule.vue`                                      | Mo–So block/break editor (v-model `TimeBlock[]`, prop `issues`)                                                   |
| `frontend/src/views/InstructorView.vue`                                           | List, totals, weeks-per-month setting, create invoice                                                             |
| `frontend/src/views/InstructorFormView.vue`                                       | Create/edit instructor, live summary                                                                              |
| `frontend/src/views/InvoiceFormView.vue`                                          | Additive `?fromInstructor=` prefill                                                                               |
| `frontend/src/router/index.ts`, `components/AppSidebar.vue`, `views/HomeView.vue` | Navigation                                                                                                        |

---

### Task 1: Shared ES module + rent calculation

**Files:**

- Modify: `shared/package.json`
- Modify: `shared/tsconfig.json`
- Create: `shared/src/instructorRent.ts`
- Modify: `shared/src/index.ts` (append at end)
- Test: `backend/src/__tests__/unit/instructorRent.test.ts`

**Interfaces:**

- Consumes: nothing
- Produces (exported from `shared/src/instructorRent.ts`, re-exported by `shared`):
  - `type Weekday = 'MO' | 'DI' | 'MI' | 'DO' | 'FR' | 'SA' | 'SO'`
  - `const WEEKDAYS: readonly Weekday[]`
  - `const DEFAULT_WEEKS_PER_MONTH = 3.25`
  - `interface TimeRange { start: string; end: string }`
  - `interface TimeBlock extends TimeRange { weekday: Weekday; breaks: TimeRange[] }`
  - `interface InstructorRentInputs { hourlyRateCents: number; months: number; timeBlocks: TimeBlock[] }`
  - `interface InstructorRentResult { netMinutesPerWeek: number; monthlyCents: number; totalCents: number }`
  - `function isValidTime(value: string): boolean`
  - `function toMinutes(time: string): number`
  - `function blockNetMinutes(block: TimeBlock): number`
  - `function calculateInstructorRent(inputs: InstructorRentInputs, weeksPerMonth: number): InstructorRentResult`

- [ ] **Step 1: Write the failing test**

Create `backend/src/__tests__/unit/instructorRent.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  blockNetMinutes,
  calculateInstructorRent,
  DEFAULT_WEEKS_PER_MONTH,
  type TimeBlock,
  WEEKDAYS,
} from '../../../../shared/src/instructorRent';

function block(
  weekday: TimeBlock['weekday'],
  start: string,
  end: string,
  breaks: [string, string][] = [],
): TimeBlock {
  return { weekday, start, end, breaks: breaks.map(([s, e]) => ({ start: s, end: e })) };
}

describe('constants', () => {
  it('lists weekdays Monday to Sunday', () => {
    expect(WEEKDAYS).toEqual(['MO', 'DI', 'MI', 'DO', 'FR', 'SA', 'SO']);
  });

  it('defaults to 3.25 weeks per month', () => {
    expect(DEFAULT_WEEKS_PER_MONTH).toBe(3.25);
  });
});

describe('blockNetMinutes', () => {
  it('returns the block length when there are no breaks', () => {
    expect(blockNetMinutes(block('MO', '08:00', '12:00'))).toBe(240);
  });

  it('subtracts every break', () => {
    expect(
      blockNetMinutes(
        block('MO', '08:00', '16:00', [
          ['10:00', '10:15'],
          ['12:00', '12:45'],
        ]),
      ),
    ).toBe(420);
  });
});

describe('calculateInstructorRent', () => {
  it('sums net minutes across blocks and weekdays', () => {
    const result = calculateInstructorRent(
      {
        hourlyRateCents: 1200,
        months: 6,
        timeBlocks: [
          block('MO', '14:00', '18:00', [['16:00', '16:30']]),
          block('DO', '09:00', '13:00'),
        ],
      },
      3.25,
    );
    expect(result).toEqual({ netMinutesPerWeek: 450, monthlyCents: 29250, totalCents: 175500 });
  });

  it('returns zero for an empty schedule', () => {
    expect(
      calculateInstructorRent({ hourlyRateCents: 1200, months: 3, timeBlocks: [] }, 3.25),
    ).toEqual({ netMinutesPerWeek: 0, monthlyCents: 0, totalCents: 0 });
  });

  it('rounds only once at the end', () => {
    const result = calculateInstructorRent(
      { hourlyRateCents: 1234, months: 6, timeBlocks: [block('MO', '08:00', '15:30')] },
      3.25,
    );
    expect(result.netMinutesPerWeek).toBe(450);
    expect(result.monthlyCents).toBe(30079); // 30078.75
    expect(result.totalCents).toBe(180473); // 180472.5 — not 30079 × 6 = 180474
  });

  it('uses the given weeks per month', () => {
    const result = calculateInstructorRent(
      { hourlyRateCents: 1000, months: 2, timeBlocks: [block('SA', '10:00', '11:00')] },
      4,
    );
    expect(result.monthlyCents).toBe(4000);
    expect(result.totalCents).toBe(8000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit --workspace=backend -- instructorRent`
Expected: FAIL — cannot resolve `../../../../shared/src/instructorRent`.

- [ ] **Step 3: Make `shared` an ES module package**

Why: the backend build compiles shared source into `backend/dist/shared/src/`. Its nearest `package.json` at runtime is `backend/package.json` (`"type": "module"`), so the emitted file must be ESM. Without `"type": "module"` in `shared/package.json`, `tsc` emits CommonJS there and the production server crashes on load (verified by probe during planning).

`shared/package.json` — add `"type": "module"` after `"version"`:

```json
{
  "name": "shared",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "build": "tsc"
  },
  "devDependencies": {
    "typescript": "^5.5.0"
  }
}
```

`shared/tsconfig.json` — change `module` and `moduleResolution`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "declaration": true,
    "declarationMap": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Write the calculation module**

Create `shared/src/instructorRent.ts`:

```ts
export type Weekday = 'MO' | 'DI' | 'MI' | 'DO' | 'FR' | 'SA' | 'SO';

export const WEEKDAYS: readonly Weekday[] = ['MO', 'DI', 'MI', 'DO', 'FR', 'SA', 'SO'];

export const DEFAULT_WEEKS_PER_MONTH = 3.25;

export interface TimeRange {
  start: string; // "HH:MM"
  end: string; // "HH:MM"
}

export interface TimeBlock extends TimeRange {
  weekday: Weekday;
  breaks: TimeRange[];
}

export interface InstructorRentInputs {
  hourlyRateCents: number;
  months: number;
  timeBlocks: TimeBlock[];
}

export interface InstructorRentResult {
  netMinutesPerWeek: number;
  monthlyCents: number;
  totalCents: number;
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidTime(value: string): boolean {
  return TIME_PATTERN.test(value);
}

export function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function rangeMinutes(range: TimeRange): number {
  return toMinutes(range.end) - toMinutes(range.start);
}

export function blockNetMinutes(block: TimeBlock): number {
  const breakMinutes = block.breaks.reduce((sum, b) => sum + rangeMinutes(b), 0);
  return rangeMinutes(block) - breakMinutes;
}

/** Rounds once at the end so totalCents is exact, not monthlyCents × months. */
export function calculateInstructorRent(
  inputs: InstructorRentInputs,
  weeksPerMonth: number,
): InstructorRentResult {
  const netMinutesPerWeek = inputs.timeBlocks.reduce((sum, b) => sum + blockNetMinutes(b), 0);
  const monthlyCentsExact = (netMinutesPerWeek * inputs.hourlyRateCents * weeksPerMonth) / 60;
  const totalCentsExact =
    (netMinutesPerWeek * inputs.hourlyRateCents * weeksPerMonth * inputs.months) / 60;
  return {
    netMinutesPerWeek,
    monthlyCents: Math.round(monthlyCentsExact),
    totalCents: Math.round(totalCentsExact),
  };
}
```

Append to the end of `shared/src/index.ts`:

```ts
export * from './instructorRent.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:unit --workspace=backend -- instructorRent`
Expected: PASS (8 tests).

- [ ] **Step 6: Verify the module change did not break any workspace**

Run: `npm run typecheck && npm run build --workspace=shared && npm run build --workspace=frontend`
Expected: all succeed. (Vite and vue-tsc resolve `./instructorRent.js` to the `.ts` file.)

Run: `grep -rn "from 'shared'" backend/src | grep -v "import type"`
Expected: no output (backend only has type imports from `shared`).

- [ ] **Step 7: Full verification and commit**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS.

```bash
git add shared/package.json shared/tsconfig.json shared/src/instructorRent.ts shared/src/index.ts backend/src/__tests__/unit/instructorRent.test.ts
git commit -m "feat: add shared instructor rent calculation

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Shared validation

**Files:**

- Modify: `shared/src/instructorRent.ts` (append)
- Test: `backend/src/__tests__/unit/instructorRent.test.ts` (append)

**Interfaces:**

- Consumes: Task 1 types, `isValidTime`, `toMinutes`, `WEEKDAYS`
- Produces:
  - `interface ValidationIssue { path: string; message: string }`
  - `function validateInstructorRent(inputs: InstructorRentInputs): ValidationIssue[]`
  - `function validateWeeksPerMonth(value: number): string | null`
- Issue paths (exact):
  - `hourlyRateCents`, `months`
  - `timeBlocks.{i}.weekday`, `timeBlocks.{i}.start`, `timeBlocks.{i}.end` (format), `timeBlocks.{i}` (order, same-day overlap — reported on the later index)
  - `timeBlocks.{i}.breaks.{j}.start`, `….end` (format), `timeBlocks.{i}.breaks.{j}` (order, outside block, overlap — reported on the later index)
- Range/overlap checks are skipped for a block or break whose own format/order is invalid. Break checks are skipped if the parent block is invalid.

- [ ] **Step 1: Write the failing tests**

Append to `backend/src/__tests__/unit/instructorRent.test.ts`. First extend the import at the top of the file to:

```ts
import {
  blockNetMinutes,
  calculateInstructorRent,
  DEFAULT_WEEKS_PER_MONTH,
  type InstructorRentInputs,
  type TimeBlock,
  validateInstructorRent,
  validateWeeksPerMonth,
  WEEKDAYS,
} from '../../../../shared/src/instructorRent';
```

Then append:

```ts
function inputs(timeBlocks: TimeBlock[], overrides: Partial<InstructorRentInputs> = {}) {
  return { hourlyRateCents: 1200, months: 6, timeBlocks, ...overrides };
}

describe('validateInstructorRent', () => {
  it('accepts a valid schedule', () => {
    expect(
      validateInstructorRent(inputs([block('MO', '08:00', '12:00', [['10:00', '10:15']])])),
    ).toEqual([]);
  });

  it('accepts an empty schedule', () => {
    expect(validateInstructorRent(inputs([]))).toEqual([]);
  });

  it('accepts touching blocks and touching breaks', () => {
    expect(
      validateInstructorRent(
        inputs([
          block('MO', '08:00', '10:00', [
            ['08:00', '08:30'],
            ['08:30', '09:00'],
          ]),
          block('MO', '10:00', '12:00'),
        ]),
      ),
    ).toEqual([]);
  });

  it('allows the same times on different weekdays', () => {
    expect(
      validateInstructorRent(
        inputs([block('MO', '08:00', '12:00'), block('DI', '08:00', '12:00')]),
      ),
    ).toEqual([]);
  });

  it.each([
    ['8:00', '12:00', 'timeBlocks.0.start'],
    ['08:00', '24:00', 'timeBlocks.0.end'],
    ['', '12:00', 'timeBlocks.0.start'],
    ['08:60', '12:00', 'timeBlocks.0.start'],
  ])('rejects invalid time format %s–%s', (start, end, path) => {
    expect(validateInstructorRent(inputs([block('MO', start, end)]))).toEqual([
      { path, message: 'Invalid time format (HH:MM)' },
    ]);
  });

  it('rejects a block whose start is not before its end', () => {
    expect(validateInstructorRent(inputs([block('MO', '12:00', '12:00')]))).toEqual([
      { path: 'timeBlocks.0', message: 'Start must be before end' },
    ]);
  });

  it('rejects an unknown weekday', () => {
    const bad = { ...block('MO', '08:00', '09:00'), weekday: 'XX' } as unknown as TimeBlock;
    expect(validateInstructorRent(inputs([bad]))).toEqual([
      { path: 'timeBlocks.0.weekday', message: 'Invalid weekday' },
    ]);
  });

  it('rejects an invalid break time format', () => {
    expect(
      validateInstructorRent(inputs([block('MO', '08:00', '12:00', [['10:00', '']])])),
    ).toEqual([{ path: 'timeBlocks.0.breaks.0.end', message: 'Invalid time format (HH:MM)' }]);
  });

  it('rejects a break whose start is not before its end', () => {
    expect(
      validateInstructorRent(inputs([block('MO', '08:00', '12:00', [['10:30', '10:00']])])),
    ).toEqual([{ path: 'timeBlocks.0.breaks.0', message: 'Break start must be before break end' }]);
  });

  it('rejects a break outside its block', () => {
    expect(
      validateInstructorRent(inputs([block('MO', '08:00', '12:00', [['11:45', '12:15']])])),
    ).toEqual([{ path: 'timeBlocks.0.breaks.0', message: 'Break must be within the time block' }]);
  });

  it('rejects overlapping breaks on the later break', () => {
    expect(
      validateInstructorRent(
        inputs([
          block('MO', '08:00', '12:00', [
            ['10:00', '10:30'],
            ['10:15', '10:45'],
          ]),
        ]),
      ),
    ).toEqual([{ path: 'timeBlocks.0.breaks.1', message: 'Breaks must not overlap' }]);
  });

  it('rejects overlapping blocks on the same day on the later block', () => {
    expect(
      validateInstructorRent(
        inputs([
          block('MO', '08:00', '12:00'),
          block('DI', '08:00', '12:00'),
          block('MO', '11:00', '13:00'),
        ]),
      ),
    ).toEqual([{ path: 'timeBlocks.2', message: 'Time blocks on the same day must not overlap' }]);
  });

  it.each([0, -100, 12.5, Number.NaN])('rejects hourly rate %s', (hourlyRateCents) => {
    expect(validateInstructorRent(inputs([], { hourlyRateCents }))).toEqual([
      { path: 'hourlyRateCents', message: 'Hourly rate must be greater than 0' },
    ]);
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects months %s', (months) => {
    expect(validateInstructorRent(inputs([], { months }))).toEqual([
      { path: 'months', message: 'Months must be a whole number of at least 1' },
    ]);
  });
});

describe('validateWeeksPerMonth', () => {
  it('accepts positive numbers', () => {
    expect(validateWeeksPerMonth(3.25)).toBeNull();
    expect(validateWeeksPerMonth(4)).toBeNull();
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('rejects %s', (value) => {
    expect(validateWeeksPerMonth(value)).toBe('Weeks per month must be greater than 0');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit --workspace=backend -- instructorRent`
Expected: FAIL — `validateInstructorRent` / `validateWeeksPerMonth` are not exported.

- [ ] **Step 3: Implement validation**

Append to `shared/src/instructorRent.ts`:

```ts
export interface ValidationIssue {
  path: string;
  message: string;
}

const INVALID_TIME = 'Invalid time format (HH:MM)';

function overlaps(a: TimeRange, b: TimeRange): boolean {
  return toMinutes(a.start) < toMinutes(b.end) && toMinutes(b.start) < toMinutes(a.end);
}

function rangeIssues(range: TimeRange, path: string, orderMessage: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isValidTime(range.start)) issues.push({ path: `${path}.start`, message: INVALID_TIME });
  if (!isValidTime(range.end)) issues.push({ path: `${path}.end`, message: INVALID_TIME });
  if (issues.length === 0 && toMinutes(range.start) >= toMinutes(range.end)) {
    issues.push({ path, message: orderMessage });
  }
  return issues;
}

function breakIssues(block: TimeBlock, blockPath: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const validBreaks: TimeRange[] = [];
  block.breaks.forEach((brk, j) => {
    const path = `${blockPath}.breaks.${j}`;
    const own = rangeIssues(brk, path, 'Break start must be before break end');
    if (own.length > 0) {
      issues.push(...own);
      return;
    }
    if (
      toMinutes(brk.start) < toMinutes(block.start) ||
      toMinutes(brk.end) > toMinutes(block.end)
    ) {
      issues.push({ path, message: 'Break must be within the time block' });
      return;
    }
    if (validBreaks.some((other) => overlaps(other, brk))) {
      issues.push({ path, message: 'Breaks must not overlap' });
      return;
    }
    validBreaks.push(brk);
  });
  return issues;
}

export function validateInstructorRent(inputs: InstructorRentInputs): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!Number.isInteger(inputs.hourlyRateCents) || inputs.hourlyRateCents <= 0) {
    issues.push({ path: 'hourlyRateCents', message: 'Hourly rate must be greater than 0' });
  }
  if (!Number.isInteger(inputs.months) || inputs.months < 1) {
    issues.push({ path: 'months', message: 'Months must be a whole number of at least 1' });
  }

  const validBlocks: { index: number; block: TimeBlock }[] = [];
  inputs.timeBlocks.forEach((block, i) => {
    const path = `timeBlocks.${i}`;
    if (!WEEKDAYS.includes(block.weekday)) {
      issues.push({ path: `${path}.weekday`, message: 'Invalid weekday' });
    }
    const own = rangeIssues(block, path, 'Start must be before end');
    if (own.length > 0) {
      issues.push(...own);
      return;
    }
    issues.push(...breakIssues(block, path));
    validBlocks.push({ index: i, block });
  });

  validBlocks.forEach(({ index, block }, k) => {
    const clash = validBlocks
      .slice(0, k)
      .some((other) => other.block.weekday === block.weekday && overlaps(other.block, block));
    if (clash) {
      issues.push({
        path: `timeBlocks.${index}`,
        message: 'Time blocks on the same day must not overlap',
      });
    }
  });

  return issues;
}

export function validateWeeksPerMonth(value: number): string | null {
  return Number.isFinite(value) && value > 0 ? null : 'Weeks per month must be greater than 0';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit --workspace=backend -- instructorRent`
Expected: PASS.

- [ ] **Step 5: Full verification and commit**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS.

```bash
git add shared/src/instructorRent.ts backend/src/__tests__/unit/instructorRent.test.ts
git commit -m "feat: add shared instructor rent validation

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `Instructor` model, migration, DTOs, test cleanup

**Files:**

- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<timestamp>_add_instructor/migration.sql` (generated)
- Modify: `shared/src/index.ts` (append DTOs)
- Modify: `backend/src/__tests__/integration/helpers.ts`
- Modify: `backend/src/routes/index.ts` (e2e reset only)
- Test: `backend/src/__tests__/integration/instructor.test.ts` (new)

**Interfaces:**

- Consumes: `TimeBlock`, `InstructorRentResult` from Task 1
- Produces:
  - Prisma: `prisma.instructor` with fields `id, recipientId (unique), hourlyRateCents, months, timeBlocks (string), createdAt, updatedAt`, relation `recipient`; `InvoiceRecipient.instructor`
  - DTOs in `shared`: `InstructorDto`, `InstructorListItemDto`, `InstructorSettingsDto`, `InstructorInvoicePrefillDto` (definitions below)

- [ ] **Step 1: Write the failing test**

Create `backend/src/__tests__/integration/instructor.test.ts`:

```ts
import supertest from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { initializeApp } from '../../init';
import { prisma } from '../../prismaClient';
import { cleanDatabase, useCleanDatabase } from './helpers';

let request: ReturnType<typeof supertest>;

beforeAll(async () => {
  await initializeApp();
  request = supertest(createApp());
});

useCleanDatabase();

async function createRecipient(name = 'Anna Alt') {
  return prisma.invoiceRecipient.create({
    data: { name, street: 'Hauptstr. 1', city: '12345 Berlin', email: null, salutation: null },
  });
}

describe('Instructor model', () => {
  it('cleanDatabase removes instructors before their recipients', async () => {
    const recipient = await createRecipient();
    await prisma.instructor.create({
      data: { recipientId: recipient.id, hourlyRateCents: 1200, months: 6, timeBlocks: '[]' },
    });

    await cleanDatabase();

    expect(await prisma.instructor.count()).toBe(0);
    expect(await prisma.invoiceRecipient.count()).toBe(0);
  });

  it('allows only one instructor per recipient', async () => {
    const recipient = await createRecipient();
    const data = { recipientId: recipient.id, hourlyRateCents: 1200, months: 6, timeBlocks: '[]' };
    await prisma.instructor.create({ data });
    await expect(prisma.instructor.create({ data })).rejects.toThrow();
  });
});

describe('POST /api/e2e/reset', () => {
  it('succeeds when instructors exist', async () => {
    const recipient = await createRecipient();
    await prisma.instructor.create({
      data: { recipientId: recipient.id, hourlyRateCents: 1200, months: 6, timeBlocks: '[]' },
    });

    const res = await request.post('/api/e2e/reset');

    expect(res.status).toBe(200);
    expect(await prisma.instructor.count()).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:integration --workspace=backend -- instructor`
Expected: FAIL — TypeScript/runtime error: `prisma.instructor` is undefined.

- [ ] **Step 3: Add the Prisma model**

In `backend/prisma/schema.prisma`, add the back-relation line to `InvoiceRecipient` (after `invoices  Invoice[]`):

```prisma
  instructor Instructor?
```

Append the new model at the end of the file:

```prisma
model Instructor {
  id              Int              @id @default(autoincrement())
  recipientId     Int              @unique
  recipient       InvoiceRecipient @relation(fields: [recipientId], references: [id])
  hourlyRateCents Int
  months          Int
  timeBlocks      String           // JSON: TimeBlock[]
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt
}
```

- [ ] **Step 4: Generate the migration against a throwaway database**

Run (from the worktree root; uses a scratch DB, never `dev-data`):

```bash
cd backend && DATABASE_URL="file:/tmp/instructor-migrate.sqlite" npx prisma migrate dev --name add_instructor && cd .. && rm -f /tmp/instructor-migrate.sqlite
```

Expected: new folder `backend/prisma/migrations/<timestamp>_add_instructor/` with `migration.sql` equivalent to:

```sql
-- CreateTable
CREATE TABLE "Instructor" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "recipientId" INTEGER NOT NULL,
    "hourlyRateCents" INTEGER NOT NULL,
    "months" INTEGER NOT NULL,
    "timeBlocks" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Instructor_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "InvoiceRecipient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Instructor_recipientId_key" ON "Instructor"("recipientId");
```

If the generated SQL contains anything else (e.g. table redefinitions), stop and report — the schema drifted.

- [ ] **Step 5: Delete instructors before recipients in cleanup paths**

`backend/src/__tests__/integration/helpers.ts` — in `cleanDatabase`, insert as the **first** line of the function body:

```ts
await prisma.instructor.deleteMany();
```

`backend/src/routes/index.ts` — in the `/e2e/reset` handler, insert as the **first** line inside `try {`:

```ts
await prisma.instructor.deleteMany();
```

- [ ] **Step 6: Add DTOs to shared**

Append to `shared/src/index.ts` (after the `export * from './instructorRent.js';` line):

```ts
import type { InstructorRentResult, TimeBlock } from './instructorRent.js';

export interface InstructorDto {
  id: number;
  recipient: InvoiceRecipientDto;
  hourlyRateCents: number;
  months: number;
  timeBlocks: TimeBlock[];
  calculation: InstructorRentResult;
  createdAt: string;
  updatedAt: string;
}

export interface InstructorListItemDto {
  id: number;
  name: string;
  hourlyRateCents: number;
  months: number;
  calculation: InstructorRentResult;
}

export interface InstructorSettingsDto {
  weeksPerMonth: number;
}

export interface InstructorInvoicePrefillDto {
  recipient: InvoiceRecipientDto;
  title: string;
  lineItems: InvoiceLineItem[];
}
```

If ESLint's `import/first`-style rules or prettier complain about the `import type` placement, move the `import type` line to the top of the file instead.

- [ ] **Step 7: Run test to verify it passes**

Run: `npm run test:integration --workspace=backend -- instructor`
Expected: PASS (3 tests).

- [ ] **Step 8: Full verification and commit**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS.

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations shared/src/index.ts backend/src/__tests__/integration/helpers.ts backend/src/__tests__/integration/instructor.test.ts backend/src/routes/index.ts
git commit -m "feat: add Instructor model and DTOs

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Backend service + settings endpoints

**Files:**

- Create: `backend/src/services/instructorRent.ts`
- Create: `backend/src/routes/instructor.ts`
- Modify: `backend/src/routes/index.ts` (import + mount)
- Test: `backend/src/__tests__/unit/instructorRentService.test.ts`
- Test: `backend/src/__tests__/integration/instructor.test.ts` (append)

**Interfaces:**

- Consumes: Task 1/2 shared functions (relative import), Task 3 DTOs and Prisma model
- Produces (from `backend/src/services/instructorRent.ts`):
  - `const WEEKS_PER_MONTH_KEY = 'instructorWeeksPerMonth'`
  - `function parseWeeksPerMonth(value: string | undefined): number`
  - `instructorRouter` exported from `backend/src/routes/instructor.ts`, mounted at `/api/instructor`
  - `async function getWeeksPerMonth(): Promise<number>` (inside the router file, not exported)

- [ ] **Step 1: Write the failing unit test**

Create `backend/src/__tests__/unit/instructorRentService.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseWeeksPerMonth } from '../../services/instructorRent';

describe('parseWeeksPerMonth', () => {
  it('parses a stored positive number', () => {
    expect(parseWeeksPerMonth('4.5')).toBe(4.5);
  });

  it.each([undefined, '', 'abc', '0', '-2'])('falls back to 3.25 for %s', (value) => {
    expect(parseWeeksPerMonth(value)).toBe(3.25);
  });
});
```

- [ ] **Step 2: Write the failing integration tests**

Append to `backend/src/__tests__/integration/instructor.test.ts`:

```ts
describe('GET /api/instructor/settings', () => {
  it('returns the default of 3.25 when nothing is stored', async () => {
    const res = await request.get('/api/instructor/settings');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ weeksPerMonth: 3.25 });
  });

  it.each(['', 'abc'])('falls back to 3.25 for a corrupt stored value %j', async (value) => {
    await prisma.systemSetting.create({ data: { key: 'instructorWeeksPerMonth', value } });
    const res = await request.get('/api/instructor/settings');
    expect(res.body).toEqual({ weeksPerMonth: 3.25 });
  });
});

describe('PUT /api/instructor/settings', () => {
  it('stores the value and returns it', async () => {
    const res = await request.put('/api/instructor/settings').send({ weeksPerMonth: 4.33 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ weeksPerMonth: 4.33 });
    const row = await prisma.systemSetting.findUnique({
      where: { key: 'instructorWeeksPerMonth' },
    });
    expect(row?.value).toBe('4.33');
    expect((await request.get('/api/instructor/settings')).body).toEqual({ weeksPerMonth: 4.33 });
  });

  it.each([0, -1, '3.25', null])('rejects %j', async (weeksPerMonth) => {
    const res = await request.put('/api/instructor/settings').send({ weeksPerMonth });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Weeks per month must be greater than 0' });
  });

  it('does not expose the setting through the donation receipt settings', async () => {
    await request.put('/api/instructor/settings').send({ weeksPerMonth: 4 });
    const res = await request.get('/api/settings');
    expect(res.body).not.toHaveProperty('instructorWeeksPerMonth');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test:unit --workspace=backend -- instructorRentService && npm run test:integration --workspace=backend -- instructor`
Expected: unit FAIL (module not found); integration FAIL (404 for `/api/instructor/settings`).

- [ ] **Step 4: Create the service module**

Create `backend/src/services/instructorRent.ts`:

```ts
import { DEFAULT_WEEKS_PER_MONTH } from '../../../shared/src/instructorRent.js';

export const WEEKS_PER_MONTH_KEY = 'instructorWeeksPerMonth';

export function parseWeeksPerMonth(value: string | undefined): number {
  const parsed = value === undefined || value.trim() === '' ? Number.NaN : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_WEEKS_PER_MONTH;
}
```

- [ ] **Step 5: Create the router with settings endpoints**

Create `backend/src/routes/instructor.ts`:

```ts
import { Router } from 'express';
import type { InstructorSettingsDto } from 'shared';
import { validateWeeksPerMonth } from '../../../shared/src/instructorRent.js';
import { prisma } from '../prismaClient.js';
import { parseWeeksPerMonth, WEEKS_PER_MONTH_KEY } from '../services/instructorRent.js';

export const instructorRouter = Router();

async function getWeeksPerMonth(): Promise<number> {
  const row = await prisma.systemSetting.findUnique({ where: { key: WEEKS_PER_MONTH_KEY } });
  return parseWeeksPerMonth(row?.value);
}

// GET /api/instructor/settings
instructorRouter.get('/settings', async (_req, res) => {
  const dto: InstructorSettingsDto = { weeksPerMonth: await getWeeksPerMonth() };
  res.json(dto);
});

// PUT /api/instructor/settings
instructorRouter.put('/settings', async (req, res) => {
  const { weeksPerMonth } = req.body as { weeksPerMonth?: unknown };
  if (typeof weeksPerMonth !== 'number' || validateWeeksPerMonth(weeksPerMonth)) {
    res.status(400).json({ error: 'Weeks per month must be greater than 0' });
    return;
  }
  await prisma.systemSetting.upsert({
    where: { key: WEEKS_PER_MONTH_KEY },
    update: { value: String(weeksPerMonth) },
    create: { key: WEEKS_PER_MONTH_KEY, value: String(weeksPerMonth) },
  });
  const dto: InstructorSettingsDto = { weeksPerMonth };
  res.json(dto);
});
```

In `backend/src/routes/index.ts` add the import (keep imports alphabetical):

```ts
import { instructorRouter } from './instructor.js';
```

and mount it after the `invoice-recipient` line:

```ts
router.use('/instructor', instructorRouter);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test:unit --workspace=backend -- instructorRentService && npm run test:integration --workspace=backend -- instructor`
Expected: PASS.

- [ ] **Step 7: Full verification and commit**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS.

```bash
git add backend/src/services/instructorRent.ts backend/src/routes/instructor.ts backend/src/routes/index.ts backend/src/__tests__/unit/instructorRentService.test.ts backend/src/__tests__/integration/instructor.test.ts
git commit -m "feat: add instructor weeks-per-month settings endpoints

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Instructor CRUD endpoints

**Files:**

- Modify: `backend/src/services/instructorRent.ts` (append)
- Modify: `backend/src/routes/instructor.ts` (append)
- Test: `backend/src/__tests__/unit/instructorRentService.test.ts` (append)
- Test: `backend/src/__tests__/integration/instructor.test.ts` (append)

**Interfaces:**

- Consumes: `validateInstructorRent`, `calculateInstructorRent` (shared, relative import); DTOs; `getWeeksPerMonth` (router file)
- Produces (service):
  - `interface RecipientData { name: string; street: string; city: string; email: string | null; salutation: string | null }`
  - `interface InstructorSaveBody { recipientId?: number; recipientData?: RecipientData; inputs: InstructorRentInputs }`
  - `function parseInstructorSaveBody(body: unknown): InstructorSaveBody | { error: string }`
  - `interface InstructorRow` (Prisma instructor row with `recipient` included)
  - `function toRecipientDto(recipient: InstructorRow['recipient']): InvoiceRecipientDto`
  - `function toInputs(row: InstructorRow): InstructorRentInputs`
  - `function toInstructorDto(row: InstructorRow, weeksPerMonth: number): InstructorDto`
  - `function toListItem(row: InstructorRow, weeksPerMonth: number): InstructorListItemDto`
- Produces (HTTP): `GET /api/instructor`, `GET /api/instructor/:id`, `POST /api/instructor`, `PUT /api/instructor/:id`, `DELETE /api/instructor/:id`
- Request body for POST/PUT: `{ recipientId?: number; recipientData?: { name, street, city, email?, salutation? }; hourlyRateCents: number; months: number; timeBlocks: TimeBlock[] }`

- [ ] **Step 1: Write the failing unit tests**

Append to `backend/src/__tests__/unit/instructorRentService.test.ts` (and extend its import to `import { parseInstructorSaveBody, parseWeeksPerMonth } from '../../services/instructorRent';`):

```ts
const validBody = {
  recipientData: { name: 'Anna Alt', street: 'Hauptstr. 1', city: '12345 Berlin' },
  hourlyRateCents: 1200,
  months: 6,
  timeBlocks: [
    { weekday: 'MO', start: '14:00', end: '18:00', breaks: [{ start: '16:00', end: '16:30' }] },
  ],
};

describe('parseInstructorSaveBody', () => {
  it('parses a valid body', () => {
    expect(parseInstructorSaveBody(validBody)).toEqual({
      recipientId: undefined,
      recipientData: {
        name: 'Anna Alt',
        street: 'Hauptstr. 1',
        city: '12345 Berlin',
        email: null,
        salutation: null,
      },
      inputs: {
        hourlyRateCents: 1200,
        months: 6,
        timeBlocks: validBody.timeBlocks,
      },
    });
  });

  it('keeps a numeric recipientId', () => {
    const parsed = parseInstructorSaveBody({ ...validBody, recipientId: 7 });
    expect(parsed).toMatchObject({ recipientId: 7 });
  });

  it.each([
    ['null body', null],
    ['missing timeBlocks', { ...validBody, timeBlocks: undefined }],
    ['timeBlocks not an array', { ...validBody, timeBlocks: 'MO 8-12' }],
    ['rate as string', { ...validBody, hourlyRateCents: '1200' }],
    [
      'break without end',
      {
        ...validBody,
        timeBlocks: [{ weekday: 'MO', start: '08:00', end: '12:00', breaks: [{ start: '10:00' }] }],
      },
    ],
    [
      'block without breaks array',
      { ...validBody, timeBlocks: [{ weekday: 'MO', start: '08:00', end: '12:00' }] },
    ],
    ['recipientId as string', { ...validBody, recipientId: '7' }],
    ['recipientData without city', { ...validBody, recipientData: { name: 'A', street: 'B' } }],
  ])('rejects %s', (_label, body) => {
    expect(parseInstructorSaveBody(body)).toEqual({ error: 'Invalid request body' });
  });

  it('rejects a blank recipient name', () => {
    expect(
      parseInstructorSaveBody({
        ...validBody,
        recipientData: { ...validBody.recipientData, name: '  ' },
      }),
    ).toEqual({ error: 'Recipient name is required' });
  });
});
```

- [ ] **Step 2: Write the failing integration tests**

Append to `backend/src/__tests__/integration/instructor.test.ts`:

```ts
const schedule = [
  { weekday: 'MO', start: '14:00', end: '18:00', breaks: [{ start: '16:00', end: '16:30' }] },
  { weekday: 'DO', start: '09:00', end: '13:00', breaks: [] },
];

function newInstructorBody(name = 'Anna Alt') {
  return {
    recipientData: { name, street: 'Hauptstr. 1', city: '12345 Berlin', email: 'anna@example.org' },
    hourlyRateCents: 1200,
    months: 6,
    timeBlocks: schedule,
  };
}

describe('POST /api/instructor', () => {
  it('creates a new recipient from recipientData', async () => {
    const res = await request.post('/api/instructor').send(newInstructorBody());

    expect(res.status).toBe(201);
    const instructor = await prisma.instructor.findUnique({
      where: { id: res.body.id },
      include: { recipient: true },
    });
    expect(instructor?.recipient.name).toBe('Anna Alt');
    expect(instructor?.recipient.email).toBe('anna@example.org');
    expect(JSON.parse(instructor!.timeBlocks)).toEqual(schedule);
  });

  it('links an existing recipient and updates it in place', async () => {
    const recipient = await createRecipient('Old Name');

    const res = await request.post('/api/instructor').send({
      ...newInstructorBody('New Name'),
      recipientId: recipient.id,
    });

    expect(res.status).toBe(201);
    expect(await prisma.invoiceRecipient.count()).toBe(1);
    const updated = await prisma.invoiceRecipient.findUnique({ where: { id: recipient.id } });
    expect(updated?.name).toBe('New Name');
  });

  it('links an existing recipient without changes when recipientData is omitted', async () => {
    const recipient = await createRecipient('Keep Me');
    const body: Partial<ReturnType<typeof newInstructorBody>> = newInstructorBody();
    delete body.recipientData;

    const res = await request.post('/api/instructor').send({ ...body, recipientId: recipient.id });

    expect(res.status).toBe(201);
    const unchanged = await prisma.invoiceRecipient.findUnique({ where: { id: recipient.id } });
    expect(unchanged?.name).toBe('Keep Me');
  });

  it('returns 409 for a recipient that already has an instructor', async () => {
    const recipient = await createRecipient();
    await request
      .post('/api/instructor')
      .send({ ...newInstructorBody(), recipientId: recipient.id });

    const res = await request
      .post('/api/instructor')
      .send({ ...newInstructorBody(), recipientId: recipient.id });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Recipient already has an instructor' });
    expect(await prisma.instructor.count()).toBe(1);
  });

  it('returns 400 without any recipient', async () => {
    const body: Partial<ReturnType<typeof newInstructorBody>> = newInstructorBody();
    delete body.recipientData;
    const res = await request.post('/api/instructor').send(body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Recipient is required' });
  });

  it('returns 400 for an unknown recipientId', async () => {
    const res = await request
      .post('/api/instructor')
      .send({ ...newInstructorBody(), recipientId: 999 });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Recipient not found' });
  });

  it.each([
    [
      'overlapping blocks',
      {
        timeBlocks: [
          { weekday: 'MO', start: '08:00', end: '12:00', breaks: [] },
          { weekday: 'MO', start: '11:00', end: '13:00', breaks: [] },
        ],
      },
      'Time blocks on the same day must not overlap',
    ],
    ['fractional months', { months: 1.5 }, 'Months must be a whole number of at least 1'],
    ['zero rate', { hourlyRateCents: 0 }, 'Hourly rate must be greater than 0'],
  ])('returns 400 for %s and writes nothing', async (_label, override, error) => {
    const res = await request.post('/api/instructor').send({ ...newInstructorBody(), ...override });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error });
    expect(await prisma.instructor.count()).toBe(0);
    expect(await prisma.invoiceRecipient.count()).toBe(0);
  });

  it.each([
    ['timeBlocks missing', { timeBlocks: undefined }],
    ['timeBlocks not an array', { timeBlocks: 'Mo 8-12' }],
    ['rate as string', { hourlyRateCents: '12' }],
  ])('returns 400 Invalid request body for %s', async (_label, override) => {
    const res = await request.post('/api/instructor').send({ ...newInstructorBody(), ...override });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid request body' });
  });
});

describe('GET /api/instructor', () => {
  it('lists instructors sorted by name with calculation', async () => {
    await request.post('/api/instructor').send(newInstructorBody('Zora Zeh'));
    await request.post('/api/instructor').send(newInstructorBody('Anna Alt'));

    const res = await request.get('/api/instructor');

    expect(res.status).toBe(200);
    expect(res.body.map((i: { name: string }) => i.name)).toEqual(['Anna Alt', 'Zora Zeh']);
    expect(res.body[0]).toMatchObject({
      hourlyRateCents: 1200,
      months: 6,
      calculation: { netMinutesPerWeek: 450, monthlyCents: 29250, totalCents: 175500 },
    });
  });

  it('uses the current weeks-per-month setting', async () => {
    await request.post('/api/instructor').send(newInstructorBody());
    await request.put('/api/instructor/settings').send({ weeksPerMonth: 4 });

    const res = await request.get('/api/instructor');

    // 450 min × 1200 × 4 × 6 / 60
    expect(res.body[0].calculation.totalCents).toBe(216000);
  });
});

describe('GET /api/instructor/:id', () => {
  it('returns the instructor with recipient, schedule and calculation', async () => {
    const { body } = await request.post('/api/instructor').send(newInstructorBody());

    const res = await request.get(`/api/instructor/${body.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: body.id,
      recipient: { name: 'Anna Alt', street: 'Hauptstr. 1', city: '12345 Berlin' },
      hourlyRateCents: 1200,
      months: 6,
      timeBlocks: schedule,
      calculation: { totalCents: 175500 },
    });
  });

  it.each(['999', 'abc'])('returns 404 for id %s', async (id) => {
    const res = await request.get(`/api/instructor/${id}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Instructor not found' });
  });
});

describe('PUT /api/instructor/:id', () => {
  it('updates schedule, rate, months and the recipient in place', async () => {
    const { body } = await request.post('/api/instructor').send(newInstructorBody());
    const instructor = await prisma.instructor.findUnique({ where: { id: body.id } });

    const res = await request.put(`/api/instructor/${body.id}`).send({
      ...newInstructorBody('Anna Neu'),
      recipientId: instructor!.recipientId,
      hourlyRateCents: 1500,
      months: 3,
      timeBlocks: [{ weekday: 'FR', start: '10:00', end: '11:00', breaks: [] }],
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: body.id });
    const updated = await prisma.instructor.findUnique({
      where: { id: body.id },
      include: { recipient: true },
    });
    expect(updated).toMatchObject({ hourlyRateCents: 1500, months: 3 });
    expect(updated?.recipient.name).toBe('Anna Neu');
    expect(await prisma.invoiceRecipient.count()).toBe(1);
  });

  it('returns 409 and leaves the other recipient untouched when taking its recipient', async () => {
    const first = await request.post('/api/instructor').send(newInstructorBody('Anna Alt'));
    const second = await request.post('/api/instructor').send(newInstructorBody('Bernd Bach'));
    const firstRow = await prisma.instructor.findUnique({ where: { id: first.body.id } });

    const res = await request.put(`/api/instructor/${second.body.id}`).send({
      ...newInstructorBody('Hijacked'),
      recipientId: firstRow!.recipientId,
    });

    expect(res.status).toBe(409);
    const firstRecipient = await prisma.invoiceRecipient.findUnique({
      where: { id: firstRow!.recipientId },
    });
    expect(firstRecipient?.name).toBe('Anna Alt');
  });

  it.each(['999', 'abc'])('returns 404 for id %s', async (id) => {
    const res = await request.put(`/api/instructor/${id}`).send(newInstructorBody());
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Instructor not found' });
    expect(await prisma.invoiceRecipient.count()).toBe(0);
  });
});

describe('DELETE /api/instructor/:id', () => {
  it('deletes the instructor and keeps the recipient', async () => {
    const { body } = await request.post('/api/instructor').send(newInstructorBody());

    const res = await request.delete(`/api/instructor/${body.id}`);

    expect(res.status).toBe(204);
    expect(await prisma.instructor.count()).toBe(0);
    expect(await prisma.invoiceRecipient.count()).toBe(1);
  });

  it.each(['999', 'abc'])('returns 404 for id %s', async (id) => {
    const res = await request.delete(`/api/instructor/${id}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Instructor not found' });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test:unit --workspace=backend -- instructorRentService && npm run test:integration --workspace=backend -- instructor`
Expected: FAIL (`parseInstructorSaveBody` not exported; CRUD routes 404).

- [ ] **Step 4: Add parsing and mapping to the service**

Replace the import at the top of `backend/src/services/instructorRent.ts` with:

```ts
import type {
  InstructorDto,
  InstructorListItemDto,
  InstructorRentInputs,
  InvoiceRecipientDto,
  TimeBlock,
  TimeRange,
  Weekday,
} from 'shared';
import {
  calculateInstructorRent,
  DEFAULT_WEEKS_PER_MONTH,
} from '../../../shared/src/instructorRent.js';
```

Append to `backend/src/services/instructorRent.ts`:

```ts
export interface RecipientData {
  name: string;
  street: string;
  city: string;
  email: string | null;
  salutation: string | null;
}

export interface InstructorSaveBody {
  recipientId?: number;
  recipientData?: RecipientData;
  inputs: InstructorRentInputs;
}

const INVALID_BODY = { error: 'Invalid request body' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === 'string';
}

function parseTimeRange(value: unknown): TimeRange | null {
  if (!isRecord(value)) return null;
  const { start, end } = value;
  if (typeof start !== 'string' || typeof end !== 'string') return null;
  return { start, end };
}

function parseTimeBlock(value: unknown): TimeBlock | null {
  if (!isRecord(value)) return null;
  const range = parseTimeRange(value);
  const { weekday, breaks } = value;
  if (!range || typeof weekday !== 'string' || !Array.isArray(breaks)) return null;
  const parsedBreaks: TimeRange[] = [];
  for (const raw of breaks) {
    const parsed = parseTimeRange(raw);
    if (!parsed) return null;
    parsedBreaks.push(parsed);
  }
  // Unknown weekdays pass through here and are rejected by validateInstructorRent.
  return { weekday: weekday as Weekday, ...range, breaks: parsedBreaks };
}

function parseRecipientData(value: unknown): RecipientData | { error: string } {
  if (!isRecord(value)) return INVALID_BODY;
  const { name, street, city, email, salutation } = value;
  if (
    typeof name !== 'string' ||
    typeof street !== 'string' ||
    typeof city !== 'string' ||
    !isOptionalString(email) ||
    !isOptionalString(salutation)
  ) {
    return INVALID_BODY;
  }
  if (!name.trim()) return { error: 'Recipient name is required' };
  return { name, street, city, email: email || null, salutation: salutation || null };
}

/** Checks the request shape only; business rules are in validateInstructorRent. */
export function parseInstructorSaveBody(body: unknown): InstructorSaveBody | { error: string } {
  if (!isRecord(body)) return INVALID_BODY;
  const { recipientId, recipientData, hourlyRateCents, months, timeBlocks } = body;

  if (
    typeof hourlyRateCents !== 'number' ||
    typeof months !== 'number' ||
    !Array.isArray(timeBlocks)
  ) {
    return INVALID_BODY;
  }
  if (recipientId !== undefined && recipientId !== null && !Number.isInteger(recipientId)) {
    return INVALID_BODY;
  }

  const parsedBlocks: TimeBlock[] = [];
  for (const raw of timeBlocks) {
    const parsed = parseTimeBlock(raw);
    if (!parsed) return INVALID_BODY;
    parsedBlocks.push(parsed);
  }

  let parsedRecipient: RecipientData | undefined;
  if (recipientData !== undefined && recipientData !== null) {
    const result = parseRecipientData(recipientData);
    if ('error' in result) return result;
    parsedRecipient = result;
  }

  return {
    recipientId: typeof recipientId === 'number' ? recipientId : undefined,
    recipientData: parsedRecipient,
    inputs: { hourlyRateCents, months, timeBlocks: parsedBlocks },
  };
}

export interface InstructorRow {
  id: number;
  recipientId: number;
  hourlyRateCents: number;
  months: number;
  timeBlocks: string;
  createdAt: Date;
  updatedAt: Date;
  recipient: {
    id: number;
    name: string;
    street: string;
    city: string;
    email: string | null;
    salutation: string | null;
  };
}

export function toRecipientDto(recipient: InstructorRow['recipient']): InvoiceRecipientDto {
  return {
    id: recipient.id,
    name: recipient.name,
    street: recipient.street,
    city: recipient.city,
    email: recipient.email,
    salutation: recipient.salutation,
  };
}

export function toInputs(row: InstructorRow): InstructorRentInputs {
  return {
    hourlyRateCents: row.hourlyRateCents,
    months: row.months,
    timeBlocks: JSON.parse(row.timeBlocks) as TimeBlock[],
  };
}

export function toInstructorDto(row: InstructorRow, weeksPerMonth: number): InstructorDto {
  const inputs = toInputs(row);
  return {
    id: row.id,
    recipient: toRecipientDto(row.recipient),
    ...inputs,
    calculation: calculateInstructorRent(inputs, weeksPerMonth),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toListItem(row: InstructorRow, weeksPerMonth: number): InstructorListItemDto {
  const inputs = toInputs(row);
  return {
    id: row.id,
    name: row.recipient.name,
    hourlyRateCents: row.hourlyRateCents,
    months: row.months,
    calculation: calculateInstructorRent(inputs, weeksPerMonth),
  };
}
```

`DEFAULT_WEEKS_PER_MONTH` stays used by `parseWeeksPerMonth`.

- [ ] **Step 5: Add CRUD routes**

In `backend/src/routes/instructor.ts`, replace the imports with:

```ts
import { Router, type Response } from 'express';
import type { InstructorSettingsDto } from 'shared';
import type { Prisma } from '../../prisma/generated/client.js';
import {
  validateInstructorRent,
  validateWeeksPerMonth,
} from '../../../shared/src/instructorRent.js';
import { prisma } from '../prismaClient.js';
import {
  parseInstructorSaveBody,
  parseWeeksPerMonth,
  type RecipientData,
  toInstructorDto,
  toListItem,
  WEEKS_PER_MONTH_KEY,
} from '../services/instructorRent.js';
```

Append to `backend/src/routes/instructor.ts`:

```ts
class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function recipientFields(data: RecipientData) {
  return {
    name: data.name,
    street: data.street,
    city: data.city,
    email: data.email,
    salutation: data.salutation,
  };
}

async function resolveRecipientId(
  tx: Prisma.TransactionClient,
  recipientId: number | undefined,
  recipientData: RecipientData | undefined,
): Promise<number> {
  if (recipientId !== undefined) {
    const existing = await tx.invoiceRecipient.findUnique({ where: { id: recipientId } });
    if (!existing) throw new HttpError(400, 'Recipient not found');
    if (recipientData) {
      await tx.invoiceRecipient.update({
        where: { id: recipientId },
        data: recipientFields(recipientData),
      });
    }
    return recipientId;
  }
  if (!recipientData) throw new HttpError(400, 'Recipient is required');
  const created = await tx.invoiceRecipient.create({ data: recipientFields(recipientData) });
  return created.id;
}

function sendError(res: Response, err: unknown) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}

/** instructorId null = create. */
async function saveInstructor(res: Response, instructorId: number | null, body: unknown) {
  const parsed = parseInstructorSaveBody(body);
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const issues = validateInstructorRent(parsed.inputs);
  if (issues.length > 0) {
    res.status(400).json({ error: issues[0].message });
    return;
  }

  try {
    const id = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (instructorId !== null) {
        const existing = await tx.instructor.findUnique({ where: { id: instructorId } });
        if (!existing) throw new HttpError(404, 'Instructor not found');
      }
      const recipientId = await resolveRecipientId(tx, parsed.recipientId, parsed.recipientData);
      const owner = await tx.instructor.findUnique({ where: { recipientId } });
      if (owner && owner.id !== instructorId) {
        throw new HttpError(409, 'Recipient already has an instructor');
      }
      const data = {
        recipientId,
        hourlyRateCents: parsed.inputs.hourlyRateCents,
        months: parsed.inputs.months,
        timeBlocks: JSON.stringify(parsed.inputs.timeBlocks),
      };
      const saved =
        instructorId === null
          ? await tx.instructor.create({ data })
          : await tx.instructor.update({ where: { id: instructorId }, data });
      return saved.id;
    });
    res.status(instructorId === null ? 201 : 200).json({ id });
  } catch (err) {
    sendError(res, err);
  }
}

// GET /api/instructor
instructorRouter.get('/', async (_req, res) => {
  const [rows, weeksPerMonth] = await Promise.all([
    prisma.instructor.findMany({
      include: { recipient: true },
      orderBy: { recipient: { name: 'asc' } },
    }),
    getWeeksPerMonth(),
  ]);
  res.json(rows.map((row) => toListItem(row, weeksPerMonth)));
});

// GET /api/instructor/:id
instructorRouter.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const row =
    id === null
      ? null
      : await prisma.instructor.findUnique({ where: { id }, include: { recipient: true } });
  if (!row) {
    res.status(404).json({ error: 'Instructor not found' });
    return;
  }
  res.json(toInstructorDto(row, await getWeeksPerMonth()));
});

// POST /api/instructor
instructorRouter.post('/', async (req, res) => {
  await saveInstructor(res, null, req.body);
});

// PUT /api/instructor/:id
instructorRouter.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(404).json({ error: 'Instructor not found' });
    return;
  }
  await saveInstructor(res, id, req.body);
});

// DELETE /api/instructor/:id
instructorRouter.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const existing = id === null ? null : await prisma.instructor.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: 'Instructor not found' });
    return;
  }
  await prisma.instructor.delete({ where: { id: existing.id } });
  res.status(204).end();
});
```

The `/settings` routes from Task 4 stay **above** these (registered first), so `/settings` is never treated as `/:id`.

Note for `PUT` with unknown id: the 404 check runs inside the transaction before any recipient write, so no recipient is created (the test checks this).

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test:unit --workspace=backend -- instructorRentService && npm run test:integration --workspace=backend -- instructor`
Expected: PASS.

- [ ] **Step 7: Full verification and commit**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS.

```bash
git add backend/src/services/instructorRent.ts backend/src/routes/instructor.ts backend/src/__tests__/unit/instructorRentService.test.ts backend/src/__tests__/integration/instructor.test.ts
git commit -m "feat: add instructor CRUD endpoints

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Invoice prefill endpoint + production build smoke check

**Files:**

- Modify: `backend/src/services/instructorRent.ts` (append)
- Modify: `backend/src/routes/instructor.ts` (append)
- Test: `backend/src/__tests__/unit/instructorRentService.test.ts` (append)
- Test: `backend/src/__tests__/integration/instructor.test.ts` (append)

**Interfaces:**

- Consumes: Task 5 `InstructorRow`, `toInputs`, `toRecipientDto`
- Produces:
  - `function formatDecimal(value: number, fractionDigits: number, trimZeros: boolean): string`
  - `function buildInvoiceLineText(inputs: InstructorRentInputs, weeksPerMonth: number): string`
  - `function buildInvoicePrefill(row: InstructorRow, weeksPerMonth: number): InstructorInvoicePrefillDto`
  - HTTP `GET /api/instructor/:id/invoice-prefill` → `InstructorInvoicePrefillDto`

- [ ] **Step 1: Write the failing unit tests**

Append to `backend/src/__tests__/unit/instructorRentService.test.ts` (extend the import with `buildInvoiceLineText, formatDecimal`):

```ts
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

describe('buildInvoiceLineText', () => {
  const timeBlocks = [{ weekday: 'MO' as const, start: '08:00', end: '15:30', breaks: [] }];

  it('describes the calculation in German', () => {
    expect(buildInvoiceLineText({ hourlyRateCents: 1200, months: 6, timeBlocks }, 3.25)).toBe(
      'Raummiete 6 Monate (7,5 h/Woche × 3,25 Wochen × 6 Monate × 12,00 €)',
    );
  });

  it('uses the singular for one month', () => {
    expect(buildInvoiceLineText({ hourlyRateCents: 1250, months: 1, timeBlocks }, 4)).toBe(
      'Raummiete 1 Monat (7,5 h/Woche × 4 Wochen × 1 Monat × 12,50 €)',
    );
  });
});
```

- [ ] **Step 2: Write the failing integration tests**

Append to `backend/src/__tests__/integration/instructor.test.ts`:

```ts
describe('GET /api/instructor/:id/invoice-prefill', () => {
  it('returns recipient, title and one line item with the total', async () => {
    const { body } = await request.post('/api/instructor').send(newInstructorBody());

    const res = await request.get(`/api/instructor/${body.id}/invoice-prefill`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      recipient: expect.objectContaining({ name: 'Anna Alt', email: 'anna@example.org' }),
      title: 'Raummiete',
      lineItems: [
        {
          text: 'Raummiete 6 Monate (7,5 h/Woche × 3,25 Wochen × 6 Monate × 12,00 €)',
          priceInCents: 175500,
        },
      ],
    });
  });

  it('uses the singular for one month', async () => {
    const { body } = await request
      .post('/api/instructor')
      .send({ ...newInstructorBody(), months: 1 });

    const res = await request.get(`/api/instructor/${body.id}/invoice-prefill`);

    expect(res.body.lineItems[0].text).toBe(
      'Raummiete 1 Monat (7,5 h/Woche × 3,25 Wochen × 1 Monat × 12,00 €)',
    );
    expect(res.body.lineItems[0].priceInCents).toBe(29250);
  });

  it.each(['999', 'abc'])('returns 404 for id %s', async (id) => {
    const res = await request.get(`/api/instructor/${id}/invoice-prefill`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Instructor not found' });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test:unit --workspace=backend -- instructorRentService && npm run test:integration --workspace=backend -- instructor`
Expected: FAIL.

- [ ] **Step 4: Implement prefill helpers**

Add `InstructorInvoicePrefillDto` to the `import type { … } from 'shared'` list in `backend/src/services/instructorRent.ts`, then append:

```ts
/** German decimal formatting without thousands separators (deterministic, no ICU dependency). */
export function formatDecimal(value: number, fractionDigits: number, trimZeros: boolean): string {
  let text = value.toFixed(fractionDigits);
  if (trimZeros && text.includes('.')) text = text.replace(/\.?0+$/, '');
  return text.replace('.', ',');
}

function monthsLabel(months: number): string {
  return months === 1 ? '1 Monat' : `${months} Monate`;
}

export function buildInvoiceLineText(inputs: InstructorRentInputs, weeksPerMonth: number): string {
  const { netMinutesPerWeek } = calculateInstructorRent(inputs, weeksPerMonth);
  const hours = formatDecimal(netMinutesPerWeek / 60, 2, true);
  const weeks = formatDecimal(weeksPerMonth, 2, true);
  const rate = formatDecimal(inputs.hourlyRateCents / 100, 2, false);
  const label = monthsLabel(inputs.months);
  return `Raummiete ${label} (${hours} h/Woche × ${weeks} Wochen × ${label} × ${rate} €)`;
}

export function buildInvoicePrefill(
  row: InstructorRow,
  weeksPerMonth: number,
): InstructorInvoicePrefillDto {
  const inputs = toInputs(row);
  return {
    recipient: toRecipientDto(row.recipient),
    title: 'Raummiete',
    lineItems: [
      {
        text: buildInvoiceLineText(inputs, weeksPerMonth),
        priceInCents: calculateInstructorRent(inputs, weeksPerMonth).totalCents,
      },
    ],
  };
}
```

- [ ] **Step 5: Add the route**

Add `buildInvoicePrefill` to the service import in `backend/src/routes/instructor.ts`, then append:

```ts
// GET /api/instructor/:id/invoice-prefill
instructorRouter.get('/:id/invoice-prefill', async (req, res) => {
  const id = parseId(req.params.id);
  const row =
    id === null
      ? null
      : await prisma.instructor.findUnique({ where: { id }, include: { recipient: true } });
  if (!row) {
    res.status(404).json({ error: 'Instructor not found' });
    return;
  }
  res.json(buildInvoicePrefill(row, await getWeeksPerMonth()));
});
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test:unit --workspace=backend -- instructorRentService && npm run test:integration --workspace=backend -- instructor`
Expected: PASS.

- [ ] **Step 7: Production build smoke check (runtime import constraint)**

Run:

```bash
npm run build
cd backend && DATABASE_URL="file:/tmp/instructor-smoke.sqlite" npx prisma migrate deploy && cd ..
DATABASE_URL="file:/tmp/instructor-smoke.sqlite" DATA_DIR=/tmp/instructor-smoke-data PORT=3999 node backend/dist/backend/src/index.js
```

Run the server in the background (e.g. Bash `run_in_background`), then:

```bash
curl -s http://localhost:3999/api/instructor/settings
```

Expected: `{"weeksPerMonth":3.25}`. Also confirm `head -1 backend/dist/shared/src/instructorRent.js` starts with `export` (ESM, not `"use strict"`).

Stop the server and clean up: `rm -rf /tmp/instructor-smoke.sqlite /tmp/instructor-smoke-data`.

If the server crashes with `exports is not defined` or `Cannot find module 'shared'`, a runtime import from `'shared'` slipped into backend `src/` or `shared/package.json` lost `"type": "module"` — fix before continuing.

- [ ] **Step 8: Full verification and commit**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS.

```bash
git add backend/src/services/instructorRent.ts backend/src/routes/instructor.ts backend/src/__tests__/unit/instructorRentService.test.ts backend/src/__tests__/integration/instructor.test.ts
git commit -m "feat: add instructor invoice prefill endpoint

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Frontend formatting utils, navigation and instructor list view

**Files:**

- Create: `frontend/src/utils/format.ts`
- Create: `frontend/src/views/InstructorView.vue`
- Create: `frontend/src/views/InstructorFormView.vue` (placeholder shell, replaced in Task 10)
- Modify: `frontend/src/router/index.ts`
- Modify: `frontend/src/components/AppSidebar.vue`
- Modify: `frontend/src/views/HomeView.vue`
- Test: `frontend/src/__tests__/format.test.ts`
- Test: `frontend/src/__tests__/InstructorView.test.ts`

**Interfaces:**

- Consumes: `InstructorListItemDto`, `InstructorSettingsDto`, `validateWeeksPerMonth`, `DEFAULT_WEEKS_PER_MONTH` from `shared`; `useAppStore` (`invoiceTemplateAvailable`, `checkTemplates`)
- Produces (`frontend/src/utils/format.ts`):
  - `formatCents(cents: number): string` — e.g. `1.755,00 €` (Intl de-DE EUR)
  - `formatHours(minutes: number): string` — e.g. `7,5` (max 2 decimals, de-DE)
  - `parseEuroToCents(text: string): number` — `'12,50'` → `1250`, `'12.5'` → `1250`, `''`/`'abc'` → `NaN`
  - `centsToEuroInput(cents: number): string` — `1250` → `'12,50'`
- Routes: `/instructor` (`instructor`), `/instructor/new` (`instructor-new`), `/instructor/:id` (`instructor-detail`)
- `data-testid`s in `InstructorView`: `weeks-per-month`, `save-settings`, `settings-error`, `instructor-row`, `footer-total`, `create-invoice-{id}`, `new-instructor`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/__tests__/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { centsToEuroInput, formatCents, formatHours, parseEuroToCents } from '../utils/format';

describe('format utils', () => {
  it('formats cents as euro', () => {
    expect(formatCents(175500)).toMatch(/^1\.755,00\s€$/);
  });

  it('formats minutes as German hours', () => {
    expect(formatHours(450)).toBe('7,5');
    expect(formatHours(20)).toBe('0,33');
    expect(formatHours(480)).toBe('8');
  });

  it.each([
    ['12,50', 1250],
    ['12.5', 1250],
    [' 12 ', 1200],
    ['0,015', 2],
  ])('parses %j to cents', (text, cents) => {
    expect(parseEuroToCents(text)).toBe(cents);
  });

  it.each(['', '   ', 'abc', '1.234,50'])('returns NaN for %j', (text) => {
    expect(parseEuroToCents(text)).toBeNaN();
  });

  it('formats cents for an input field', () => {
    expect(centsToEuroInput(1250)).toBe('12,50');
    expect(centsToEuroInput(1200)).toBe('12,00');
  });
});
```

Create `frontend/src/__tests__/InstructorView.test.ts`:

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import type { InstructorListItemDto } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRouter } from 'vue-router';
import InstructorView from '../views/InstructorView.vue';

vi.mock('vue-router', () => ({
  useRouter: vi.fn(),
}));

const mockPush = vi.fn();

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

let fetchMock: ReturnType<typeof vi.fn>;

function mountView() {
  return mount(InstructorView, {
    global: { stubs: { 'router-link': { template: '<a><slot /></a>' } } },
  });
}

describe('InstructorView', () => {
  beforeEach(() => {
    fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/instructor') return Promise.resolve(jsonResponse(instructors));
      if (url === '/api/instructor/settings' && init?.method === 'PUT') {
        return Promise.resolve(jsonResponse(JSON.parse(String(init.body))));
      }
      if (url === '/api/instructor/settings') {
        return Promise.resolve(jsonResponse({ weeksPerMonth: 3.25 }));
      }
      if (url === '/api/templates') return Promise.resolve(jsonResponse([{ type: 'RECHNUNG' }]));
      return Promise.resolve(jsonResponse({}, false));
    });
    vi.stubGlobal('fetch', fetchMock);
    (useRouter as ReturnType<typeof vi.fn>).mockReturnValue({ push: mockPush });
    setActivePinia(createPinia());
    mockPush.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders one row per instructor and the sum of totals', async () => {
    const wrapper = mountView();
    await flushPromises();

    const rows = wrapper.findAll('[data-testid="instructor-row"]');
    expect(rows).toHaveLength(2);
    expect(rows[0].text()).toContain('Anna Alt');
    expect(rows[0].text()).toContain('7,5');
    expect(rows[0].text()).toContain('1.755,00');
    expect(wrapper.find('[data-testid="footer-total"]').text()).toContain('1.787,50');
  });

  it('loads the weeks-per-month setting into the input', async () => {
    const wrapper = mountView();
    await flushPromises();

    const input = wrapper.find('[data-testid="weeks-per-month"]').element as HTMLInputElement;
    expect(input.value).toBe('3.25');
  });

  it('saves the setting and reloads the list', async () => {
    const wrapper = mountView();
    await flushPromises();
    const listCallsBefore = fetchMock.mock.calls.filter(([u]) => u === '/api/instructor').length;

    await wrapper.find('[data-testid="weeks-per-month"]').setValue('4');
    await wrapper.find('[data-testid="save-settings"]').trigger('click');
    await flushPromises();

    const putCall = fetchMock.mock.calls.find(
      ([u, init]) => u === '/api/instructor/settings' && init?.method === 'PUT',
    );
    expect(JSON.parse(String(putCall?.[1]?.body))).toEqual({ weeksPerMonth: 4 });
    const listCallsAfter = fetchMock.mock.calls.filter(([u]) => u === '/api/instructor').length;
    expect(listCallsAfter).toBe(listCallsBefore + 1);
  });

  it('shows a validation error and does not save weeks per month of 0', async () => {
    const wrapper = mountView();
    await flushPromises();

    await wrapper.find('[data-testid="weeks-per-month"]').setValue('0');
    await wrapper.find('[data-testid="save-settings"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="settings-error"]').text()).toBe(
      'Weeks per month must be greater than 0',
    );
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
  });

  it('navigates to a prefilled invoice', async () => {
    const wrapper = mountView();
    await flushPromises();

    await wrapper.find('[data-testid="create-invoice-1"]').trigger('click');

    expect(mockPush).toHaveBeenCalledWith('/invoice/new?fromInstructor=1');
  });

  it('opens the instructor on row click', async () => {
    const wrapper = mountView();
    await flushPromises();

    await wrapper.findAll('[data-testid="instructor-row"]')[1].trigger('click');

    expect(mockPush).toHaveBeenCalledWith('/instructor/2');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit --workspace=frontend -- format InstructorView`
Expected: FAIL (modules not found).

- [ ] **Step 3: Create the format utils**

Create `frontend/src/utils/format.ts`:

```ts
export function formatCents(cents: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

export function formatHours(minutes: number): string {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(minutes / 60);
}

/** Accepts "12,50" or "12.5"; anything else (incl. thousands separators) → NaN. */
export function parseEuroToCents(text: string): number {
  const trimmed = text.trim();
  if (!/^\d+([.,]\d+)?$/.test(trimmed)) return Number.NaN;
  return Math.round(Number(trimmed.replace(',', '.')) * 100);
}

export function centsToEuroInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}
```

Note: `0,015` → `1.5` cents → `Math.round` → `2`.

- [ ] **Step 4: Create the list view**

Create `frontend/src/views/InstructorView.vue`:

```vue
<script setup lang="ts">
import {
  DEFAULT_WEEKS_PER_MONTH,
  type InstructorListItemDto,
  type InstructorSettingsDto,
  validateWeeksPerMonth,
} from 'shared';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAppStore } from '../stores/app';
import { formatCents, formatHours } from '../utils/format';

const router = useRouter();
const store = useAppStore();

const instructors = ref<InstructorListItemDto[]>([]);
const loading = ref(false);
const error = ref('');

const weeksPerMonth = ref<number | string>(DEFAULT_WEEKS_PER_MONTH);
const settingsError = ref('');
const settingsSaved = ref(false);

const totalCents = computed(() =>
  instructors.value.reduce((sum, i) => sum + i.calculation.totalCents, 0),
);

async function loadInstructors() {
  loading.value = true;
  error.value = '';
  try {
    const res = await fetch('/api/instructor');
    if (!res.ok) throw new Error('load failed');
    instructors.value = await res.json();
  } catch {
    error.value = 'Error loading instructors';
  } finally {
    loading.value = false;
  }
}

async function loadSettings() {
  const res = await fetch('/api/instructor/settings');
  if (res.ok) weeksPerMonth.value = ((await res.json()) as InstructorSettingsDto).weeksPerMonth;
}

async function saveSettings() {
  settingsError.value = '';
  settingsSaved.value = false;
  const value = Number(weeksPerMonth.value);
  const validation = validateWeeksPerMonth(value);
  if (validation) {
    settingsError.value = validation;
    return;
  }
  const res = await fetch('/api/instructor/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ weeksPerMonth: value }),
  });
  if (!res.ok) {
    settingsError.value = ((await res.json()) as { error: string }).error;
    return;
  }
  settingsSaved.value = true;
  await loadInstructors();
}

function openInstructor(id: number) {
  router.push(`/instructor/${id}`);
}

function createInvoice(id: number) {
  router.push(`/invoice/new?fromInstructor=${id}`);
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
  <div>
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-2xl font-bold text-gray-800">Instructor Rent</h2>
      <button
        type="button"
        data-testid="new-instructor"
        class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        @click="router.push('/instructor/new')"
      >
        New instructor
      </button>
    </div>

    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6 flex items-end gap-3">
      <div>
        <label for="weeks-per-month" class="block text-sm font-medium text-gray-700 mb-1"
          >Weeks per month</label
        >
        <input
          id="weeks-per-month"
          v-model="weeksPerMonth"
          data-testid="weeks-per-month"
          type="number"
          step="0.01"
          min="0.01"
          class="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <button
        type="button"
        data-testid="save-settings"
        class="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
        @click="saveSettings"
      >
        Save
      </button>
      <p v-if="settingsError" data-testid="settings-error" class="text-sm text-red-600">
        {{ settingsError }}
      </p>
      <p v-else-if="settingsSaved" class="text-sm text-green-600">Saved</p>
    </div>

    <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <p v-if="error" class="p-4 text-sm text-red-600">{{ error }}</p>
      <p v-else-if="loading" class="p-4 text-sm text-gray-500">Loading…</p>
      <p v-else-if="instructors.length === 0" class="p-4 text-sm text-gray-500">
        No instructors yet.
      </p>
      <table v-else class="w-full text-sm">
        <thead>
          <tr class="border-b border-gray-200 bg-gray-50">
            <th class="text-left px-4 py-3 font-medium text-gray-600">Name</th>
            <th class="text-right px-4 py-3 font-medium text-gray-600">Hourly rate (net)</th>
            <th class="text-right px-4 py-3 font-medium text-gray-600">h/week</th>
            <th class="text-right px-4 py-3 font-medium text-gray-600">Per month (net)</th>
            <th class="text-right px-4 py-3 font-medium text-gray-600">Months</th>
            <th class="text-right px-4 py-3 font-medium text-gray-600">Total (net)</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="i in instructors"
            :key="i.id"
            data-testid="instructor-row"
            class="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
            tabindex="0"
            role="button"
            @click="openInstructor(i.id)"
            @keydown.enter.prevent="openInstructor(i.id)"
          >
            <td class="px-4 py-3 text-gray-800">{{ i.name }}</td>
            <td class="px-4 py-3 text-right">{{ formatCents(i.hourlyRateCents) }}</td>
            <td class="px-4 py-3 text-right">{{ formatHours(i.calculation.netMinutesPerWeek) }}</td>
            <td class="px-4 py-3 text-right">{{ formatCents(i.calculation.monthlyCents) }}</td>
            <td class="px-4 py-3 text-right">{{ i.months }}</td>
            <td class="px-4 py-3 text-right font-medium">
              {{ formatCents(i.calculation.totalCents) }}
            </td>
            <td class="px-4 py-3 text-right">
              <button
                type="button"
                :data-testid="`create-invoice-${i.id}`"
                :disabled="store.invoiceTemplateAvailable === false"
                :title="
                  store.invoiceTemplateAvailable === false ? 'No active invoice template' : ''
                "
                class="px-3 py-1 border border-gray-300 rounded-lg text-xs font-medium hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                @click.stop="createInvoice(i.id)"
              >
                Create invoice
              </button>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="bg-gray-50">
            <td colspan="5" class="px-4 py-3 font-medium text-gray-600">Sum</td>
            <td data-testid="footer-total" class="px-4 py-3 text-right font-semibold">
              {{ formatCents(totalCents) }}
            </td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>
</template>
```

- [ ] **Step 5: Add a placeholder form view so routes compile**

Create `frontend/src/views/InstructorFormView.vue` (replaced in Task 10):

```vue
<template>
  <div></div>
</template>
```

- [ ] **Step 6: Wire routes and navigation**

`frontend/src/router/index.ts` — add imports (alphabetical, after `HomeView`):

```ts
import InstructorFormView from '@/views/InstructorFormView.vue';
import InstructorView from '@/views/InstructorView.vue';
```

Add routes after the `donation-receipt-settings` route and before the `/settings` redirect:

```ts
    { path: '/instructor', name: 'instructor', component: InstructorView },
    { path: '/instructor/new', name: 'instructor-new', component: InstructorFormView },
    { path: '/instructor/:id', name: 'instructor-detail', component: InstructorFormView },
```

`frontend/src/components/AppSidebar.vue` — add to `navItems` after Invoice:

```ts
  { name: 'Instructor Rent', to: '/instructor' },
```

`frontend/src/views/HomeView.vue` — add a third card after the Invoice `RouterLink`:

```vue
<RouterLink
  to="/instructor"
  class="block p-6 bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
>
        <h3 class="text-lg font-semibold text-gray-800 mb-2">Instructor Rent</h3>
        <p class="text-sm text-gray-500">Calculate room rent for instructors.</p>
      </RouterLink>
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm run test:unit --workspace=frontend -- format InstructorView`
Expected: PASS.

- [ ] **Step 8: Full verification and commit**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS.

```bash
git add frontend/src/utils/format.ts frontend/src/views/InstructorView.vue frontend/src/views/InstructorFormView.vue frontend/src/router/index.ts frontend/src/components/AppSidebar.vue frontend/src/views/HomeView.vue frontend/src/__tests__/format.test.ts frontend/src/__tests__/InstructorView.test.ts
git commit -m "feat: add instructor rent list view and navigation

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: `RecipientPicker` component

**Files:**

- Create: `frontend/src/utils/recipientForm.ts`
- Create: `frontend/src/components/RecipientPicker.vue`
- Test: `frontend/src/__tests__/RecipientPicker.test.ts`

**Interfaces:**

- Consumes: `InvoiceRecipientDto` from `shared`; `GET /api/invoice-recipient?search=` → `InvoiceRecipientDto[]`
- Produces (`frontend/src/utils/recipientForm.ts`):
  - `interface RecipientFormValue { id: number | null; name: string; street: string; city: string; email: string; salutation: string }`
  - `function emptyRecipient(): RecipientFormValue`
  - `function fromRecipientDto(dto: InvoiceRecipientDto): RecipientFormValue`
  - `function toRecipientData(value: RecipientFormValue): { name: string; street: string; city: string; email: string | null; salutation: string | null }`
- Produces (component): `<RecipientPicker v-model="recipient" />` emitting `update:modelValue` with a full `RecipientFormValue`
- `data-testid`s: `recipient-search`, `recipient-suggestion`, `recipient-new`, `recipient-linked-hint`, `recipient-name`, `recipient-street`, `recipient-city`, `recipient-email`, `recipient-salutation`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/__tests__/RecipientPicker.test.ts`:

```ts
import { flushPromises, mount } from '@vue/test-utils';
import type { InvoiceRecipientDto } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RecipientPicker from '../components/RecipientPicker.vue';
import { emptyRecipient, type RecipientFormValue, toRecipientData } from '../utils/recipientForm';

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

function lastEmitted(wrapper: ReturnType<typeof mount>): RecipientFormValue {
  const events = wrapper.emitted('update:modelValue') as RecipientFormValue[][];
  return events[events.length - 1][0];
}

describe('RecipientPicker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(recipients) } as Response),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('searches recipients after typing and shows suggestions', async () => {
    const wrapper = mount(RecipientPicker, { props: { modelValue: emptyRecipient() } });

    await wrapper.find('[data-testid="recipient-search"]').setValue('An');
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();

    expect(fetch).toHaveBeenCalledWith('/api/invoice-recipient?search=An');
    expect(wrapper.findAll('[data-testid="recipient-suggestion"]')).toHaveLength(1);
  });

  it('emits the selected recipient with its id', async () => {
    const wrapper = mount(RecipientPicker, { props: { modelValue: emptyRecipient() } });
    await wrapper.find('[data-testid="recipient-search"]').setValue('An');
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();

    await wrapper.find('[data-testid="recipient-suggestion"]').trigger('click');

    expect(lastEmitted(wrapper)).toEqual({
      id: 7,
      name: 'Anna Alt',
      street: 'Hauptstr. 1',
      city: '12345 Berlin',
      email: 'anna@example.org',
      salutation: 'Frau',
    });
  });

  it('emits edits to fields and keeps the linked id', async () => {
    const linked: RecipientFormValue = { ...emptyRecipient(), id: 7, name: 'Anna Alt' };
    const wrapper = mount(RecipientPicker, { props: { modelValue: linked } });

    expect(wrapper.find('[data-testid="recipient-linked-hint"]').exists()).toBe(true);
    await wrapper.find('[data-testid="recipient-street"]').setValue('Neue Str. 2');

    expect(lastEmitted(wrapper)).toMatchObject({ id: 7, name: 'Anna Alt', street: 'Neue Str. 2' });
  });

  it('starts a new recipient with the search text as name', async () => {
    const linked: RecipientFormValue = { ...emptyRecipient(), id: 7, name: 'Anna Alt' };
    const wrapper = mount(RecipientPicker, { props: { modelValue: linked } });
    await wrapper.find('[data-testid="recipient-search"]').setValue('Carla Cron');

    await wrapper.find('[data-testid="recipient-new"]').trigger('click');

    expect(lastEmitted(wrapper)).toEqual({ ...emptyRecipient(), name: 'Carla Cron' });
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
Expected: FAIL (modules not found).

- [ ] **Step 3: Create the form helpers**

Create `frontend/src/utils/recipientForm.ts`:

```ts
import type { InvoiceRecipientDto } from 'shared';

/** id null = new recipient; otherwise saving updates that recipient in place. */
export interface RecipientFormValue {
  id: number | null;
  name: string;
  street: string;
  city: string;
  email: string;
  salutation: string;
}

export function emptyRecipient(): RecipientFormValue {
  return { id: null, name: '', street: '', city: '', email: '', salutation: '' };
}

export function fromRecipientDto(dto: InvoiceRecipientDto): RecipientFormValue {
  return {
    id: dto.id,
    name: dto.name,
    street: dto.street,
    city: dto.city,
    email: dto.email ?? '',
    salutation: dto.salutation ?? '',
  };
}

export function toRecipientData(value: RecipientFormValue) {
  return {
    name: value.name,
    street: value.street,
    city: value.city,
    email: value.email || null,
    salutation: value.salutation || null,
  };
}
```

- [ ] **Step 4: Create the component**

Create `frontend/src/components/RecipientPicker.vue`:

```vue
<script setup lang="ts">
import type { InvoiceRecipientDto } from 'shared';
import { ref, watch } from 'vue';
import { emptyRecipient, fromRecipientDto, type RecipientFormValue } from '../utils/recipientForm';

const props = defineProps<{
  modelValue: RecipientFormValue;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: RecipientFormValue];
}>();

const search = ref(props.modelValue.name);
const suggestions = ref<InvoiceRecipientDto[]>([]);
let debounceTimer: ReturnType<typeof setTimeout>;

watch(
  () => props.modelValue.id,
  () => {
    search.value = props.modelValue.name;
  },
);

function onSearchInput() {
  clearTimeout(debounceTimer);
  if (!search.value.trim()) {
    suggestions.value = [];
    return;
  }
  debounceTimer = setTimeout(async () => {
    const res = await fetch(`/api/invoice-recipient?search=${encodeURIComponent(search.value)}`);
    if (res.ok) suggestions.value = await res.json();
  }, 250);
}

function select(recipient: InvoiceRecipientDto) {
  suggestions.value = [];
  search.value = recipient.name;
  emit('update:modelValue', fromRecipientDto(recipient));
}

function startNew() {
  suggestions.value = [];
  emit('update:modelValue', { ...emptyRecipient(), name: search.value.trim() });
}

function update(field: keyof Omit<RecipientFormValue, 'id'>, value: string) {
  const next = { ...props.modelValue };
  next[field] = value;
  emit('update:modelValue', next);
}

const fields: { key: keyof Omit<RecipientFormValue, 'id'>; label: string }[] = [
  { key: 'salutation', label: 'Salutation' },
  { key: 'name', label: 'Name' },
  { key: 'street', label: 'Street' },
  { key: 'city', label: 'Postal code / City' },
  { key: 'email', label: 'Email' },
];
</script>

<template>
  <div>
    <div class="mb-3 relative">
      <label for="recipient-search" class="block text-sm font-medium text-gray-700 mb-1"
        >Search or create recipient</label
      >
      <div class="flex gap-2">
        <input
          id="recipient-search"
          v-model="search"
          data-testid="recipient-search"
          type="text"
          placeholder="Enter name…"
          class="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          @input="onSearchInput"
        />
        <button
          type="button"
          data-testid="recipient-new"
          class="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
          @click="startNew"
        >
          New recipient
        </button>
      </div>
      <div
        v-if="suggestions.length > 0"
        class="absolute z-10 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-40 overflow-auto"
      >
        <button
          v-for="r in suggestions"
          :key="r.id"
          type="button"
          data-testid="recipient-suggestion"
          class="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
          @click="select(r)"
        >
          {{ r.name }} — {{ r.street }}, {{ r.city }}
        </button>
      </div>
    </div>

    <p
      v-if="modelValue.id !== null"
      data-testid="recipient-linked-hint"
      class="text-xs text-gray-500 mb-3"
    >
      Linked to an existing recipient. Editing these fields updates that recipient.
    </p>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div v-for="f in fields" :key="f.key">
        <label :for="`recipient-${f.key}`" class="block text-sm font-medium text-gray-700 mb-1">{{
          f.label
        }}</label>
        <input
          :id="`recipient-${f.key}`"
          :data-testid="`recipient-${f.key}`"
          :value="modelValue[f.key]"
          type="text"
          class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          @input="update(f.key, ($event.target as HTMLInputElement).value)"
        />
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:unit --workspace=frontend -- RecipientPicker`
Expected: PASS.

- [ ] **Step 6: Full verification and commit**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS.

```bash
git add frontend/src/utils/recipientForm.ts frontend/src/components/RecipientPicker.vue frontend/src/__tests__/RecipientPicker.test.ts
git commit -m "feat: add RecipientPicker component

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: `WeeklySchedule` component

**Files:**

- Create: `frontend/src/components/WeeklySchedule.vue`
- Test: `frontend/src/__tests__/WeeklySchedule.test.ts`

**Interfaces:**

- Consumes: `TimeBlock`, `TimeRange`, `Weekday`, `WEEKDAYS`, `ValidationIssue`, `blockNetMinutes` from `shared`; `formatHours` from `../utils/format`
- Produces: `<WeeklySchedule v-model="timeBlocks" :issues="issues" />`
  - `modelValue: TimeBlock[]` (flat array; order preserved; indices match validation paths `timeBlocks.{i}`)
  - `issues: ValidationIssue[]` (the full list from `validateInstructorRent`; the component picks those with path `timeBlocks.{i}` or prefix `timeBlocks.{i}.`)
  - emits `update:modelValue` with a new array (never mutates props)
  - New block: `{ weekday, start: '', end: '', breaks: [] }`; new break: `{ start: '', end: '' }`
- `data-testid`s: `day-{WEEKDAY}`, `add-block-{WEEKDAY}`, `block` (each block container), `block-start`, `block-end`, `block-hours`, `block-issue`, `remove-block`, `add-break`, `break-start`, `break-end`, `remove-break`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/__tests__/WeeklySchedule.test.ts`:

```ts
import { mount } from '@vue/test-utils';
import type { TimeBlock, ValidationIssue } from 'shared';
import { describe, expect, it } from 'vitest';
import WeeklySchedule from '../components/WeeklySchedule.vue';

const monday: TimeBlock = { weekday: 'MO', start: '08:00', end: '12:00', breaks: [] };

function mountSchedule(modelValue: TimeBlock[], issues: ValidationIssue[] = []) {
  return mount(WeeklySchedule, { props: { modelValue, issues } });
}

function lastEmitted(wrapper: ReturnType<typeof mount>): TimeBlock[] {
  const events = wrapper.emitted('update:modelValue') as TimeBlock[][][];
  return events[events.length - 1][0];
}

describe('WeeklySchedule', () => {
  it('renders seven day sections Mo to So', () => {
    const wrapper = mountSchedule([]);
    for (const day of ['MO', 'DI', 'MI', 'DO', 'FR', 'SA', 'SO']) {
      expect(wrapper.find(`[data-testid="day-${day}"]`).exists()).toBe(true);
    }
  });

  it('shows blocks under their weekday', () => {
    const wrapper = mountSchedule([monday, { ...monday, weekday: 'FR' }]);
    expect(wrapper.find('[data-testid="day-MO"]').findAll('[data-testid="block"]')).toHaveLength(1);
    expect(wrapper.find('[data-testid="day-FR"]').findAll('[data-testid="block"]')).toHaveLength(1);
    expect(wrapper.find('[data-testid="day-DI"]').findAll('[data-testid="block"]')).toHaveLength(0);
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
    await wrapper.find('[data-testid="day-MO"] [data-testid="remove-block"]').trigger('click');
    expect(lastEmitted(wrapper)).toEqual([{ ...monday, weekday: 'FR' }]);
  });

  it('shows net hours for a valid block', () => {
    const wrapper = mountSchedule([{ ...monday, breaks: [{ start: '10:00', end: '10:30' }] }]);
    expect(wrapper.find('[data-testid="block-hours"]').text()).toBe('3,5 h');
  });

  it('shows issues of a block and hides its hours', () => {
    const wrapper = mountSchedule(
      [monday, { ...monday, start: '11:00', end: '13:00' }],
      [{ path: 'timeBlocks.1', message: 'Time blocks on the same day must not overlap' }],
    );
    const blocks = wrapper.findAll('[data-testid="block"]');
    expect(blocks[0].find('[data-testid="block-issue"]').exists()).toBe(false);
    expect(blocks[1].find('[data-testid="block-issue"]').text()).toBe(
      'Time blocks on the same day must not overlap',
    );
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
Expected: FAIL (module not found).

- [ ] **Step 3: Create the component**

Create `frontend/src/components/WeeklySchedule.vue`:

```vue
<script setup lang="ts">
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

function emitWith(change: (blocks: TimeBlock[]) => void) {
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
  <div class="space-y-4">
    <div
      v-for="day in days"
      :key="day.weekday"
      :data-testid="`day-${day.weekday}`"
      class="border border-gray-200 rounded-lg p-4"
    >
      <div class="flex items-center justify-between mb-2">
        <h4 class="font-medium text-gray-800">{{ day.label }}</h4>
        <button
          type="button"
          :data-testid="`add-block-${day.weekday}`"
          class="text-sm text-blue-600 hover:underline"
          @click="addBlock(day.weekday)"
        >
          + Block
        </button>
      </div>

      <div
        v-for="{ block, index } in day.blocks"
        :key="index"
        data-testid="block"
        class="bg-gray-50 rounded-lg p-3 mb-2"
      >
        <div class="flex flex-wrap items-center gap-2">
          <input
            data-testid="block-start"
            type="time"
            :value="block.start"
            aria-label="Start"
            class="border border-gray-300 rounded-lg px-2 py-1 text-sm"
            @input="updateBlock(index, 'start', inputValue($event))"
          />
          <span class="text-gray-500">–</span>
          <input
            data-testid="block-end"
            type="time"
            :value="block.end"
            aria-label="End"
            class="border border-gray-300 rounded-lg px-2 py-1 text-sm"
            @input="updateBlock(index, 'end', inputValue($event))"
          />
          <span
            v-if="issuesFor(index).length === 0"
            data-testid="block-hours"
            class="text-sm text-gray-600"
            >{{ formatHours(blockNetMinutes(block)) }} h</span
          >
          <button
            type="button"
            data-testid="add-break"
            class="text-sm text-blue-600 hover:underline ml-auto"
            @click="addBreak(index)"
          >
            + Pause
          </button>
          <button
            type="button"
            data-testid="remove-block"
            class="text-sm text-red-600 hover:underline"
            @click="removeBlock(index)"
          >
            Remove
          </button>
        </div>

        <div
          v-for="(brk, breakIndex) in block.breaks"
          :key="breakIndex"
          class="flex items-center gap-2 mt-2 ml-6"
        >
          <span class="text-xs text-gray-500">Pause</span>
          <input
            data-testid="break-start"
            type="time"
            :value="brk.start"
            aria-label="Break start"
            class="border border-gray-300 rounded-lg px-2 py-1 text-sm"
            @input="updateBreak(index, breakIndex, 'start', inputValue($event))"
          />
          <span class="text-gray-500">–</span>
          <input
            data-testid="break-end"
            type="time"
            :value="brk.end"
            aria-label="Break end"
            class="border border-gray-300 rounded-lg px-2 py-1 text-sm"
            @input="updateBreak(index, breakIndex, 'end', inputValue($event))"
          />
          <button
            type="button"
            data-testid="remove-break"
            class="text-xs text-red-600 hover:underline"
            @click="removeBreak(index, breakIndex)"
          >
            Remove
          </button>
        </div>

        <p
          v-for="message in issuesFor(index)"
          :key="message"
          data-testid="block-issue"
          class="text-xs text-red-600 mt-2"
        >
          {{ message }}
        </p>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit --workspace=frontend -- WeeklySchedule`
Expected: PASS.

- [ ] **Step 5: Full verification and commit**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS.

```bash
git add frontend/src/components/WeeklySchedule.vue frontend/src/__tests__/WeeklySchedule.test.ts
git commit -m "feat: add WeeklySchedule component

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: `InstructorFormView`

**Files:**

- Modify (replace placeholder): `frontend/src/views/InstructorFormView.vue`
- Test: `frontend/src/__tests__/InstructorFormView.test.ts`

**Interfaces:**

- Consumes: `RecipientPicker` + `recipientForm` helpers (Task 8), `WeeklySchedule` (Task 9), `parseEuroToCents`, `centsToEuroInput`, `formatCents`, `formatHours` (Task 7), shared `validateInstructorRent`, `calculateInstructorRent`, `DEFAULT_WEEKS_PER_MONTH`, `InstructorDto`, `InstructorSettingsDto`, `TimeBlock`; endpoints from Tasks 4–5
- Produces: route component for `/instructor/new` and `/instructor/:id`
- `data-testid`s: `hourly-rate`, `hourly-rate-error`, `months`, `months-error`, `summary-hours`, `summary-monthly`, `summary-total`, `save`, `delete`, `create-invoice`, `form-error`
- Request body sent on save: `{ recipientId?: number, recipientData: {name, street, city, email|null, salutation|null}, hourlyRateCents, months, timeBlocks }` — `recipientId` omitted when the recipient is new

- [ ] **Step 1: Write the failing test**

Create `frontend/src/__tests__/InstructorFormView.test.ts`:

```ts
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import type { InstructorDto } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRoute, useRouter } from 'vue-router';
import InstructorFormView from '../views/InstructorFormView.vue';

vi.mock('vue-router', () => ({
  useRoute: vi.fn(),
  useRouter: vi.fn(),
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

function setup(params: Record<string, string> = {}) {
  (useRoute as ReturnType<typeof vi.fn>).mockReturnValue({ params, query: {} });
  return mount(InstructorFormView);
}

async function addMondayBlock(wrapper: VueWrapper, start: string, end: string) {
  await wrapper.find('[data-testid="add-block-MO"]').trigger('click');
  const blocks = wrapper.find('[data-testid="day-MO"]').findAll('[data-testid="block"]');
  const last = blocks[blocks.length - 1];
  await last.find('[data-testid="block-start"]').setValue(start);
  await last.find('[data-testid="block-end"]').setValue(end);
}

describe('InstructorFormView', () => {
  beforeEach(() => {
    fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/instructor/settings') {
        return Promise.resolve(jsonResponse({ weeksPerMonth: 3.25 }));
      }
      if (url === '/api/instructor/5' && !init?.method) {
        return Promise.resolve(jsonResponse(existing));
      }
      if (url === '/api/instructor' && init?.method === 'POST') {
        return Promise.resolve(jsonResponse({ id: 9 }));
      }
      if (url === '/api/instructor/5' && init?.method === 'DELETE') {
        return Promise.resolve({ ok: true, status: 204 } as Response);
      }
      return Promise.resolve(jsonResponse({}, false));
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
    (useRouter as ReturnType<typeof vi.fn>).mockReturnValue({ push: mockPush });
    setActivePinia(createPinia());
    mockPush.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('updates the live summary while editing', async () => {
    const wrapper = setup();
    await flushPromises();

    await wrapper.find('[data-testid="hourly-rate"]').setValue('12');
    await wrapper.find('[data-testid="months"]').setValue('6');
    await addMondayBlock(wrapper, '08:00', '15:30');

    expect(wrapper.find('[data-testid="summary-hours"]').text()).toContain('7,5');
    expect(wrapper.find('[data-testid="summary-monthly"]').text()).toContain('292,50');
    expect(wrapper.find('[data-testid="summary-total"]').text()).toContain('1.755,00');
  });

  it('shows an overlap error and disables save', async () => {
    const wrapper = setup();
    await flushPromises();
    await wrapper.find('[data-testid="recipient-name"]').setValue('Anna Alt');
    await wrapper.find('[data-testid="hourly-rate"]').setValue('12');
    await addMondayBlock(wrapper, '08:00', '12:00');
    await addMondayBlock(wrapper, '11:00', '13:00');

    expect(wrapper.text()).toContain('Time blocks on the same day must not overlap');
    expect(wrapper.find('[data-testid="save"]').attributes('disabled')).toBeDefined();
  });

  it('shows a rate error for unparseable input', async () => {
    const wrapper = setup();
    await flushPromises();

    await wrapper.find('[data-testid="hourly-rate"]').setValue('abc');

    expect(wrapper.find('[data-testid="hourly-rate-error"]').text()).toBe(
      'Hourly rate must be greater than 0',
    );
  });

  it('posts the expected body for a new instructor and returns to the list', async () => {
    const wrapper = setup();
    await flushPromises();
    await wrapper.find('[data-testid="recipient-name"]').setValue('Anna Alt');
    await wrapper.find('[data-testid="recipient-street"]').setValue('Hauptstr. 1');
    await wrapper.find('[data-testid="recipient-city"]').setValue('12345 Berlin');
    await wrapper.find('[data-testid="hourly-rate"]').setValue('12,50');
    await wrapper.find('[data-testid="months"]').setValue('6');
    await addMondayBlock(wrapper, '08:00', '12:00');

    await wrapper.find('[data-testid="save"]').trigger('click');
    await flushPromises();

    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(post?.[0]).toBe('/api/instructor');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
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
    expect(mockPush).toHaveBeenCalledWith('/instructor');
  });

  it('loads an existing instructor and offers invoice creation until edited', async () => {
    const wrapper = setup({ id: '5' });
    await flushPromises();

    expect((wrapper.find('[data-testid="hourly-rate"]').element as HTMLInputElement).value).toBe(
      '12,00',
    );
    const createInvoice = wrapper.find('[data-testid="create-invoice"]');
    expect(createInvoice.attributes('disabled')).toBeUndefined();
    await createInvoice.trigger('click');
    expect(mockPush).toHaveBeenCalledWith('/invoice/new?fromInstructor=5');

    await wrapper.find('[data-testid="months"]').setValue('3');
    expect(wrapper.find('[data-testid="create-invoice"]').attributes('disabled')).toBeDefined();
  });

  it('deletes after confirmation', async () => {
    const wrapper = setup({ id: '5' });
    await flushPromises();

    await wrapper.find('[data-testid="delete"]').trigger('click');
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith('/api/instructor/5', { method: 'DELETE' });
    expect(mockPush).toHaveBeenCalledWith('/instructor');
  });

  it('shows the server error when saving fails', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/instructor/settings')
        return Promise.resolve(jsonResponse({ weeksPerMonth: 3.25 }));
      if (init?.method === 'POST') {
        return Promise.resolve(
          jsonResponse({ error: 'Recipient already has an instructor' }, false),
        );
      }
      return Promise.resolve(jsonResponse({}, false));
    });
    const wrapper = setup();
    await flushPromises();
    await wrapper.find('[data-testid="recipient-name"]').setValue('Anna Alt');
    await wrapper.find('[data-testid="hourly-rate"]').setValue('12');

    await wrapper.find('[data-testid="save"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="form-error"]').text()).toBe(
      'Recipient already has an instructor',
    );
    expect(mockPush).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit --workspace=frontend -- InstructorFormView`
Expected: FAIL (placeholder renders nothing).

- [ ] **Step 3: Implement the form view**

Replace `frontend/src/views/InstructorFormView.vue` with:

```vue
<script setup lang="ts">
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
import WeeklySchedule from '../components/WeeklySchedule.vue';
import { centsToEuroInput, formatCents, formatHours, parseEuroToCents } from '../utils/format';
import {
  emptyRecipient,
  fromRecipientDto,
  type RecipientFormValue,
  toRecipientData,
} from '../utils/recipientForm';

const route = useRoute();
const router = useRouter();

const instructorId = route.params.id ? Number(route.params.id) : null;
const isEdit = instructorId !== null;

const recipient = ref<RecipientFormValue>(emptyRecipient());
const hourlyRate = ref('');
const months = ref<number | string>(1);
const timeBlocks = ref<TimeBlock[]>([]);
const weeksPerMonth = ref(DEFAULT_WEEKS_PER_MONTH);

const error = ref('');
const saving = ref(false);
const savedSnapshot = ref('');

const rentInputs = computed<InstructorRentInputs>(() => ({
  hourlyRateCents: parseEuroToCents(hourlyRate.value),
  months: Number(months.value),
  timeBlocks: timeBlocks.value,
}));
const issues = computed(() => validateInstructorRent(rentInputs.value));
const recipientError = computed(() =>
  recipient.value.name.trim() ? '' : 'Recipient name is required',
);
const result = computed(() =>
  issues.value.length === 0 ? calculateInstructorRent(rentInputs.value, weeksPerMonth.value) : null,
);
const canSave = computed(() => issues.value.length === 0 && !recipientError.value && !saving.value);

function fieldIssue(path: string): string {
  return issues.value.find((issue) => issue.path === path)?.message ?? '';
}

function snapshot(): string {
  return JSON.stringify([
    recipient.value,
    hourlyRate.value,
    Number(months.value),
    timeBlocks.value,
  ]);
}
const isDirty = computed(() => snapshot() !== savedSnapshot.value);

async function loadSettings() {
  const res = await fetch('/api/instructor/settings');
  if (res.ok) weeksPerMonth.value = ((await res.json()) as InstructorSettingsDto).weeksPerMonth;
}

async function loadInstructor() {
  if (!isEdit) return;
  const res = await fetch(`/api/instructor/${instructorId}`);
  if (!res.ok) {
    error.value = 'Instructor not found';
    return;
  }
  const dto = (await res.json()) as InstructorDto;
  recipient.value = fromRecipientDto(dto.recipient);
  hourlyRate.value = centsToEuroInput(dto.hourlyRateCents);
  months.value = dto.months;
  timeBlocks.value = dto.timeBlocks;
  savedSnapshot.value = snapshot();
}

async function save() {
  if (!canSave.value) return;
  error.value = '';
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
      error.value = ((await res.json()) as { error?: string }).error ?? 'Saving failed';
      return;
    }
    router.push('/instructor');
  } catch {
    error.value = 'Saving failed';
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!isEdit || !confirm('Delete this instructor? The recipient is kept.')) return;
  const res = await fetch(`/api/instructor/${instructorId}`, { method: 'DELETE' });
  if (!res.ok) {
    error.value = 'Deleting failed';
    return;
  }
  router.push('/instructor');
}

function createInvoice() {
  router.push(`/invoice/new?fromInstructor=${instructorId}`);
}

onMounted(async () => {
  await Promise.all([loadSettings(), loadInstructor()]);
});
</script>

<template>
  <div>
    <h2 class="text-2xl font-bold text-gray-800 mb-6">
      {{ isEdit ? 'Edit instructor' : 'New instructor' }}
    </h2>

    <div
      v-if="error"
      data-testid="form-error"
      class="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700"
    >
      {{ error }}
    </div>

    <form class="space-y-6" @submit.prevent="save">
      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 class="font-semibold text-gray-800 mb-4">Recipient</h3>
        <RecipientPicker v-model="recipient" />
        <p v-if="recipientError" class="text-xs text-red-600 mt-2">{{ recipientError }}</p>
      </div>

      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 class="font-semibold text-gray-800 mb-4">Rent</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label for="hourly-rate" class="block text-sm font-medium text-gray-700 mb-1"
              >Hourly rate (€, net)</label
            >
            <input
              id="hourly-rate"
              v-model="hourlyRate"
              data-testid="hourly-rate"
              type="text"
              inputmode="decimal"
              placeholder="12,50"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p
              v-if="fieldIssue('hourlyRateCents')"
              data-testid="hourly-rate-error"
              class="text-xs text-red-600 mt-1"
            >
              {{ fieldIssue('hourlyRateCents') }}
            </p>
          </div>
          <div>
            <label for="months" class="block text-sm font-medium text-gray-700 mb-1">Months</label>
            <input
              id="months"
              v-model="months"
              data-testid="months"
              type="number"
              min="1"
              step="1"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p
              v-if="fieldIssue('months')"
              data-testid="months-error"
              class="text-xs text-red-600 mt-1"
            >
              {{ fieldIssue('months') }}
            </p>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 class="font-semibold text-gray-800 mb-4">Weekly schedule</h3>
        <WeeklySchedule v-model="timeBlocks" :issues="issues" />
      </div>

      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 class="font-semibold text-gray-800 mb-4">
          Summary (net, {{ String(weeksPerMonth).replace('.', ',') }} weeks/month)
        </h3>
        <dl class="grid grid-cols-3 gap-4 text-sm">
          <div>
            <dt class="text-gray-500">Hours per week</dt>
            <dd data-testid="summary-hours" class="font-medium">
              {{ result ? `${formatHours(result.netMinutesPerWeek)} h` : '—' }}
            </dd>
          </div>
          <div>
            <dt class="text-gray-500">Per month</dt>
            <dd data-testid="summary-monthly" class="font-medium">
              {{ result ? formatCents(result.monthlyCents) : '—' }}
            </dd>
          </div>
          <div>
            <dt class="text-gray-500">Total</dt>
            <dd data-testid="summary-total" class="font-semibold">
              {{ result ? formatCents(result.totalCents) : '—' }}
            </dd>
          </div>
        </dl>
      </div>

      <div class="flex gap-3">
        <button
          type="submit"
          data-testid="save"
          :disabled="!canSave"
          class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Save
        </button>
        <button
          v-if="isEdit"
          type="button"
          data-testid="create-invoice"
          :disabled="isDirty"
          :title="isDirty ? 'Save your changes first' : ''"
          class="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          @click="createInvoice"
        >
          Create invoice
        </button>
        <button
          v-if="isEdit"
          type="button"
          data-testid="delete"
          class="px-4 py-2 border border-red-300 text-red-700 rounded-lg text-sm font-medium hover:bg-red-50 ml-auto"
          @click="remove"
        >
          Delete
        </button>
      </div>
    </form>
  </div>
</template>
```

Note: the `save` button is `type="submit"`; in the test, `trigger('click')` on a submit button inside a form does not submit in jsdom. If the "posts the expected body" test does not see a POST, change the button to `type="button"` with `@click="save"` and keep `@submit.prevent="save"` on the form — do not change the test.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit --workspace=frontend -- InstructorFormView`
Expected: PASS.

- [ ] **Step 5: Full verification and commit**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS.

```bash
git add frontend/src/views/InstructorFormView.vue frontend/src/__tests__/InstructorFormView.test.ts
git commit -m "feat: add instructor form with weekly schedule and live summary

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Prefill the invoice form from an instructor

**Files:**

- Modify: `frontend/src/views/InvoiceFormView.vue` (script only; additive)
- Test: `frontend/src/__tests__/InvoiceFormView.test.ts` (new)

**Interfaces:**

- Consumes: `GET /api/instructor/:id/invoice-prefill` → `InstructorInvoicePrefillDto` (Task 6); existing `selectRecipient(e: InvoiceRecipientDto)` and `updateGross()` in `InvoiceFormView.vue`
- Produces: `/invoice/new?fromInstructor=:id` opens with recipient selected, `title`, `lineItems` and today's `invoiceDate` set

- [ ] **Step 1: Write the failing test**

Create `frontend/src/__tests__/InvoiceFormView.test.ts`:

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import type { InstructorInvoicePrefillDto } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRoute, useRouter } from 'vue-router';
import InvoiceFormView from '../views/InvoiceFormView.vue';

vi.mock('vue-router', () => ({
  useRoute: vi.fn(),
  useRouter: vi.fn(),
}));

const prefill: InstructorInvoicePrefillDto = {
  recipient: {
    id: 7,
    name: 'Anna Alt',
    street: 'Hauptstr. 1',
    city: '12345 Berlin',
    email: 'anna@example.org',
    salutation: 'Frau',
  },
  title: 'Raummiete',
  lineItems: [
    {
      text: 'Raummiete 6 Monate (7,5 h/Woche × 3,25 Wochen × 6 Monate × 12,00 €)',
      priceInCents: 175500,
    },
  ],
};

interface InvoiceFormVM {
  inputs: {
    name: string;
    street: string;
    title: string;
    invoiceDate: string;
    lineItems: unknown[];
  };
  recipient: { id: number } | null;
}

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: () => Promise.resolve(body) } as Response;
}

describe('InvoiceFormView — prefill from instructor', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/templates') return Promise.resolve(jsonResponse([{ type: 'RECHNUNG' }]));
        if (url === '/api/instructor/5/invoice-prefill')
          return Promise.resolve(jsonResponse(prefill));
        return Promise.resolve(jsonResponse({}, false));
      }),
    );
    (useRouter as ReturnType<typeof vi.fn>).mockReturnValue({ push: vi.fn(), replace: vi.fn() });
    (useRoute as ReturnType<typeof vi.fn>).mockReturnValue({
      params: {},
      query: { fromInstructor: '5' },
    });
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fills recipient, title, line item and today as invoice date', async () => {
    const wrapper = mount(InvoiceFormView);
    await flushPromises();

    const vm = wrapper.vm as unknown as InvoiceFormVM;
    expect(vm.recipient?.id).toBe(7);
    expect(vm.inputs.name).toBe('Anna Alt');
    expect(vm.inputs.street).toBe('Hauptstr. 1');
    expect(vm.inputs.title).toBe('Raummiete');
    expect(vm.inputs.lineItems).toEqual(prefill.lineItems);
    expect(vm.inputs.invoiceDate).toBe(new Date().toISOString().split('T')[0]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit --workspace=frontend -- InvoiceFormView`
Expected: FAIL (`recipient` is null / title empty).

`wrapper.vm` exposes `<script setup>` bindings in tests (the existing `InvoiceView.test.ts` relies on this). If it does not here, assert via the DOM instead (recipient search input value `Anna Alt`, an input with value `Raummiete`) — do not add `defineExpose` to `InvoiceFormView.vue`.

- [ ] **Step 3: Add the prefill branch**

In `frontend/src/views/InvoiceFormView.vue`:

1. Change the shared type import line to:

```ts
import type { InstructorInvoicePrefillDto, InvoiceInputs, InvoiceRecipientDto } from 'shared';
```

2. After the line `const isCopy = !!copyFromId;` add:

```ts
const fromInstructorId = route.query.fromInstructor
  ? parseInt(String(route.query.fromInstructor))
  : null;
```

3. After the `copyFromInvoice` function add:

```ts
async function prefillFromInstructor() {
  if (!fromInstructorId) return;
  const res = await fetch(`/api/instructor/${fromInstructorId}/invoice-prefill`);
  if (!res.ok) {
    error.value = 'Could not load instructor data';
    return;
  }
  const data = (await res.json()) as InstructorInvoicePrefillDto;
  selectRecipient(data.recipient);
  inputs.value.title = data.title;
  inputs.value.lineItems = data.lineItems;
  inputs.value.invoiceDate = new Date().toISOString().split('T')[0];
}
```

4. In `onMounted`, extend the branch so it reads:

```ts
if (isNewRevision) {
  await ladeRevision();
} else if (isCopy) {
  await copyFromInvoice();
} else if (fromInstructorId) {
  await prefillFromInstructor();
}
updateGross();
```

Nothing else in the file changes.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit --workspace=frontend -- InvoiceFormView`
Expected: PASS.

- [ ] **Step 5: Full verification and commit**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS.

```bash
git add frontend/src/views/InvoiceFormView.vue frontend/src/__tests__/InvoiceFormView.test.ts
git commit -m "feat: prefill invoice form from instructor rent

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Final verification

**Files:** none (verification only; fix-ups get their own commit)

- [ ] **Step 1: Full suite**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS, zero warnings.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: all workspaces build. Then repeat the smoke check from Task 6 Step 7 (start `node backend/dist/backend/src/index.js` against a scratch DB, `curl /api/instructor/settings` → `{"weeksPerMonth":3.25}`), and clean up the scratch files.

- [ ] **Step 3: Manual walkthrough in the running app**

Run `npm run dev` (in the worktree), then in a browser:

1. Sidebar → Instructor Rent → New instructor.
2. Create recipient "Test Lehrer", rate `12,50`, months `6`, Mo 14:00–18:00 with Pause 16:00–16:30, Do 09:00–13:00. Summary shows `7,5 h`, `304,69 €`, `1.828,13 €`.
   (450 × 1250 × 3.25 / 60 = 30468.75 → 30469; × 6 → 182812.5 → 182813.)
3. Save → list shows the row and the footer sum.
4. Change weeks per month to `4` → totals update.
5. Create invoice → invoice form shows recipient, title `Raummiete`, the line text and amount.
6. Add an overlapping Mo block → error shown, Save disabled.

Report any deviation instead of silently fixing the plan's expectations.

- [ ] **Step 4: Branch status**

Run: `git status --short && git log --oneline master..HEAD`
Expected: clean tree; spec, plan and task commits only.
