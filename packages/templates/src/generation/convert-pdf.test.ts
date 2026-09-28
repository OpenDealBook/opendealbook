import { afterEach, describe, expect, it, vi } from 'vitest';

import { convertDocxToPdf } from './convert-pdf';

describe('convertDocxToPdf', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws when gotenberg responds with a non-2xx status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        text: async () => 'boom',
        arrayBuffer: async () => new ArrayBuffer(0),
      })),
    );

    await expect(convertDocxToPdf(new Uint8Array([1]))).rejects.toThrow('500');
  });
});
