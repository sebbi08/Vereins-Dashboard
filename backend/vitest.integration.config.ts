import fs from 'fs';
import os from 'os';
import path from 'path';
import { defineConfig } from 'vitest/config';

// Every run gets its own database and data dir, so runs in parallel (e.g. from several
// worktrees) cannot delete each other's files. globalSetup reads the dir from the environment
// and removes it in teardown.
process.env.MV_INTEGRATION_DIR ??= fs.mkdtempSync(path.join(os.tmpdir(), 'mv-dashboard-int-'));
const runDir = process.env.MV_INTEGRATION_DIR;

export default defineConfig({
  test: {
    globals: true,
    include: ['src/__tests__/integration/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    env: {
      DATABASE_URL: `file:${path.join(runDir, 'test.sqlite')}`,
      DATA_DIR: path.join(runDir, 'data'),
      E2E_RESET_ENABLED: 'true',
    },
    globalSetup: ['./src/__tests__/integration/globalSetup.ts'],
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      shared: new URL('../shared/src/index.ts', import.meta.url).pathname,
    },
  },
});
