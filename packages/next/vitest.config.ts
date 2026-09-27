import { defineConfig } from 'vitest/config';

import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      'server-only': fileURLToPath(
        new URL('./vitest/server-only-stub.ts', import.meta.url),
      ),
    },
  },
});
