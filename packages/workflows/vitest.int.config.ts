import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@supabase/supabase-js': fileURLToPath(
        new URL(
          '../supabase/node_modules/@supabase/supabase-js',
          import.meta.url,
        ),
      ),
      '@odb/supabase/admin': fileURLToPath(
        new URL('../supabase/src/admin.ts', import.meta.url),
      ),
      '@odb/comps': fileURLToPath(new URL('../comps/index.ts', import.meta.url)),
      '@odb/outreach': fileURLToPath(
        new URL('../outreach/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    include: ['src/**/*.int.test.ts'],
    globals: true,
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
