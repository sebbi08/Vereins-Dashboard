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
