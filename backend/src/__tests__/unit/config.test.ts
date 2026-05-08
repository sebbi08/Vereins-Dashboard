import path from 'path';
import { describe, expect, it } from 'vitest';
import { ABSOLUTE_DATA_DIR, toAbsolutePath, toRelativePath } from '../../config';

describe('toRelativePath', () => {
  it('strips the DATA_DIR prefix from an absolute path', () => {
    const absolutePath = path.join(ABSOLUTE_DATA_DIR, 'quittungen', 'test.pdf');
    const result = toRelativePath(absolutePath);
    expect(result).toBe(path.join('quittungen', 'test.pdf'));
  });

  it('returns the path unchanged when it is outside DATA_DIR', () => {
    const result = toRelativePath('/totally/different/path/file.pdf');
    expect(result).toBe('/totally/different/path/file.pdf');
  });

  it('handles nested paths', () => {
    const absolutePath = path.join(ABSOLUTE_DATA_DIR, 'vorlagen', 'v1', 'template.docx');
    const result = toRelativePath(absolutePath);
    expect(result).toBe(path.join('vorlagen', 'v1', 'template.docx'));
  });
});

describe('toAbsolutePath', () => {
  it('returns an absolute path unchanged', () => {
    const result = toAbsolutePath('/absolute/path/file.pdf');
    expect(result).toBe('/absolute/path/file.pdf');
  });

  it('resolves a relative path against ABSOLUTE_DATA_DIR', () => {
    const result = toAbsolutePath('quittungen/test.pdf');
    expect(result).toBe(path.join(ABSOLUTE_DATA_DIR, 'quittungen', 'test.pdf'));
  });
});
