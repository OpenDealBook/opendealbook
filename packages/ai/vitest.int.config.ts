import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: { ODB_ALLOW_PRIVATE_AI_URL: '', ODB_STACK: '' },
    include: ['src/**/*.int.test.ts'],
    globals: true,
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
