import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const FRONTEND = join(__dirname, '..', '..');
const SRC = join(FRONTEND, 'src');
const THIS_FILE = __filename;

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
