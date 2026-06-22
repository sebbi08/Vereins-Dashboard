import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(__dirname, '../../../');

const DB_PATH = '/tmp/mv-dashboard-integration-test.sqlite';
const DATA_DIR = '/tmp/mv-dashboard-integration-test-data';

export async function setup() {
  // Ensure test database is clean
  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
  }

  // Create required data directories
  fs.mkdirSync(path.join(DATA_DIR, 'templates'), { recursive: true });
  fs.mkdirSync(path.join(DATA_DIR, 'receipts'), { recursive: true });
  fs.mkdirSync(path.join(DATA_DIR, 'invoices'), { recursive: true });

  // Generate the Prisma client (needed if not yet built)
  execSync('npx prisma generate', {
    cwd: backendDir,
    env: { ...process.env },
    stdio: 'pipe',
  });

  // Run prisma migrations against the test database
  execSync('npx prisma migrate deploy --config prisma.test.config.ts', {
    cwd: backendDir,
    env: {
      ...process.env,
      DATABASE_URL: `file:${DB_PATH}`,
    },
    stdio: 'pipe',
  });
}

export async function teardown() {
  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
  }
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
}
