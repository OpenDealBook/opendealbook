import { configDefaults, defineConfig } from 'vitest/config';

import { fileURLToPath } from 'node:url';

const lenderRooms = (path: string) =>
  fileURLToPath(
    new URL(
      `../../packages/features/lender-rooms/node_modules/${path}`,
      import.meta.url,
    ),
  );

export const aliases = [
  { find: /^server-only$/, replacement: lenderRooms('server-only/empty.js') },
  // Mammoth's Node entry reads files from disk; the browser build is the one that ships and takes an ArrayBuffer.
  { find: /^mammoth$/, replacement: lenderRooms('mammoth/mammoth.browser.js') },
  // The default pdf.js build needs browser APIs Node lacks; the legacy build is the same code with polyfills.
  {
    find: /^pdfjs-dist$/,
    replacement: lenderRooms('pdfjs-dist/legacy/build/pdf.mjs'),
  },
];

export default defineConfig({
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    include: ['**/*.test.{ts,tsx}'],
    exclude: [...configDefaults.exclude, '**/*.int.test.ts'],
    globals: true,
  },
  resolve: { alias: aliases },
});
