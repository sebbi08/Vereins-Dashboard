# PrimeVue Rewrite — Plan 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install and configure PrimeVue 5 (Aura, German date locale, optional license key), add the System/Light/Dark theme mode, rebuild the app shell (sidebar, mobile drawer, toasts, confirm dialog) and the dashboard, and provide the shared building blocks and test setup that the screen plans build on.

**Architecture:** PrimeVue is configured once in `main.ts` from `src/primevue.ts`. A module-level composable `useThemeMode` owns the color mode and toggles `.app-dark` on `<html>` (PrimeVue's `darkModeSelector`). The shell (`App.vue`) hosts the sidebar navigation (`AppSidebar.vue`, PrimeVue `Menu` + `SelectButton`), a `Drawer` for narrow screens, and global `Toast` / `ConfirmDialog`. Thin wrappers `useNotify` / `useConfirmAction` replace `alert`/`confirm` for later screens. Tailwind stays installed in this plan so unmigrated screens keep working.

**Tech Stack:** Vue 3 `<script setup>` + TypeScript, Vite, PrimeVue 5.0.2, `@primeuix/themes` 3.0.1 (Aura), PrimeIcons 8, Vue Router 4, Pinia, Vitest + @vue/test-utils + jsdom.

**Spec:** `docs/superpowers/specs/2026-10-05-primevue-frontend-design.md`

**Plan series (all on branch `feat/primevue`, merged once at the end):** 1 Foundation (this plan) → 2 Invoices → 3 Donation receipts (+ `DonorAutocomplete`) → 4 Instructor rent (+ `RecipientPicker`) → 5 Tailwind removal, e2e, final verification. Plans 2–5 are written after this plan lands, using its building blocks.

## Global Constraints

- Work only in the worktree `.claude/worktrees/feat-primevue` on branch `feat/primevue`. Never touch `master` or other branches; never push.
- Verification after every task: `npm run lint && npm run test:unit && npm run test:integration` (all pass, zero lint warnings).
- Versions: `primevue@^5.0.2`, `@primeuix/themes@^3.0.1`, `primeicons@^8.0.2`, `@primevue/core@^5.0.2` (explicit, for `@primevue/core/api` / `config` imports). Frontend workspace only.
- Explicit component imports (`import Button from 'primevue/button'`); no auto-import plugin. Do not use deprecated v5 components (`InputMask` component, `MultiSelect`, `Password`, `ScrollPanel`, `Galleria`, `Image`, `ColorPicker`).
- Dark mode: class `app-dark` on `document.documentElement`; PrimeVue `theme.options.darkModeSelector: '.app-dark'`. Storage key `mv-theme`; values `system` | `light` | `dark`; unknown/unreadable → `system`.
- License: `license: import.meta.env.VITE_PRIMEUI_LICENSE || undefined`. Docker build arg `PRIMEUI_LICENSE` → `ENV VITE_PRIMEUI_LICENSE`. Never commit a key.
- Locale (only these keys overridden, merged over PrimeVue defaults): `dateFormat: 'dd.mm.yy'`, `firstDayOfWeek: 1`, German `dayNames`, `dayNamesShort`, `dayNamesMin`, `monthNames`, `monthNamesShort`. UI text stays English.
- Tailwind stays installed and working in this plan (removed in plan 5). New/rewritten files in this plan must not use Tailwind classes — scoped CSS + `src/assets/layout.css` only.
- Existing tests must keep passing; existing `data-testid`s, link `href`s (e2e uses `a[href="/donation-receipt"]`) and the `<p>` containing `Version …` (e2e uses `p*=Version`) must be preserved.
- Commit messages: conventional commits ending with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Spec deviations decided in planning: the composable is named `useThemeMode` (not `useTheme` — `@primeuix/themes` exports its own `useTheme`); the test helper is `withPrimeVue(global)` returning mount `global` options (not `mountWithPrimeVue`); `RecipientPicker` / `DonorAutocomplete` migrate with their screens (plans 3 and 4), not in this plan.

## Review Focus

1. **Blocked or corrupted localStorage** (private window, `mv-theme = "purple"`) → app starts in System mode without throwing. Test: Task 2.
2. **OS theme changes while the app is open in System mode** → page follows immediately; in Light/Dark mode it does not. Test: Task 2.
3. **Deep links** (`/invoice/12`, `/invoice/draft/5`, `/donation-receipt/settings`) → the sidebar highlights exactly one, the most specific matching entry. Test: Task 5.
4. **Narrow screens** → navigation reachable via the drawer, and choosing an entry closes the drawer. Test: Task 5.
5. **Confirm dialog dismissed via Escape / close icon** → resolves as "cancel" (false), never leaves a pending promise or performs the action. Test: Task 3.

---

## File Structure

| File                                                 | Responsibility                                                                     |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `frontend/package.json`                              | PrimeVue dependencies                                                              |
| `frontend/src/primevue.ts` (new)                     | `primeVueOptions(license?)`, `DE_DATE_LOCALE`                                      |
| `frontend/src/main.ts`                               | Install PrimeVue, ToastService, ConfirmationService, CSS; apply theme before mount |
| `frontend/src/vite-env.d.ts`                         | `VITE_PRIMEUI_LICENSE` typing                                                      |
| `Dockerfile`                                         | `PRIMEUI_LICENSE` build arg                                                        |
| `frontend/src/assets/layout.css` (new)               | App background/text + layout helpers using PrimeVue CSS variables                  |
| `frontend/vitest.config.ts`                          | `setupFiles`                                                                       |
| `frontend/src/__tests__/setup.ts` (new)              | `matchMedia` polyfill for jsdom                                                    |
| `frontend/src/__tests__/helpers/primeVue.ts` (new)   | `withPrimeVue(global)`                                                             |
| `frontend/src/composables/useThemeMode.ts` (new)     | Theme mode state, persistence, `.app-dark`                                         |
| `frontend/src/composables/useNotify.ts` (new)        | Toast wrapper                                                                      |
| `frontend/src/composables/useConfirmAction.ts` (new) | Promise-based confirm wrapper                                                      |
| `frontend/src/components/ui/PageHeader.vue` (new)    | Page title + actions slot                                                          |
| `frontend/src/components/ui/FormSection.vue` (new)   | Card with heading for form sections                                                |
| `frontend/src/utils/tableDefaults.ts` (new)          | DataTable defaults + global filter model                                           |
| `frontend/src/components/navItems.ts` (new)          | Navigation entries + `activeNavKey`                                                |
| `frontend/src/components/AppSidebar.vue`             | Navigation menu, theme toggle, version                                             |
| `frontend/src/App.vue`                               | Shell: sidebar, top bar + drawer, Toast, ConfirmDialog                             |
| `frontend/src/views/HomeView.vue`                    | Dashboard tiles                                                                    |

---

### Task 1: Install and configure PrimeVue, test setup

**Files:**

- Modify: `frontend/package.json` (via npm), `frontend/src/main.ts`, `frontend/src/vite-env.d.ts`, `frontend/vitest.config.ts`, `Dockerfile`
- Create: `frontend/src/primevue.ts`, `frontend/src/assets/layout.css`, `frontend/src/__tests__/setup.ts`, `frontend/src/__tests__/helpers/primeVue.ts`
- Test: `frontend/src/__tests__/primevueSetup.test.ts`

**Interfaces:**

- Produces:
  - `primeVueOptions(license?: string): PrimeVueConfiguration` and `DE_DATE_LOCALE` from `frontend/src/primevue.ts`
  - `withPrimeVue(global?: GlobalOptions): GlobalOptions` from `frontend/src/__tests__/helpers/primeVue.ts` — adds PrimeVue (Aura, `.app-dark`), `ToastService`, `ConfirmationService` to `global.plugins`, keeping caller plugins first
  - `layout.css` classes: `.stack`, `.row`, `.row--between`, `.grid-2`, `.gap-1`…`.gap-4`, `.muted`, `.page`, `.field`; CSS variable `--app-bg`

- [ ] **Step 1: Install dependencies**

Run:

```bash
npm install --workspace=frontend primevue@^5.0.2 @primeuix/themes@^3.0.1 primeicons@^8.0.2 @primevue/core@^5.0.2
```

Expected: `frontend/package.json` lists the four packages under `dependencies`; `package-lock.json` updated.

- [ ] **Step 2: Write the failing test**

Create `frontend/src/__tests__/primevueSetup.test.ts`:

```ts
import { mount } from '@vue/test-utils';
import Button from 'primevue/button';
import { describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';
import { DE_DATE_LOCALE, primeVueOptions } from '../primevue';
import { withPrimeVue } from './helpers/primeVue';

describe('primeVueOptions', () => {
  it('uses the Aura preset with the app-dark selector', () => {
    const options = primeVueOptions();
    expect(options.theme.options.darkModeSelector).toBe('.app-dark');
    expect(options.theme.preset).toBeTruthy();
  });

  it('passes a license key only when one is given', () => {
    expect(primeVueOptions().license).toBeUndefined();
    expect(primeVueOptions('').license).toBeUndefined();
    expect(primeVueOptions('KEY-123').license).toBe('KEY-123');
  });

  it('formats dates German-style with Monday first', () => {
    expect(DE_DATE_LOCALE.dateFormat).toBe('dd.mm.yy');
    expect(DE_DATE_LOCALE.firstDayOfWeek).toBe(1);
    expect(DE_DATE_LOCALE.dayNamesMin).toEqual(['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']);
    expect(DE_DATE_LOCALE.monthNames[2]).toBe('März');
    expect(primeVueOptions().locale).toMatchObject(DE_DATE_LOCALE);
  });
});

describe('withPrimeVue', () => {
  it('mounts PrimeVue components', () => {
    const Host = defineComponent({ render: () => h(Button, { label: 'Speichern' }) });
    const wrapper = mount(Host, { global: withPrimeVue() });
    expect(wrapper.find('button').text()).toContain('Speichern');
  });

  it('keeps plugins passed by the caller', () => {
    let installed = false;
    const plugin = { install: () => (installed = true) };
    mount(defineComponent({ render: () => h('div') }), {
      global: withPrimeVue({ plugins: [plugin] }),
    });
    expect(installed).toBe(true);
  });

  it('provides matchMedia in jsdom', () => {
    expect(window.matchMedia('(prefers-color-scheme: dark)').matches).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test:unit --workspace=frontend -- primevueSetup`
Expected: FAIL — cannot resolve `../primevue` / `./helpers/primeVue`.

- [ ] **Step 4: Add the PrimeVue options module**

Create `frontend/src/primevue.ts`:

```ts
import Aura from '@primeuix/themes/aura';
import { defaultOptions, type PrimeVueConfiguration } from 'primevue/config';

/** German date formatting for DatePicker; all other PrimeVue labels stay English. */
export const DE_DATE_LOCALE = {
  dateFormat: 'dd.mm.yy',
  firstDayOfWeek: 1,
  dayNames: ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'],
  dayNamesShort: ['Son', 'Mon', 'Die', 'Mit', 'Don', 'Fre', 'Sam'],
  dayNamesMin: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
  monthNames: [
    'Januar',
    'Februar',
    'März',
    'April',
    'Mai',
    'Juni',
    'Juli',
    'August',
    'September',
    'Oktober',
    'November',
    'Dezember',
  ],
  monthNamesShort: [
    'Jan',
    'Feb',
    'Mär',
    'Apr',
    'Mai',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Okt',
    'Nov',
    'Dez',
  ],
};

export function primeVueOptions(license?: string) {
  return {
    theme: { preset: Aura, options: { darkModeSelector: '.app-dark' } },
    locale: { ...defaultOptions.locale, ...DE_DATE_LOCALE },
    license: license || undefined,
  } satisfies PrimeVueConfiguration;
}
```

If TypeScript reports that `license` is not part of `PrimeVueConfiguration` exported from `primevue/config`, import the type from `@primevue/core/config` instead (it declares `license?: string` in 5.0.2). Do not change the runtime shape.

- [ ] **Step 5: Add the test helper and jsdom setup**

Create `frontend/src/__tests__/helpers/primeVue.ts`:

```ts
import type { MountingOptions } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import ConfirmationService from 'primevue/confirmationservice';
import ToastService from 'primevue/toastservice';
import { primeVueOptions } from '../../primevue';

type GlobalOptions = NonNullable<MountingOptions<Record<string, unknown>>['global']>;

/** Mount `global` options with PrimeVue, ToastService and ConfirmationService installed. */
export function withPrimeVue(global: GlobalOptions = {}): GlobalOptions {
  return {
    ...global,
    plugins: [
      ...(global.plugins ?? []),
      [PrimeVue, primeVueOptions()],
      ToastService,
      ConfirmationService,
    ],
  };
}
```

Create `frontend/src/__tests__/setup.ts`:

```ts
// jsdom has no matchMedia; PrimeVue and useThemeMode query it.
if (typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  });
}
```

In `frontend/vitest.config.ts`, add inside `test: { … }`:

```ts
    setupFiles: ['src/__tests__/setup.ts'],
```

(`include` stays `src/__tests__/**/*.test.ts`, so `setup.ts` and `helpers/` are not collected as tests.)

- [ ] **Step 6: Wire PrimeVue into the app**

Replace `frontend/src/main.ts` with:

```ts
import { createPinia } from 'pinia';
import 'primeicons/primeicons.css';
import PrimeVue from 'primevue/config';
import ConfirmationService from 'primevue/confirmationservice';
import ToastService from 'primevue/toastservice';
import { createApp } from 'vue';
import App from './App.vue';
import './assets/layout.css';
import { primeVueOptions } from './primevue';
import router from './router';
import './style.css';

const app = createApp(App);

app.use(createPinia());
app.use(router);
app.use(PrimeVue, primeVueOptions(import.meta.env.VITE_PRIMEUI_LICENSE));
app.use(ToastService);
app.use(ConfirmationService);
app.mount('#app');
```

(Task 2 adds `applyStoredTheme()` before `createApp`.)

In `frontend/src/vite-env.d.ts`, add to `ImportMetaEnv`:

```ts
  readonly VITE_PRIMEUI_LICENSE?: string;
```

In `Dockerfile` (build stage), directly below `ENV VITE_APP_VERSION=${VERSION}` add:

```dockerfile
ARG PRIMEUI_LICENSE
ENV VITE_PRIMEUI_LICENSE=${PRIMEUI_LICENSE}
```

Create `frontend/src/assets/layout.css`:

```css
/* App-wide base and layout helpers. Colors come from PrimeVue's theme variables so both
   color modes work without extra rules. */
:root {
  --app-bg: var(--p-surface-50);
  --app-sidebar-width: 16rem;
}

.app-dark {
  --app-bg: var(--p-surface-950);
}

body {
  margin: 0;
  background: var(--app-bg);
  color: var(--p-text-color);
  font-family:
    system-ui,
    -apple-system,
    'Segoe UI',
    Roboto,
    sans-serif;
}

.page {
  max-width: 80rem;
}

.stack {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.row--between {
  justify-content: space-between;
}

.grid-2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

@media (max-width: 767px) {
  .grid-2 {
    grid-template-columns: 1fr;
  }
}

.gap-1 {
  gap: 0.25rem;
}

.gap-2 {
  gap: 0.5rem;
}

.gap-3 {
  gap: 1rem;
}

.gap-4 {
  gap: 1.5rem;
}

.muted {
  color: var(--p-text-muted-color);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.field > label {
  font-size: 0.875rem;
  font-weight: 500;
}
```

If `primeicons/primeicons.css` does not resolve in `primeicons@8` (build or test error "Failed to resolve import"), locate the CSS file with `ls node_modules/primeicons` and import that path instead; report it.

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm run test:unit --workspace=frontend -- primevueSetup`
Expected: PASS (6 tests). PrimeVue's license notice (no key in tests) is appended to `document.body` and must not affect these assertions; if any PrimeVue console warning/error appears in the test output, report it verbatim.

- [ ] **Step 8: Build check**

Run: `npm run build`
Expected: succeeds (frontend bundle includes PrimeVue; Tailwind still active).

- [ ] **Step 9: Full verification and commit**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS (all existing tests unchanged).

```bash
git add frontend/package.json package-lock.json frontend/src/primevue.ts frontend/src/main.ts frontend/src/vite-env.d.ts frontend/vitest.config.ts frontend/src/assets/layout.css frontend/src/__tests__/setup.ts frontend/src/__tests__/helpers/primeVue.ts frontend/src/__tests__/primevueSetup.test.ts Dockerfile
git commit -m "feat: install and configure PrimeVue 5

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Theme mode (System / Light / Dark)

**Files:**

- Create: `frontend/src/composables/useThemeMode.ts`
- Modify: `frontend/src/main.ts` (call `applyStoredTheme()` before `createApp`)
- Test: `frontend/src/__tests__/useThemeMode.test.ts`

**Interfaces:**

- Produces (from `frontend/src/composables/useThemeMode.ts`):
  - `type ThemeMode = 'system' | 'light' | 'dark'`
  - `const THEME_STORAGE_KEY = 'mv-theme'`, `const DARK_CLASS = 'app-dark'`
  - `applyStoredTheme(): void` — reads storage, subscribes once to the OS preference, applies the class
  - `useThemeMode(): { mode: Readonly<Ref<ThemeMode>>; setMode(mode: ThemeMode): void }` — shared module-level state

- [ ] **Step 1: Write the failing test**

Create `frontend/src/__tests__/useThemeMode.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ThemeModule = typeof import('../composables/useThemeMode');

function mockSystemDark(initial: boolean) {
  const listeners: Array<() => void> = [];
  const mql = {
    matches: initial,
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_type: string, listener: () => void) => listeners.push(listener),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => mql),
  );
  return {
    change(next: boolean) {
      mql.matches = next;
      listeners.forEach((listener) => listener());
    },
  };
}

async function loadModule(): Promise<ThemeModule> {
  vi.resetModules();
  return import('../composables/useThemeMode');
}

function isDark(): boolean {
  return document.documentElement.classList.contains('app-dark');
}

describe('useThemeMode', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('app-dark');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('defaults to system mode and follows the OS preference', async () => {
    const os = mockSystemDark(true);
    const { applyStoredTheme, useThemeMode } = await loadModule();

    applyStoredTheme();

    expect(useThemeMode().mode.value).toBe('system');
    expect(isDark()).toBe(true);
    os.change(false);
    expect(isDark()).toBe(false);
  });

  it('restores a stored mode', async () => {
    mockSystemDark(false);
    localStorage.setItem('mv-theme', 'dark');
    const { applyStoredTheme, useThemeMode } = await loadModule();

    applyStoredTheme();

    expect(useThemeMode().mode.value).toBe('dark');
    expect(isDark()).toBe(true);
  });

  it('falls back to system for an unknown stored value', async () => {
    mockSystemDark(false);
    localStorage.setItem('mv-theme', 'purple');
    const { applyStoredTheme, useThemeMode } = await loadModule();

    applyStoredTheme();

    expect(useThemeMode().mode.value).toBe('system');
    expect(isDark()).toBe(false);
  });

  it('falls back to system when storage is blocked', async () => {
    mockSystemDark(false);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { applyStoredTheme, useThemeMode } = await loadModule();

    expect(() => applyStoredTheme()).not.toThrow();
    expect(useThemeMode().mode.value).toBe('system');
    expect(() => useThemeMode().setMode('dark')).not.toThrow();
    expect(isDark()).toBe(true);
  });

  it('setMode applies and persists the mode', async () => {
    mockSystemDark(true);
    const { applyStoredTheme, useThemeMode } = await loadModule();
    applyStoredTheme();
    const theme = useThemeMode();

    theme.setMode('light');
    expect(isDark()).toBe(false);
    expect(localStorage.getItem('mv-theme')).toBe('light');

    theme.setMode('dark');
    expect(isDark()).toBe(true);
    expect(localStorage.getItem('mv-theme')).toBe('dark');
  });

  it('ignores OS changes while an explicit mode is set', async () => {
    const os = mockSystemDark(false);
    const { applyStoredTheme, useThemeMode } = await loadModule();
    applyStoredTheme();

    useThemeMode().setMode('light');
    os.change(true);

    expect(isDark()).toBe(false);
  });

  it('shares state between callers', async () => {
    mockSystemDark(false);
    const { applyStoredTheme, useThemeMode } = await loadModule();
    applyStoredTheme();

    useThemeMode().setMode('dark');

    expect(useThemeMode().mode.value).toBe('dark');
  });

  it('works without matchMedia (system means light)', async () => {
    vi.stubGlobal('matchMedia', undefined);
    const { applyStoredTheme, useThemeMode } = await loadModule();

    expect(() => applyStoredTheme()).not.toThrow();
    expect(useThemeMode().mode.value).toBe('system');
    expect(isDark()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit --workspace=frontend -- useThemeMode`
Expected: FAIL — cannot resolve `../composables/useThemeMode`.

- [ ] **Step 3: Implement the composable**

Create `frontend/src/composables/useThemeMode.ts`:

```ts
import { readonly, ref, type Ref } from 'vue';

export type ThemeMode = 'system' | 'light' | 'dark';

export const THEME_STORAGE_KEY = 'mv-theme';
export const DARK_CLASS = 'app-dark';

const MODES: readonly ThemeMode[] = ['system', 'light', 'dark'];

const mode = ref<ThemeMode>('system');
let systemQuery: MediaQueryList | null = null;

function readStoredMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return MODES.includes(stored as ThemeMode) ? (stored as ThemeMode) : 'system';
  } catch {
    return 'system';
  }
}

function writeStoredMode(next: ThemeMode) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Storage blocked (private mode, policy): the mode still applies for this session.
  }
}

function applyMode() {
  const dark = mode.value === 'dark' || (mode.value === 'system' && !!systemQuery?.matches);
  document.documentElement.classList.toggle(DARK_CLASS, dark);
}

function onSystemChange() {
  if (mode.value === 'system') applyMode();
}

/** Call once before mounting the app so the first paint already has the right theme. */
export function applyStoredTheme(): void {
  mode.value = readStoredMode();
  if (!systemQuery && typeof window.matchMedia === 'function') {
    systemQuery = window.matchMedia('(prefers-color-scheme: dark)');
    systemQuery.addEventListener('change', onSystemChange);
  }
  applyMode();
}

export function useThemeMode(): { mode: Readonly<Ref<ThemeMode>>; setMode(next: ThemeMode): void } {
  return {
    mode: readonly(mode),
    setMode(next: ThemeMode) {
      mode.value = next;
      writeStoredMode(next);
      applyMode();
    },
  };
}
```

In `frontend/src/main.ts` add the import `import { applyStoredTheme } from './composables/useThemeMode';` and call `applyStoredTheme();` directly before `const app = createApp(App);`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit --workspace=frontend -- useThemeMode`
Expected: PASS (8 tests).

- [ ] **Step 5: Full verification and commit**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS.

```bash
git add frontend/src/composables/useThemeMode.ts frontend/src/main.ts frontend/src/__tests__/useThemeMode.test.ts
git commit -m "feat: add system/light/dark theme mode

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Notification and confirmation composables

**Files:**

- Create: `frontend/src/composables/useNotify.ts`, `frontend/src/composables/useConfirmAction.ts`
- Test: `frontend/src/__tests__/useNotify.test.ts`, `frontend/src/__tests__/useConfirmAction.test.ts`

**Interfaces:**

- Produces:
  - `useNotify(): { success(detail: string): void; info(detail: string): void; error(detail: string): void }` — toasts with summaries `Success` / `Info` / `Error`, life 4000 / 4000 / 6000 ms
  - `interface ConfirmActionOptions { message: string; header?: string; acceptLabel?: string; danger?: boolean }`
  - `useConfirmAction(): { confirmAction(options: ConfirmActionOptions): Promise<boolean> }` — resolves `true` on accept, `false` on reject or any other close (Escape, close icon); resolves exactly once

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/__tests__/useNotify.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useNotify } from '../composables/useNotify';

const add = vi.fn();
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add }) }));

describe('useNotify', () => {
  afterEach(() => add.mockReset());

  it('shows success, info and error toasts', () => {
    const notify = useNotify();

    notify.success('Saved');
    notify.info('Heads up');
    notify.error('Failed');

    expect(add.mock.calls.map(([message]) => message)).toEqual([
      { severity: 'success', summary: 'Success', detail: 'Saved', life: 4000 },
      { severity: 'info', summary: 'Info', detail: 'Heads up', life: 4000 },
      { severity: 'error', summary: 'Error', detail: 'Failed', life: 6000 },
    ]);
  });
});
```

Create `frontend/src/__tests__/useConfirmAction.test.ts`:

```ts
import type { ConfirmationOptions } from 'primevue/confirmationoptions';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useConfirmAction } from '../composables/useConfirmAction';

let lastOptions: ConfirmationOptions | null = null;
vi.mock('primevue/useconfirm', () => ({
  useConfirm: () => ({ require: (options: ConfirmationOptions) => (lastOptions = options) }),
}));

describe('useConfirmAction', () => {
  afterEach(() => {
    lastOptions = null;
  });

  it('resolves true when accepted', async () => {
    const result = useConfirmAction().confirmAction({ message: 'Delete?' });
    lastOptions!.accept!();
    lastOptions!.onHide!();
    await expect(result).resolves.toBe(true);
  });

  it('resolves false when rejected', async () => {
    const result = useConfirmAction().confirmAction({ message: 'Delete?' });
    lastOptions!.reject!();
    await expect(result).resolves.toBe(false);
  });

  it('resolves false when the dialog is closed without a choice', async () => {
    const result = useConfirmAction().confirmAction({ message: 'Delete?' });
    lastOptions!.onHide!();
    await expect(result).resolves.toBe(false);
  });

  it('passes message, header and labels', () => {
    void useConfirmAction().confirmAction({ message: 'Delete?' });
    expect(lastOptions).toMatchObject({
      message: 'Delete?',
      header: 'Please confirm',
      icon: 'pi pi-question-circle',
      rejectProps: { label: 'Cancel', severity: 'secondary', outlined: true },
      acceptProps: { label: 'OK' },
    });
  });

  it('styles dangerous actions', () => {
    void useConfirmAction().confirmAction({
      message: 'Cancel invoice?',
      header: 'Cancel invoice',
      acceptLabel: 'Cancel invoice',
      danger: true,
    });
    expect(lastOptions).toMatchObject({
      header: 'Cancel invoice',
      icon: 'pi pi-exclamation-triangle',
      acceptProps: { label: 'Cancel invoice', severity: 'danger' },
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit --workspace=frontend -- useNotify useConfirmAction`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

Create `frontend/src/composables/useNotify.ts`:

```ts
import { useToast } from 'primevue/usetoast';

/** Toast notifications; replaces inline success/error banners and alert(). */
export function useNotify() {
  const toast = useToast();
  return {
    success: (detail: string) =>
      toast.add({ severity: 'success', summary: 'Success', detail, life: 4000 }),
    info: (detail: string) => toast.add({ severity: 'info', summary: 'Info', detail, life: 4000 }),
    error: (detail: string) =>
      toast.add({ severity: 'error', summary: 'Error', detail, life: 6000 }),
  };
}
```

Create `frontend/src/composables/useConfirmAction.ts`:

```ts
import { useConfirm } from 'primevue/useconfirm';

export interface ConfirmActionOptions {
  message: string;
  header?: string;
  acceptLabel?: string;
  danger?: boolean;
}

/** Promise-based confirm dialog; a drop-in replacement for window.confirm. */
export function useConfirmAction() {
  const confirm = useConfirm();

  function confirmAction(options: ConfirmActionOptions): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;
      const settle = (value: boolean) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      confirm.require({
        message: options.message,
        header: options.header ?? 'Please confirm',
        icon: options.danger ? 'pi pi-exclamation-triangle' : 'pi pi-question-circle',
        rejectProps: { label: 'Cancel', severity: 'secondary', outlined: true },
        acceptProps: {
          label: options.acceptLabel ?? 'OK',
          ...(options.danger && { severity: 'danger' }),
        },
        accept: () => settle(true),
        reject: () => settle(false),
        onHide: () => settle(false),
      });
    });
  }

  return { confirmAction };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit --workspace=frontend -- useNotify useConfirmAction`
Expected: PASS (6 tests).

- [ ] **Step 5: Full verification and commit**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS.

```bash
git add frontend/src/composables/useNotify.ts frontend/src/composables/useConfirmAction.ts frontend/src/__tests__/useNotify.test.ts frontend/src/__tests__/useConfirmAction.test.ts
git commit -m "feat: add toast and confirm dialog composables

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Page header, form section and table defaults

**Files:**

- Create: `frontend/src/components/ui/PageHeader.vue`, `frontend/src/components/ui/FormSection.vue`, `frontend/src/utils/tableDefaults.ts`
- Test: `frontend/src/__tests__/uiBuildingBlocks.test.ts`

**Interfaces:**

- Consumes: `withPrimeVue` (Task 1)
- Produces:
  - `<PageHeader title="…" subtitle?="…"><template #actions>…</template></PageHeader>` — `data-testid="page-title"` on the `<h2>`
  - `<FormSection title="…">…</FormSection>` — PrimeVue `Card`, title in the card title, default slot as content
  - `TABLE_DEFAULTS: { paginator: true; rows: 25; rowsPerPageOptions: number[]; removableSort: true; filterDisplay: 'row' }` (spread onto `DataTable` via `v-bind`)
  - `globalFilter(value?: string): { global: { value: string | null; matchMode: string } }` — DataTable filter model entry for the global search (`FilterMatchMode.CONTAINS`)

- [ ] **Step 1: Write the failing test**

Create `frontend/src/__tests__/uiBuildingBlocks.test.ts`:

```ts
import { FilterMatchMode } from '@primevue/core/api';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import FormSection from '../components/ui/FormSection.vue';
import PageHeader from '../components/ui/PageHeader.vue';
import { globalFilter, TABLE_DEFAULTS } from '../utils/tableDefaults';
import { withPrimeVue } from './helpers/primeVue';

describe('PageHeader', () => {
  it('renders title, subtitle and actions', () => {
    const wrapper = mount(PageHeader, {
      props: { title: 'Invoices', subtitle: 'All invoices' },
      slots: { actions: '<button>New invoice</button>' },
      global: withPrimeVue(),
    });
    expect(wrapper.find('[data-testid="page-title"]').text()).toBe('Invoices');
    expect(wrapper.text()).toContain('All invoices');
    expect(wrapper.find('button').text()).toBe('New invoice');
  });

  it('omits subtitle and actions when not given', () => {
    const wrapper = mount(PageHeader, { props: { title: 'Invoices' }, global: withPrimeVue() });
    expect(wrapper.find('.page-header__subtitle').exists()).toBe(false);
    expect(wrapper.find('.page-header__actions').exists()).toBe(false);
  });
});

describe('FormSection', () => {
  it('renders a card with title and content', () => {
    const wrapper = mount(FormSection, {
      props: { title: 'Recipient' },
      slots: { default: '<input data-testid="inner" />' },
      global: withPrimeVue(),
    });
    expect(wrapper.text()).toContain('Recipient');
    expect(wrapper.find('[data-testid="inner"]').exists()).toBe(true);
  });
});

describe('tableDefaults', () => {
  it('provides paginated, sortable defaults with a filter row', () => {
    expect(TABLE_DEFAULTS).toEqual({
      paginator: true,
      rows: 25,
      rowsPerPageOptions: [10, 25, 50, 100],
      removableSort: true,
      filterDisplay: 'row',
    });
  });

  it('builds the global filter entry', () => {
    expect(globalFilter()).toEqual({
      global: { value: null, matchMode: FilterMatchMode.CONTAINS },
    });
    expect(globalFilter('Anna').global.value).toBe('Anna');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit --workspace=frontend -- uiBuildingBlocks`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

Create `frontend/src/components/ui/PageHeader.vue`:

```vue
<script setup lang="ts">
defineProps<{
  title: string;
  subtitle?: string;
}>();
</script>

<template>
  <header class="page-header">
    <div>
      <h2 data-testid="page-title" class="page-header__title">{{ title }}</h2>
      <p v-if="subtitle" class="page-header__subtitle">{{ subtitle }}</p>
    </div>
    <div v-if="$slots.actions" class="page-header__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped>
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.page-header__title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
}

.page-header__subtitle {
  margin: 0.25rem 0 0;
  color: var(--p-text-muted-color);
}

.page-header__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
</style>
```

Create `frontend/src/components/ui/FormSection.vue`:

```vue
<script setup lang="ts">
import Card from 'primevue/card';

defineProps<{
  title: string;
}>();
</script>

<template>
  <Card class="form-section">
    <template #title>{{ title }}</template>
    <template #content>
      <slot />
    </template>
  </Card>
</template>

<style scoped>
.form-section {
  margin-bottom: 1.5rem;
}
</style>
```

Create `frontend/src/utils/tableDefaults.ts`:

```ts
import { FilterMatchMode } from '@primevue/core/api';

/** Shared DataTable settings; spread with v-bind="TABLE_DEFAULTS". */
export const TABLE_DEFAULTS = {
  paginator: true,
  rows: 25,
  rowsPerPageOptions: [10, 25, 50, 100],
  removableSort: true,
  filterDisplay: 'row',
} as const;

export function globalFilter(value?: string) {
  return { global: { value: value ?? null, matchMode: FilterMatchMode.CONTAINS } };
}
```

(The test compares `TABLE_DEFAULTS` with `toEqual` against a plain object including the array; `as const` keeps literal types for `v-bind`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit --workspace=frontend -- uiBuildingBlocks`
Expected: PASS (5 tests).

- [ ] **Step 5: Full verification and commit**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS.

```bash
git add frontend/src/components/ui/PageHeader.vue frontend/src/components/ui/FormSection.vue frontend/src/utils/tableDefaults.ts frontend/src/__tests__/uiBuildingBlocks.test.ts
git commit -m "feat: add page header, form section and table defaults

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: App shell — sidebar navigation, theme toggle, mobile drawer

**Files:**

- Create: `frontend/src/components/navItems.ts`
- Modify (replace): `frontend/src/components/AppSidebar.vue`, `frontend/src/App.vue`
- Test: `frontend/src/__tests__/AppSidebar.test.ts`, `frontend/src/__tests__/App.test.ts`

**Interfaces:**

- Consumes: `useThemeMode` (Task 2), `withPrimeVue` (Task 1)
- Produces:
  - `interface NavItem { key: string; label: string; icon: string; route: string; sub?: boolean }`, `NAV_ITEMS: NavItem[]`, `activeNavKey(path: string, items?: NavItem[]): string | null` (most specific prefix match; `/` matches only `/`)
  - `<AppSidebar :show-brand="boolean" @navigate />` — links `data-testid="nav-{key}"` with `href` = route, active link has class `app-nav__link--active`; theme toggle `data-testid="theme-toggle"`; version in a `<p>` containing `Version`
  - `App.vue`: desktop sidebar `<aside class="app-shell__sidebar">`, top bar button `data-testid="open-nav"` opens a `Drawer` containing `AppSidebar :show-brand="false"`; `<Toast />` and `<ConfirmDialog />` rendered once

Navigation entries (exact):

| key                         | label            | icon          | route                        | sub |
| --------------------------- | ---------------- | ------------- | ---------------------------- | --- |
| `dashboard`                 | Dashboard        | `pi pi-home`  | `/`                          |     |
| `invoice`                   | Invoice          | `pi pi-file`  | `/invoice`                   |     |
| `invoice-settings`          | Invoice settings | `pi pi-cog`   | `/invoice/settings`          | yes |
| `donation-receipt`          | Donation Receipt | `pi pi-heart` | `/donation-receipt`          |     |
| `donation-receipt-settings` | Receipt settings | `pi pi-cog`   | `/donation-receipt/settings` | yes |
| `instructor`                | Instructor Rent  | `pi pi-users` | `/instructor`                |     |

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/__tests__/AppSidebar.test.ts`:

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import AppSidebar from '../components/AppSidebar.vue';
import { activeNavKey, NAV_ITEMS } from '../components/navItems';
import { useThemeMode } from '../composables/useThemeMode';
import { withPrimeVue } from './helpers/primeVue';

const Blank = { template: '<div />' };

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      ...NAV_ITEMS.map((item) => ({ path: item.route, component: Blank })),
      { path: '/invoice/:id', component: Blank },
      { path: '/invoice/draft/:draftId', component: Blank },
    ],
  });
}

async function mountAt(path: string, props: Record<string, unknown> = {}) {
  const router = makeRouter();
  await router.push(path);
  await router.isReady();
  const wrapper = mount(AppSidebar, { props, global: withPrimeVue({ plugins: [router] }) });
  await flushPromises();
  return { wrapper, router };
}

describe('activeNavKey', () => {
  it.each([
    ['/', 'dashboard'],
    ['/invoice', 'invoice'],
    ['/invoice/12', 'invoice'],
    ['/invoice/draft/5', 'invoice'],
    ['/invoice/settings', 'invoice-settings'],
    ['/donation-receipt/settings', 'donation-receipt-settings'],
    ['/donation-receipt/3/revision', 'donation-receipt'],
    ['/instructor/new', 'instructor'],
    ['/unknown', null],
  ])('maps %s to %s', (path, key) => {
    expect(activeNavKey(path)).toBe(key);
  });

  it('does not treat /invoices as /invoice', () => {
    expect(activeNavKey('/invoices')).toBeNull();
  });
});

describe('AppSidebar', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    useThemeMode().setMode('system');
    document.documentElement.classList.remove('app-dark');
  });

  it('renders a link for every entry with its route as href', async () => {
    const { wrapper } = await mountAt('/');
    for (const item of NAV_ITEMS) {
      const link = wrapper.find(`[data-testid="nav-${item.key}"]`);
      expect(link.exists()).toBe(true);
      expect(link.attributes('href')).toBe(item.route);
      expect(link.text()).toContain(item.label);
    }
  });

  it('highlights only the most specific entry', async () => {
    const { wrapper } = await mountAt('/invoice/settings');
    const active = wrapper.findAll('.app-nav__link--active');
    expect(active).toHaveLength(1);
    expect(active[0].attributes('data-testid')).toBe('nav-invoice-settings');
  });

  it('navigates and emits navigate when a link is clicked', async () => {
    const { wrapper, router } = await mountAt('/');
    await wrapper.find('[data-testid="nav-instructor"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/instructor');
    expect(wrapper.emitted('navigate')).toHaveLength(1);
  });

  it('switches the color mode with the theme toggle', async () => {
    const { wrapper } = await mountAt('/');
    const toggle = wrapper.find('[data-testid="theme-toggle"]');
    const dark = toggle.findAll('button').find((b) => b.text().includes('Dark'))!;

    await dark.trigger('click');

    expect(document.documentElement.classList.contains('app-dark')).toBe(true);
    expect(localStorage.getItem('mv-theme')).toBe('dark');
  });

  it('shows brand and version', async () => {
    const { wrapper } = await mountAt('/');
    expect(wrapper.text()).toContain('MV Dashboard');
    expect(wrapper.find('p.app-nav__version').text()).toContain('Version');
  });

  it('can hide the brand', async () => {
    const { wrapper } = await mountAt('/', { showBrand: false });
    expect(wrapper.find('.app-nav__brand').exists()).toBe(false);
  });
});
```

Create `frontend/src/__tests__/App.test.ts`:

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import App from '../App.vue';
import { NAV_ITEMS } from '../components/navItems';
import { withPrimeVue } from './helpers/primeVue';

const Blank = { template: '<div data-testid="routed-page" />' };

describe('App shell', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) } as Response),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  async function mountApp() {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: NAV_ITEMS.map((item) => ({ path: item.route, component: Blank })),
    });
    await router.push('/');
    await router.isReady();
    const wrapper = mount(App, {
      attachTo: document.body,
      global: withPrimeVue({ plugins: [router, createPinia()] }),
    });
    await flushPromises();
    return { wrapper, router };
  }

  it('renders the sidebar and the routed page', async () => {
    const { wrapper } = await mountApp();
    expect(wrapper.find('aside.app-shell__sidebar [data-testid="nav-dashboard"]').exists()).toBe(
      true,
    );
    expect(wrapper.find('[data-testid="routed-page"]').exists()).toBe(true);
  });

  it('checks the available templates on start', async () => {
    await mountApp();
    expect(fetch).toHaveBeenCalledWith('/api/templates');
  });

  it('opens the navigation drawer and closes it after navigating', async () => {
    const { router } = await mountApp();

    (document.querySelector('[data-testid="open-nav"]') as HTMLElement).click();
    await flushPromises();
    const drawerLink = document.querySelector(
      '.app-shell__drawer [data-testid="nav-instructor"]',
    ) as HTMLElement | null;
    expect(drawerLink).not.toBeNull();

    drawerLink!.click();
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/instructor');
    expect(document.querySelector('.app-shell__drawer [data-testid="nav-instructor"]')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit --workspace=frontend -- AppSidebar App.test`
Expected: FAIL (`navItems` missing; sidebar has no testids/theme toggle; App has no drawer).

- [ ] **Step 3: Add the navigation entries**

Create `frontend/src/components/navItems.ts`:

```ts
export interface NavItem {
  key: string;
  label: string;
  icon: string;
  route: string;
  sub?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'pi pi-home', route: '/' },
  { key: 'invoice', label: 'Invoice', icon: 'pi pi-file', route: '/invoice' },
  {
    key: 'invoice-settings',
    label: 'Invoice settings',
    icon: 'pi pi-cog',
    route: '/invoice/settings',
    sub: true,
  },
  {
    key: 'donation-receipt',
    label: 'Donation Receipt',
    icon: 'pi pi-heart',
    route: '/donation-receipt',
  },
  {
    key: 'donation-receipt-settings',
    label: 'Receipt settings',
    icon: 'pi pi-cog',
    route: '/donation-receipt/settings',
    sub: true,
  },
  { key: 'instructor', label: 'Instructor Rent', icon: 'pi pi-users', route: '/instructor' },
];

/** Key of the most specific entry whose route is the path or a parent of it. */
export function activeNavKey(path: string, items: NavItem[] = NAV_ITEMS): string | null {
  let best: NavItem | null = null;
  for (const item of items) {
    const matches =
      item.route === '/' ? path === '/' : path === item.route || path.startsWith(`${item.route}/`);
    if (matches && (!best || item.route.length > best.route.length)) best = item;
  }
  return best?.key ?? null;
}
```

- [ ] **Step 4: Rewrite the sidebar**

Replace `frontend/src/components/AppSidebar.vue` with:

```vue
<script setup lang="ts">
import Menu from 'primevue/menu';
import SelectButton from 'primevue/selectbutton';
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { type ThemeMode, useThemeMode } from '../composables/useThemeMode';
import { activeNavKey, NAV_ITEMS } from './navItems';

withDefaults(defineProps<{ showBrand?: boolean }>(), { showBrand: true });

const emit = defineEmits<{
  navigate: [];
}>();

const route = useRoute();
const activeKey = computed(() => activeNavKey(route.path));

const { mode, setMode } = useThemeMode();
const themeOptions: { label: string; value: ThemeMode; icon: string }[] = [
  { label: 'System', value: 'system', icon: 'pi pi-desktop' },
  { label: 'Light', value: 'light', icon: 'pi pi-sun' },
  { label: 'Dark', value: 'dark', icon: 'pi pi-moon' },
];

const appVersion = import.meta.env.VITE_APP_VERSION;

function onNavigate(event: MouseEvent, navigate: (e?: MouseEvent) => unknown) {
  navigate(event);
  emit('navigate');
}
</script>

<template>
  <div class="app-nav">
    <h1 v-if="showBrand" class="app-nav__brand">MV Dashboard</h1>

    <Menu :model="NAV_ITEMS" class="app-nav__menu">
      <template #item="{ item, props }">
        <RouterLink v-slot="{ href, navigate }" :to="item.route" custom>
          <a
            :href="href"
            v-bind="props.action"
            :data-testid="`nav-${item.key}`"
            class="app-nav__link"
            :class="{
              'app-nav__link--active': item.key === activeKey,
              'app-nav__link--sub': item.sub,
            }"
            @click="onNavigate($event, navigate)"
          >
            <span :class="item.icon" aria-hidden="true" />
            <span>{{ item.label }}</span>
          </a>
        </RouterLink>
      </template>
    </Menu>

    <div class="app-nav__footer">
      <SelectButton
        :model-value="mode"
        :options="themeOptions"
        option-label="label"
        option-value="value"
        :allow-empty="false"
        data-testid="theme-toggle"
        aria-label="Color mode"
        size="small"
        @update:model-value="setMode"
      >
        <template #option="{ option }">
          <span :class="option.icon" aria-hidden="true" />
          <span>{{ option.label }}</span>
        </template>
      </SelectButton>
      <p class="app-nav__version">Version {{ appVersion }}</p>
    </div>
  </div>
</template>

<style scoped>
.app-nav {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 1rem;
}

.app-nav__brand {
  margin: 0;
  padding: 0.5rem 0.75rem;
  font-size: 1.25rem;
  font-weight: 700;
}

.app-nav__menu {
  width: 100%;
  border: none;
  background: transparent;
}

.app-nav__link {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  text-decoration: none;
}

.app-nav__link--sub {
  padding-left: 2.25rem;
  font-size: 0.875rem;
}

.app-nav__link--active {
  color: var(--p-primary-color);
  font-weight: 600;
}

.app-nav__footer {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0 0.75rem;
}

.app-nav__version {
  margin: 0;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}
</style>
```

- [ ] **Step 5: Rewrite the shell**

Replace `frontend/src/App.vue` with:

```vue
<script setup lang="ts">
import AppSidebar from '@/components/AppSidebar.vue';
import { useAppStore } from '@/stores/app';
import Button from 'primevue/button';
import ConfirmDialog from 'primevue/confirmdialog';
import Drawer from 'primevue/drawer';
import Toast from 'primevue/toast';
import { onMounted, ref } from 'vue';

const store = useAppStore();
const drawerOpen = ref(false);

onMounted(() => store.checkTemplates());
</script>

<template>
  <div class="app-shell">
    <aside class="app-shell__sidebar">
      <AppSidebar />
    </aside>

    <div class="app-shell__main">
      <header class="app-shell__topbar">
        <Button
          icon="pi pi-bars"
          text
          aria-label="Open navigation"
          data-testid="open-nav"
          @click="drawerOpen = true"
        />
        <span class="app-shell__topbar-brand">MV Dashboard</span>
      </header>

      <main class="app-shell__content">
        <RouterView />
      </main>
    </div>

    <Drawer v-model:visible="drawerOpen" header="MV Dashboard" class="app-shell__drawer">
      <AppSidebar :show-brand="false" @navigate="drawerOpen = false" />
    </Drawer>

    <Toast />
    <ConfirmDialog />
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  min-height: 100vh;
}

.app-shell__sidebar {
  width: var(--app-sidebar-width);
  flex-shrink: 0;
  padding: 1rem 0.5rem;
  background: var(--p-content-background);
  border-right: 1px solid var(--p-content-border-color);
  position: sticky;
  top: 0;
  height: 100vh;
  box-sizing: border-box;
}

.app-shell__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.app-shell__topbar {
  display: none;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: var(--p-content-background);
  border-bottom: 1px solid var(--p-content-border-color);
}

.app-shell__topbar-brand {
  font-weight: 700;
}

.app-shell__content {
  flex: 1;
  padding: 2rem;
}

@media (max-width: 767px) {
  .app-shell__sidebar {
    display: none;
  }

  .app-shell__topbar {
    display: flex;
  }

  .app-shell__content {
    padding: 1rem;
  }
}
</style>
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test:unit --workspace=frontend -- AppSidebar App.test`
Expected: PASS.

Notes if a test fails for an environment reason:

- If clicking the SelectButton option in jsdom does not emit, trigger `click` on the inner `button` element that contains the label (adjust the finder, not the assertion) and report it.
- The Drawer is teleported to `document.body`; the App test queries `document`. If PrimeVue keeps the Drawer content mounted while hidden (with a leave transition), wait with `await new Promise((r) => setTimeout(r, 400))` after the second click before asserting it is gone, and report it.

- [ ] **Step 7: Full verification and commit**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS.

```bash
git add frontend/src/components/navItems.ts frontend/src/components/AppSidebar.vue frontend/src/App.vue frontend/src/__tests__/AppSidebar.test.ts frontend/src/__tests__/App.test.ts
git commit -m "feat: PrimeVue app shell with sidebar, theme toggle and mobile drawer

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Dashboard tiles

**Files:**

- Modify (replace): `frontend/src/views/HomeView.vue`
- Test: `frontend/src/__tests__/HomeView.test.ts`

**Interfaces:**

- Consumes: `PageHeader` (Task 4), `withPrimeVue` (Task 1)
- Produces: four tiles with `data-testid="tile-{invoice|donation-receipt|instructor|settings}"`; tile links (`<a href>`): Invoice → `/invoice`, Donation Receipt → `/donation-receipt`, Instructor Rent → `/instructor`, Settings → `/invoice/settings` and `/donation-receipt/settings`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/__tests__/HomeView.test.ts`:

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { NAV_ITEMS } from '../components/navItems';
import HomeView from '../views/HomeView.vue';
import { withPrimeVue } from './helpers/primeVue';

async function mountHome() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: NAV_ITEMS.map((item) => ({ path: item.route, component: { template: '<div />' } })),
  });
  await router.push('/');
  await router.isReady();
  const wrapper = mount(HomeView, { global: withPrimeVue({ plugins: [router] }) });
  await flushPromises();
  return wrapper;
}

describe('HomeView', () => {
  it('shows the page title', async () => {
    const wrapper = await mountHome();
    expect(wrapper.find('[data-testid="page-title"]').text()).toBe('Dashboard');
  });

  it.each([
    ['invoice', 'Invoice', ['/invoice']],
    ['donation-receipt', 'Donation Receipt', ['/donation-receipt']],
    ['instructor', 'Instructor Rent', ['/instructor']],
    ['settings', 'Settings', ['/invoice/settings', '/donation-receipt/settings']],
  ])('has a %s tile linking to its pages', async (key, title, hrefs) => {
    const wrapper = await mountHome();
    const tile = wrapper.find(`[data-testid="tile-${key}"]`);
    expect(tile.exists()).toBe(true);
    expect(tile.text()).toContain(title);
    expect(tile.findAll('a').map((a) => a.attributes('href'))).toEqual(hrefs);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit --workspace=frontend -- HomeView`
Expected: FAIL (no page title / tiles).

- [ ] **Step 3: Implement**

Replace `frontend/src/views/HomeView.vue` with:

```vue
<script setup lang="ts">
import Card from 'primevue/card';
import { RouterLink } from 'vue-router';
import PageHeader from '../components/ui/PageHeader.vue';

interface Tile {
  key: string;
  title: string;
  icon: string;
  description: string;
  links: { label: string; to: string }[];
}

const tiles: Tile[] = [
  {
    key: 'invoice',
    title: 'Invoice',
    icon: 'pi pi-file',
    description: 'Create and manage invoices.',
    links: [{ label: 'Open invoices', to: '/invoice' }],
  },
  {
    key: 'donation-receipt',
    title: 'Donation Receipt',
    icon: 'pi pi-heart',
    description: 'Create and manage donation receipts.',
    links: [{ label: 'Open receipts', to: '/donation-receipt' }],
  },
  {
    key: 'instructor',
    title: 'Instructor Rent',
    icon: 'pi pi-users',
    description: 'Calculate room rent for instructors.',
    links: [{ label: 'Open instructors', to: '/instructor' }],
  },
  {
    key: 'settings',
    title: 'Settings',
    icon: 'pi pi-cog',
    description: 'Templates, email and association data.',
    links: [
      { label: 'Invoice settings', to: '/invoice/settings' },
      { label: 'Receipt settings', to: '/donation-receipt/settings' },
    ],
  },
];
</script>

<template>
  <div class="page">
    <PageHeader title="Dashboard" />
    <div class="tiles">
      <Card v-for="tile in tiles" :key="tile.key" :data-testid="`tile-${tile.key}`" class="tile">
        <template #title>
          <span class="tile__title">
            <span :class="tile.icon" aria-hidden="true" />
            {{ tile.title }}
          </span>
        </template>
        <template #content>
          <p class="muted tile__description">{{ tile.description }}</p>
          <div class="row gap-2">
            <RouterLink v-for="link in tile.links" :key="link.to" :to="link.to" class="tile__link">
              {{ link.label }} <span class="pi pi-arrow-right" aria-hidden="true" />
            </RouterLink>
          </div>
        </template>
      </Card>
    </div>
  </div>
</template>

<style scoped>
.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
  gap: 1.5rem;
}

.tile__title {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.tile__description {
  margin: 0 0 1rem;
}

.tile__link {
  color: var(--p-primary-color);
  text-decoration: none;
  font-weight: 500;
}

.tile__link:hover {
  text-decoration: underline;
}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit --workspace=frontend -- HomeView`
Expected: PASS (5 tests).

- [ ] **Step 5: Full verification and commit**

Run: `npm run lint && npm run test:unit && npm run test:integration`
Expected: PASS.

```bash
git add frontend/src/views/HomeView.vue frontend/src/__tests__/HomeView.test.ts
git commit -m "feat: PrimeVue dashboard tiles

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Foundation verification in the browser

**Files:** none (verification only; report defects, do not fix).

- [ ] **Step 1: Suite and build**

Run: `npm run lint && npm run test:unit && npm run test:integration && npm run build`
Expected: all pass.

- [ ] **Step 2: Browser walkthrough (dev server)**

Start the dev servers from the worktree on free ports so they don't clash with the user's running Docker app (which uses 3000/5173):

```bash
PORT=3996 DATABASE_URL="file:/tmp/primevue-foundation.sqlite" DATA_DIR=/tmp/primevue-foundation-data npm run dev --workspace=backend
VITE_API_TARGET=http://localhost:3996 npx --workspace=frontend vite --port 5179 --strictPort
```

(run both in the background; the backend `dev` script migrates the scratch DB itself). With Playwright MCP tools (`mcp__playwright__*`, load via ToolSearch), at http://localhost:5179:

1. Dashboard shows the four tiles; sidebar shows all six entries; "Dashboard" highlighted.
2. Click each sidebar entry: the right entry is highlighted (e.g. `/invoice/settings` highlights only "Invoice settings"). Unmigrated pages still render (old Tailwind look is expected).
3. Theme toggle: Dark → page background, sidebar and cards switch to dark; reload keeps Dark; System follows the emulated color scheme (`browser_emulate_media` / `colorScheme`).
4. Resize to 390×844: sidebar hidden, top bar with menu button; drawer opens with the navigation; choosing an entry navigates and closes the drawer.
5. PrimeVue license notice: note where it appears and that it does not block interaction (expected without a key).
6. Console: no errors other than the license notice.
7. Screenshots (light, dark, mobile drawer) to the scratchpad, not into the repo; delete any `.playwright-mcp/` directory created in the worktree.

Stop both servers and delete `/tmp/primevue-foundation.sqlite` and `/tmp/primevue-foundation-data`.

- [ ] **Step 3: Branch status**

Run: `git status --short && git log --oneline master..HEAD`
Expected: clean tree; spec, plan and task commits only.
