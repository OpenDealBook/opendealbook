import { afterEach, describe, expect, it, vi } from 'vitest';

import { convertHtmlToPdf } from './convert-html-to-pdf';

describe('convertHtmlToPdf', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the html to the gotenberg chromium route', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      status: 200,
      text: async () => '',
      arrayBuffer: async () => new ArrayBuffer(8),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const pdf = await convertHtmlToPdf('<html></html>');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/forms/chromium/convert/html');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect(pdf).toBeInstanceOf(Uint8Array);
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

    await expect(convertHtmlToPdf('<html></html>')).rejects.toThrow('500');
  });
});
