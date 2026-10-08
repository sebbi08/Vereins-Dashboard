import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ABSOLUTE_DATA_DIR, toAbsolutePath, toRelativePath } from '../../config';

describe('toRelativePath', () => {
  it('strips the DATA_DIR prefix from an absolute path', () => {
    const absolutePath = path.join(ABSOLUTE_DATA_DIR, 'receipts', 'test.pdf');
    const result = toRelativePath(absolutePath);
    expect(result).toBe(path.join('receipts', 'test.pdf'));
  });

  it('returns the path unchanged when it is outside DATA_DIR', () => {
    const result = toRelativePath('/totally/different/path/file.pdf');
    expect(result).toBe('/totally/different/path/file.pdf');
  });

  it('does not treat a sibling directory that shares the prefix as inside DATA_DIR', () => {
    const sibling = `${ABSOLUTE_DATA_DIR}2${path.sep}file.pdf`;
    expect(toRelativePath(sibling)).toBe(sibling);
  });

  it('handles nested paths', () => {
    const absolutePath = path.join(ABSOLUTE_DATA_DIR, 'templates', 'v1', 'template.docx');
    const result = toRelativePath(absolutePath);
    expect(result).toBe(path.join('templates', 'v1', 'template.docx'));
  });
});

describe('toAbsolutePath', () => {
  it('returns an absolute path unchanged', () => {
    const result = toAbsolutePath('/absolute/path/file.pdf');
    expect(result).toBe('/absolute/path/file.pdf');
  });

  it('resolves a relative path against ABSOLUTE_DATA_DIR', () => {
    const result = toAbsolutePath('receipts/test.pdf');
    expect(result).toBe(path.join(ABSOLUTE_DATA_DIR, 'receipts', 'test.pdf'));
  });
});

describe('with a relative DATA_DIR', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function loadConfig(dataDir: string) {
    vi.stubEnv('DATA_DIR', dataDir);
    vi.resetModules();
    return import('../../config');
  }

  it('builds the data sub-directories as absolute paths', async () => {
    const config = await loadConfig('./mydata');
    expect(config.TEMPLATES_DIR).toBe(path.resolve('./mydata', 'templates'));
    expect(config.RECEIPTS_DIR).toBe(path.resolve('./mydata', 'receipts'));
    expect(config.INVOICES_DIR).toBe(path.resolve('./mydata', 'invoices'));
  });

  it('round-trips a stored file path back to where the file was written', async () => {
    const config = await loadConfig('./mydata');
    const written = path.join(config.TEMPLATES_DIR, 'x.docx');

    const stored = config.toRelativePath(written);

    expect(stored).toBe(path.join('templates', 'x.docx'));
    expect(config.toAbsolutePath(stored)).toBe(path.resolve('./mydata/templates/x.docx'));
  });
});
