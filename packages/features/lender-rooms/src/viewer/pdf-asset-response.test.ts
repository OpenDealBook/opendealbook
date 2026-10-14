import { describe, expect, it } from 'vitest';

import { pdfAssetResponse } from './pdf-asset-response';

import { createRequire } from 'node:module';

const { version } = createRequire(import.meta.url)(
  'pdfjs-dist/package.json',
) as { version: string };

describe('pdfAssetResponse', () => {
  it.each([
    [['pdf.worker.min.mjs'], 'text/javascript'],
    [['wasm', 'openjpeg.wasm'], 'application/wasm'],
    [['wasm', 'jbig2_nowasm_fallback.js'], 'text/javascript'],
    [['cmaps', '78-H.bcmap'], 'application/octet-stream'],
    [['standard_fonts', 'FoxitFixed.pfb'], 'application/octet-stream'],
    [['iccs', 'CGATS001Compat-v2-micro.icc'], 'application/octet-stream'],
  ])('serves %j as %s', async (asset, contentType) => {
    const response = await pdfAssetResponse([version, ...asset]);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(contentType);
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it('lets browsers keep an asset for a year', async () => {
    const response = await pdfAssetResponse([version, 'pdf.worker.min.mjs']);

    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=31536000, immutable',
    );
  });

  it.each([
    [[]],
    [[version]],
    [['0.0.0', 'pdf.worker.min.mjs']],
    [['pdf.worker.min.mjs']],
    [[version, 'package.json']],
    [[version, 'build', 'pdf.mjs']],
    [[version, 'legacy', 'build', 'pdf.mjs']],
    [[version, 'wasm', 'missing.wasm']],
    [[version, 'wasm', '..']],
    [[version, 'wasm', '../package.json']],
    [[version, 'wasm', '..\\package.json']],
    [[version, 'wasm', 'openjpeg.wasm', 'extra']],
    [[version, '..', 'package.json']],
  ])('answers 404 for %j', async (asset) => {
    const response = await pdfAssetResponse(asset);

    expect(response.status).toBe(404);
  });
});
