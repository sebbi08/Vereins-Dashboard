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

export const VORLAGEN_DIR = path.join(DATA_DIR, 'vorlagen');
export const QUITTUNGEN_DIR = path.join(DATA_DIR, 'quittungen');
export const RECHNUNGEN_DIR = path.join(DATA_DIR, 'rechnungen');

/**
 * Converts an absolute file path to a relative path based on ABSOLUTE_DATA_DIR
 */
export function toRelativePath(absolutePath: string): string {
  const normalized = path.normalize(absolutePath);
  const dataDir = path.normalize(ABSOLUTE_DATA_DIR);

  if (normalized.startsWith(dataDir)) {
    return path.relative(dataDir, normalized);
  }

  return normalized;
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
