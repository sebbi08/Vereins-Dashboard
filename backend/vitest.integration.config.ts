import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/__tests__/integration/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    env: {
      DATABASE_URL: 'file:/tmp/mv-dashboard-integration-test.sqlite',
      DATA_DIR: '/tmp/mv-dashboard-integration-test-data',
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
