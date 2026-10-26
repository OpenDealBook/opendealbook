import { describe, expect, it } from 'vitest';

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RUNTIME_IMPORT =
  /^import\s+(?!type\b)[^;]*?from\s+'([^']+)'|^export\s+(?!type\b)[^;]*?from\s+'([^']+)'/gms;

function runtimeImports(entry: string) {
  const files = new Set<string>();
  const packages = new Set<string>();
  const queue = [entry];
  for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
    if (files.has(file)) continue;
    files.add(file);
    for (const [, fromImport, fromExport] of readFileSync(
      file,
      'utf8',
    ).matchAll(RUNTIME_IMPORT)) {
      const specifier = (fromImport ?? fromExport)!;
      if (specifier.startsWith('.')) {
        queue.push(`${resolve(dirname(file), specifier)}.ts`);
      } else {
        packages.add(specifier);
      }
    }
  }
  return { files: [...files], packages: [...packages].sort() };
}

describe('client entry', () => {
  const { files, packages } = runtimeImports(
    fileURLToPath(new URL('./index.ts', import.meta.url)),
  );

  it('loads no step registry or palette code', () => {
    expect(
      files.filter((file) =>
        /\/(registry|palette|steps\/[^/]+)\.ts$/.test(file),
      ),
    ).toEqual([]);
  });

  it('loads no supabase, node or temporal server packages', () => {
    expect(packages).toEqual(['zod']);
  });
});
