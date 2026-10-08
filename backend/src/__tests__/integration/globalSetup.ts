import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(__dirname, '../../../');

/** Created per run by vitest.integration.config.ts. */
function runDir(): string {
  const dir = process.env.MV_INTEGRATION_DIR;
  if (!dir) throw new Error('MV_INTEGRATION_DIR is not set; run via vitest.integration.config.ts');
  return dir;
}

export async function setup() {
  const dbPath = path.join(runDir(), 'test.sqlite');
  const dataDir = path.join(runDir(), 'data');

  // Create required data directories
  fs.mkdirSync(path.join(dataDir, 'templates'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'receipts'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'invoices'), { recursive: true });

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
      DATABASE_URL: `file:${dbPath}`,
    },
    stdio: 'pipe',
  });
}

export async function teardown() {
  fs.rmSync(runDir(), { recursive: true, force: true });
}
