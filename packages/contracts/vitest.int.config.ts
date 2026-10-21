import { defineConfig } from 'vitest/config';

import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    include: ['src/**/*.int.test.ts'],
    globals: true,
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: { GOTENBERG_URL: 'http://localhost:3009' },
  },
  resolve: {
    alias: {
      'server-only': fileURLToPath(
        new URL('../next/node_modules/server-only/empty.js', import.meta.url),
      ),
    },
  },
});
