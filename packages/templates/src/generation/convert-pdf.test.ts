import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { convertDocxToPdf } from './convert-pdf';

describe('convertDocxToPdf', () => {
  beforeEach(() => {
    vi.stubEnv('GOTENBERG_URL', 'http://gotenberg.test');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
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

  it('refuses to run without GOTENBERG_URL configured', async () => {
    vi.stubEnv('GOTENBERG_URL', undefined);

    await expect(convertDocxToPdf(new Uint8Array([1]))).rejects.toThrow(
      'Missing required environment variable: GOTENBERG_URL',
    );
  });
});
