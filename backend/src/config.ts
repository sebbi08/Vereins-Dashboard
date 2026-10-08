import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../data');
export const ABSOLUTE_DATA_DIR = path.resolve(DATA_DIR);
export const DATABASE_URL = process.env.DATABASE_URL || 'file:db.sqlite';

function resolveSqliteFilePath(databaseUrl: string): string | null {
  if (!databaseUrl.startsWith('file:')) {
    return null;
  }

  const filePath = databaseUrl.slice(5).split('?')[0];
  if (!filePath || filePath === ':memory:') {
    return null;
  }

  return path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(process.cwd(), filePath);
}

export const DATABASE_FILE_PATH = resolveSqliteFilePath(DATABASE_URL);

// Always absolute, so a file written here and later passed to toRelativePath is stored relative
// to the data dir even when DATA_DIR itself was given as a relative path.
export const TEMPLATES_DIR = path.join(ABSOLUTE_DATA_DIR, 'templates');
export const RECEIPTS_DIR = path.join(ABSOLUTE_DATA_DIR, 'receipts');
export const INVOICES_DIR = path.join(ABSOLUTE_DATA_DIR, 'invoices');

/**
 * Converts a file path to a path relative to the data dir, so the stored value stays valid when
 * the data dir moves. Paths outside the data dir are returned unchanged (made absolute).
 */
export function toRelativePath(filePath: string): string {
  const absolute = path.resolve(filePath);
  const dataDir = ABSOLUTE_DATA_DIR;

  if (absolute === dataDir || absolute.startsWith(dataDir + path.sep)) {
    return path.relative(dataDir, absolute);
  }

  return absolute;
}

/**
 * Converts a relative file path (relative to DATA_DIR) to an absolute path
 */
export function toAbsolutePath(relativePath: string): string {
  if (path.isAbsolute(relativePath)) {
    return path.resolve(relativePath);
  }

  return path.resolve(ABSOLUTE_DATA_DIR, relativePath);
}
