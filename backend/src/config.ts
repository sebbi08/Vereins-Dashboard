import path from "path";

const SCHEMA_DIR = path.resolve(__dirname, "../prisma");

export const DATA_DIR =
  process.env.DATA_DIR || path.join(__dirname, "../../data");
export const ABSOLUTE_DATA_DIR = path.resolve(DATA_DIR);
export const DATABASE_URL = process.env.DATABASE_URL || "file:db.sqlite";

function resolveSqliteFilePath(databaseUrl: string): string | null {
  if (!databaseUrl.startsWith("file:")) {
    return null;
  }

  const filePath = databaseUrl.slice(5).split("?")[0];
  if (!filePath || filePath === ":memory:") {
    return null;
  }

  return path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(SCHEMA_DIR, filePath);
}

export const DATABASE_FILE_PATH = resolveSqliteFilePath(DATABASE_URL);

export const VORLAGEN_DIR = path.join(DATA_DIR, "vorlagen");
export const QUITTUNGEN_DIR = path.join(DATA_DIR, "quittungen");
