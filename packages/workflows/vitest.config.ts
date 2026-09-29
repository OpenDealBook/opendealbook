import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@odb/verification': fileURLToPath(
        new URL('../verification/src/index.ts', import.meta.url),
      ),
      '@odb/notifications/server': fileURLToPath(
        new URL(
          '../features/notifications/src/server/novu/index.ts',
          import.meta.url,
        ),
      ),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    globals: true,
  },
});
