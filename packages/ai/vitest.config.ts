import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: { ODB_ALLOW_PRIVATE_AI_URL: '', ODB_STACK: '' },
    include: ['src/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'src/**/*.int.test.ts'],
    globals: true,
  },
});
