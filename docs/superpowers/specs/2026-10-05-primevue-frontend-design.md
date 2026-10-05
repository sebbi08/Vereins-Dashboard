# Frontend Rewrite with PrimeVue

**Date**: 2026-10-05
**Status**: Draft

## Overview

Rewrite the Vue 3 frontend of mv-dashboard with PrimeVue 5 for a consistent, polished look and better components (data tables with sorting/filtering/pagination, date pickers, toasts, confirm dialogs), with freedom to rework layouts where it helps. Tailwind is removed completely. A System / Light / Dark theme toggle is added. Backend and API are unchanged.

## Decisions

| Topic         | Decision                                                                                                                                                                                                                                                    |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal          | Consistent look **and** better components; layouts may be reworked                                                                                                                                                                                          |
| Library       | PrimeVue 5 (`primevue` ^5.0.2), theme `@primeuix/themes` ^3.0.1 (Aura preset), icons `primeicons` ^8.0.2                                                                                                                                                    |
| License       | PrimeVue 5 requires a PrimeUI license key; a free Community License will be obtained **later**. The key is read from an optional build-time variable; until it is set, PrimeVue shows its license notice (in development and production) — accepted for now |
| Styling       | PrimeVue styled mode with Aura; **Tailwind removed** (`tailwindcss`, `@tailwindcss/vite`); layout via a small shared `layout.css` plus `<style scoped>` using PrimeVue CSS variables                                                                        |
| Dark mode     | Three-state toggle System / Light / Dark in the sidebar, default System, remembered in `localStorage`                                                                                                                                                       |
| Delivery      | One long branch `feat/primevue`, merged once everything is done                                                                                                                                                                                             |
| Shell         | Left sidebar (like today); Drawer on narrow screens                                                                                                                                                                                                         |
| Lists         | `DataTable` with global search + per-column filters (filter row), filtering in the browser on the full list                                                                                                                                                 |
| Forms         | One column of cards (like today); actions at the end                                                                                                                                                                                                        |
| Feedback      | Toasts replace inline success/error banners and `alert()`; ConfirmDialog replaces `window.confirm()`                                                                                                                                                        |
| UI language   | English (unchanged); dates `dd.mm.yyyy`, week starts Monday, German money/number formatting                                                                                                                                                                 |
| Imports       | Explicit component imports (no auto-import plugin)                                                                                                                                                                                                          |
| Primary color | Aura default                                                                                                                                                                                                                                                |

## Architecture

### Dependencies

- Add: `primevue@^5.0.2`, `@primeuix/themes@^3.0.1`, `primeicons@^8.0.2` (frontend workspace).
- Remove (last migration step): `tailwindcss`, `@tailwindcss/vite`, the Tailwind plugin in `frontend/vite.config.ts`, and the Tailwind import in `frontend/src/style.css`.
- Component names follow the installed PrimeVue 5 version (e.g. `Select`, `DatePicker`, `ToggleSwitch`, `Drawer`, `Tabs`); deprecated v5 components (`InputMask` component, `MultiSelect`, `Password`, …) are not used.

### Setup (`frontend/src/main.ts`)

```ts
app.use(PrimeVue, {
  theme: { preset: Aura, options: { darkModeSelector: '.app-dark' } },
  license: import.meta.env.VITE_PRIMEUI_LICENSE || undefined,
  locale: {
    /* overrides below */
  },
});
app.use(ToastService);
app.use(ConfirmationService);
```

- Locale overrides: `dateFormat: 'dd.mm.yy'`, `firstDayOfWeek: 1`, German `dayNames`/`dayNamesShort`/`dayNamesMin`/`monthNames`/`monthNamesShort`; all other labels stay English.
- License: `VITE_PRIMEUI_LICENSE` (optional). `Dockerfile` gets `ARG PRIMEUI_LICENSE` and `ENV VITE_PRIMEUI_LICENSE=${PRIMEUI_LICENSE}` in the build stage; `frontend/src/vite-env.d.ts` declares it. Not committed anywhere.
- `primeicons/primeicons.css` and `src/assets/layout.css` imported in `main.ts`.
- The theme mode is applied before `app.mount()` (see Theme) so there is no flash of the wrong theme.

### Theme (`frontend/src/composables/useTheme.ts`)

- `type ThemeMode = 'system' | 'light' | 'dark'`.
- Stored in `localStorage` under `mv-theme`; every read/write wrapped in try/catch; unknown or unreadable value → `'system'`.
- Applies by toggling the class `app-dark` on `document.documentElement`: `dark` → on, `light` → off, `system` → follows `matchMedia('(prefers-color-scheme: dark)')` and updates on its `change` event.
- API: `useTheme(): { mode: Ref<ThemeMode>; setMode(mode: ThemeMode): void }` plus `applyStoredTheme(): void` called in `main.ts` before mount.

### Shell

- `App.vue`: sidebar + main content (`<RouterView />`), plus `<Toast />` and `<ConfirmDialog />` mounted once.
- `AppSidebar.vue`: PrimeVue `Menu` with PrimeIcons — Dashboard, Invoice (sub-item Invoice settings), Donation Receipt (sub-item Receipt settings), Instructor Rent. Active route highlighted. Bottom: `SelectButton` (System / Light / Dark, icon + label) bound to `useTheme`, and `Version …`.
- Narrow screens (< 768px): sidebar hidden, a slim top bar with a menu `Button` opens the same navigation in a `Drawer`; navigating closes it.

### Shared building blocks

| Unit                 | Location              | Purpose                                                                                                                                                                                                                 |
| -------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PageHeader.vue`     | `src/components/ui/`  | Title, optional subtitle, `actions` slot (right-aligned)                                                                                                                                                                |
| `FormSection.vue`    | `src/components/ui/`  | PrimeVue `Card` with a heading; one-column form sections                                                                                                                                                                |
| `useNotify()`        | `src/composables/`    | `success(msg)`, `error(msg)`, `info(msg)` on `useToast` (life 4000 ms; errors 6000 ms)                                                                                                                                  |
| `useConfirmAction()` | `src/composables/`    | `confirmAction({ message, header?, acceptLabel?, danger? }): Promise<boolean>` on `useConfirm`; 1:1 replacement for `window.confirm`                                                                                    |
| `tableDefaults.ts`   | `src/utils/`          | `rows: 25`, `rowsPerPageOptions: [10, 25, 50, 100]`, `paginator: true`, `removableSort: true`, `filterDisplay: 'row'`, helper to build the global-filter model                                                          |
| `format.ts`          | `src/utils/` (exists) | Single place for German money/hours/date formatting                                                                                                                                                                     |
| `layout.css`         | `src/assets/`         | ~15 helpers (`.stack`, `.row`, `.grid-2`, `.gap-1..4`, `.muted`, `.page`, …) using PrimeVue CSS variables (`--p-content-border-color`, `--p-text-muted-color`, `--p-content-background`, …) so they work in both themes |

## Screens

No backend changes. List pages load the full list once (`/api/invoice?withCancelled=true`, `/api/donation-receipt?withCancelled=true`, `/api/instructor`, `/api/invoice-draft`) and filter in the browser.

### List pages

`InvoiceView`, `DonationReceiptView`, `InstructorView`:

- `PageHeader` with "New …" button.
- `DataTable` with: global search input above the table; filter row with per-column filters — text (number, name), amount range (from–to, `InputNumber` pair) for amounts, date range (`DatePicker selectionMode="range"`) for dates, status `Select`; "Clear filters" button; all columns sortable; pagination per `tableDefaults`; status as `Tag`.
- Default status filter: **Active** (cancelled hidden by default, as today).
- Invoices and receipts: checkbox row selection; "Download N PDFs" in the header while rows are selected (existing batch download endpoints).
- Invoice drafts: a separate small `DataTable` above the invoices, only when drafts exist; row click opens the draft.
- Row click opens the detail page (keyboard: Enter on a focused row).
- Instructors: keep the footer sum and the per-row "Create invoice" button (disabled with tooltip when no invoice template). "Weeks per month" and the existing `InvoiceTextSettings` move into a collapsible `Panel` "Calculation settings" above the table.

### Detail pages

`InvoiceDetailView`, `DonationReceiptDetailView`:

- `PageHeader`: number, status `Tag`, actions (New revision, Cancel → `confirmAction` with `danger`, Copy, PDF).
- Main data as a two-column label/value grid in a `Card`.
- Revisions in an `Accordion`, newest first and expanded; each shows PDF status (retry), email status with Send / Test-send buttons, and line items (`white-space: pre-line`).
- Results of retry/send are toasts.

### Forms

`InvoiceFormView` (incl. draft mode), `DonationReceiptFormView`, `InstructorFormView`:

- One column of `FormSection` cards, actions at the end.

| Input                                               | Component                                                                                                                     |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Text                                                | `InputText`                                                                                                                   |
| Multi-line text (line items, invoice text template) | `Textarea autoResize` (replaces the `vAutogrow` directive, which is removed)                                                  |
| Money                                               | `InputNumber mode="currency" currency="EUR" locale="de-DE"` (values stay integer cents in the model; conversion at the input) |
| Dates                                               | `DatePicker` (`dd.mm.yy`, Monday first); model stays `YYYY-MM-DD` strings                                                     |
| VAT                                                 | `Select` (7 % / 19 %)                                                                                                         |
| Booleans (direct debit, cover letter)               | `ToggleSwitch`                                                                                                                |
| Recipient / donor search                            | `AutoComplete`                                                                                                                |
| Months (instructor)                                 | `InputNumber` (integer, min 1)                                                                                                |

- Field errors under the field as `Message severity="error" size="small" variant="simple"`; server errors as toasts.
- Unchanged behavior: draft save/activate/delete, recipient fields editable with in-place update, instructor prefill (`?fromInstructor=`), Enter-to-save in draft mode, all validation rules and messages.

### Instructor components

- `WeeklySchedule`: one `Fieldset` per weekday; time fields stay native `<input type="time">` styled with the `p-inputtext` class (value stays `"HH:MM"`); `+ Block` / `+ Pause` / remove as `Button`s (text/icon).
- `RecipientPicker`, `DonorAutocomplete`: `AutoComplete` with the existing search endpoints; same emitted values.
- `InvoiceTextSettings`: `Textarea`, placeholder `Button`s (text), preview in a bordered box; logic unchanged.

### Settings pages

- `SettingsView` (donation receipts): `Tabs` — Association data · Donors · Templates.
- `InvoiceSettingsView`: `Tabs` — Template & preview · Email · Recipients.
- Template upload: `FileUpload mode="basic"` with the same accepted types; preview `iframe`s unchanged.
- Donor and recipient lists: `DataTable` with inline editing as today.

### Dashboard (`HomeView`)

Four `Card` tiles — Invoice, Donation Receipt, Instructor Rent, Settings — each with icon, one-line description and link.

## Testing

### Unit tests (frontend)

- Helper `src/__tests__/helpers/mountWithPrimeVue.ts`: mounts with PrimeVue (Aura, no license), `ToastService`, `ConfirmationService`; options passthrough. Must be verified early that the license notice does not break assertions (it renders outside the mounted component).
- All existing test files are ported; behavior assertions are kept:
  - `data-testid`s stay; on components whose root is not the input (`InputNumber`, `DatePicker`, `Select`, `AutoComplete`), the testid is put on the inner input via `pt`.
  - Where typing into a PrimeVue widget is impractical in jsdom, tests drive `update:modelValue` on the component (`findComponent(...).vm.$emit`).
  - Tests that relied on `window.confirm`/`alert` mock `useConfirmAction`/`useNotify`.
- New tests: `useTheme` (storage fallback, system mode following `matchMedia`, class toggling, persistence), `useNotify`, `useConfirmAction`, list pages' client-side filtering (default Active, global search), batch selection, sidebar theme toggle.

### E2E (WebdriverIO)

Selectors bound to the old markup (`tbody tr`, `input[type="date"]`, `.bg-green-…`, button texts that change) move to `data-testid` or role/text selectors; all scenarios kept. `npm run test:e2e` must pass before merge.

### Verification

- After every task: `npm run lint && npm run test:unit && npm run test:integration` (AGENTS.md).
- At the end: `npm run build`; e2e suite; Playwright walkthrough of every screen in light and dark mode on the production build incl. one real invoice PDF; grep confirms no Tailwind utility classes remain.

## Migration Order (single branch)

1. Foundation: dependencies, PrimeVue setup, theme + toggle, shell, building blocks, test helper (Tailwind still installed).
2. Dashboard and shared pickers (`RecipientPicker`, `DonorAutocomplete`).
3. Invoices: list (+ drafts), form (+ draft mode), detail, settings.
4. Donation receipts: list, form, detail, settings.
5. Instructor rent: list + calculation settings, form, schedule.
6. Remove Tailwind and leftover utility classes; grep check.
7. E2E updates; final verification.

## Out of Scope

- Backend/API changes
- Translating the UI to German
- New features beyond what the components bring
- Obtaining / configuring the PrimeUI Community License key (done later via `PRIMEUI_LICENSE`)
