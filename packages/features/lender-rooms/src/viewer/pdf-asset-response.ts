import 'server-only';
import { version as INSTALLED_VERSION } from 'pdfjs-dist/package.json';

import { readFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../node_modules/pdfjs-dist',
);

const WORKER_FILE = 'pdf.worker.min.mjs';
const ASSET_DIRECTORIES = ['wasm', 'cmaps', 'standard_fonts', 'iccs'];
const SAFE_NAME = /^[A-Za-z0-9._-]+$/;
const CONTENT_TYPES: Record<string, string> = {
  '.mjs': 'text/javascript',
  '.js': 'text/javascript',
  '.wasm': 'application/wasm',
};

function assetPath(segments: string[]): string | null {
  const [version, first, second] = segments;
  if (version !== INSTALLED_VERSION) return null;
  if (segments.length === 2 && first === WORKER_FILE) {
    return join(PACKAGE_ROOT, 'build', WORKER_FILE);
  }
  if (
    segments.length === 3 &&
    first !== undefined &&
    second !== undefined &&
    ASSET_DIRECTORIES.includes(first) &&
    SAFE_NAME.test(second)
  ) {
    return join(PACKAGE_ROOT, first, second);
  }
  return null;
}

const NOT_FOUND = () => new Response(null, { status: 404 });

export async function pdfAssetResponse(segments: string[]): Promise<Response> {
  const path = assetPath(segments);
  if (path === null) return NOT_FOUND();
  let bytes: Buffer;
  try {
    bytes = await readFile(path);
  } catch {
    return NOT_FOUND();
  }
  return new Response(new Uint8Array(bytes), {
    headers: {
      'content-type':
        CONTENT_TYPES[extname(path)] ?? 'application/octet-stream',
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
}
