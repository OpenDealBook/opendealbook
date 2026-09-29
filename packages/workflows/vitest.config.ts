import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@odb/comps': fileURLToPath(new URL('../comps/index.ts', import.meta.url)),
      papaparse: fileURLToPath(
        new URL(
          '../../node_modules/.pnpm/papaparse@5.5.3/node_modules/papaparse/papaparse.js',
          import.meta.url,
        ),
      ),
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
