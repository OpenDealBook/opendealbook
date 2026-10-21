import { configDefaults, defineConfig } from 'vitest/config';

import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: [...configDefaults.exclude, 'src/**/*.int.test.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      'server-only': fileURLToPath(
        new URL('./node_modules/server-only/empty.js', import.meta.url),
      ),
    },
  },
});
