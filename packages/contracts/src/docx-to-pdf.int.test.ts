import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { convertDocxToPdf } from './docx-to-pdf';

import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

let failingGotenberg: Server;

beforeAll(async () => {
  failingGotenberg = createServer((_request, response) => {
    response.writeHead(500).end('LibreOffice crashed');
  });
  await new Promise<void>((listening) =>
    failingGotenberg.listen(0, '127.0.0.1', listening),
  );
});

afterAll(() => {
  failingGotenberg.close();
  vi.unstubAllEnvs();
});

describe('convertDocxToPdf', () => {
  it('gives no PDF when Gotenberg answers with an error', async () => {
    const { port } = failingGotenberg.address() as AddressInfo;
    vi.stubEnv('GOTENBERG_URL', `http://127.0.0.1:${port}`);

    expect(await convertDocxToPdf(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it('refuses to run without GOTENBERG_URL configured', async () => {
    vi.stubEnv('GOTENBERG_URL', undefined);

    await expect(convertDocxToPdf(new Uint8Array([1, 2, 3]))).rejects.toThrow(
      'Missing required environment variable: GOTENBERG_URL',
    );
  });
});
