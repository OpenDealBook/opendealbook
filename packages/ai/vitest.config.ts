import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: { ODB_ALLOW_PRIVATE_AI_URL: '', ODB_STACK: '' },
    include: ['src/**/*.test.ts'],
    globals: true,
  },
});
