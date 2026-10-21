import { defineConfig } from 'vitest/config';

import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    include: ['src/**/*.int.test.ts'],
    globals: true,
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      'server-only': fileURLToPath(
        new URL('./vitest/server-only-stub.ts', import.meta.url),
      ),
    },
  },
});
