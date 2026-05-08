import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/__tests__/unit/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      shared: new URL('../shared/src/index.ts', import.meta.url).pathname,
    },
  },
});
