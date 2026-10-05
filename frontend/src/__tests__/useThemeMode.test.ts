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
