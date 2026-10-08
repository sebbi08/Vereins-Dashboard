import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');
const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
  (m) => m[1],
);

function run(stored: string | null, osDark: boolean, throws = false) {
  vi.stubGlobal('localStorage', {
    getItem: () => {
      if (throws) throw new Error('blocked');
      return stored;
    },
  });
  vi.stubGlobal('matchMedia', () => ({ matches: osDark }));
  new Function(inline[0])();
}

describe('index.html theme bootstrap', () => {
  beforeEach(() => document.documentElement.classList.remove('app-dark'));
  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.classList.remove('app-dark');
  });

  const isDark = () => document.documentElement.classList.contains('app-dark');

  it('has one inline script before the module script', () => {
    expect(inline).toHaveLength(1);
    expect(html.indexOf('<script>')).toBeLessThan(html.indexOf('type="module"'));
  });

  it('sets the class for stored dark', () => {
    run('dark', false);
    expect(isDark()).toBe(true);
  });

  it('does not set the class for stored light even if the OS prefers dark', () => {
    run('light', true);
    expect(isDark()).toBe(false);
  });

  it('follows the OS when nothing is stored', () => {
    run(null, true);
    expect(isDark()).toBe(true);
    document.documentElement.classList.remove('app-dark');
    run(null, false);
    expect(isDark()).toBe(false);
  });

  it('follows the OS for stored system or unknown values', () => {
    run('system', true);
    expect(isDark()).toBe(true);
    document.documentElement.classList.remove('app-dark');
    run('bogus', true);
    expect(isDark()).toBe(true);
  });

  it('does not throw when storage throws', () => {
    expect(() => run(null, true, true)).not.toThrow();
    expect(isDark()).toBe(true);
  });
});

describe('index.html language', () => {
  it('declares English, the language of the UI, for screen readers', () => {
    expect(html).toMatch(/<html lang="en">/);
  });
});
