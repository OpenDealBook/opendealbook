import { configDefaults, defineConfig } from 'vitest/config';

import { fileURLToPath } from 'node:url';

const local = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: [...configDefaults.exclude, 'src/**/*.int.test.ts'],
    globals: true,
  },
  resolve: {
    alias: [
      {
        find: /^server-only$/,
        replacement: local('./node_modules/server-only/empty.js'),
      },
      // Mammoth's Node entry reads files from disk; the browser build is the one that ships and takes an ArrayBuffer.
      {
        find: /^mammoth$/,
        replacement: local('./node_modules/mammoth/mammoth.browser.js'),
      },
      // The default pdf.js build needs browser APIs Node lacks; the legacy build is the same code with polyfills.
      {
        find: /^pdfjs-dist$/,
        replacement: local('./node_modules/pdfjs-dist/legacy/build/pdf.mjs'),
      },
    ],
  },
});
