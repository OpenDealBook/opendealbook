import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { convertWithGotenberg } from '../src/gotenberg/index';

import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

const gotenberg = {
  server: null as unknown as Server,
  url: '',
  answer: 'pdf' as 'pdf' | 'error' | 'never',
  uploads: [] as {
    path: string;
    fileName: string;
    contentType: string;
    body: string;
  }[],
};

beforeAll(async () => {
  gotenberg.server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      if (gotenberg.answer === 'never') {
        return;
      }
      if (gotenberg.answer === 'error') {
        response.writeHead(503).end('LibreOffice is busy');
        return;
      }
      const upload =
        /filename="([^"]+)"\r\nContent-Type: ([^\r]+)\r\n\r\n([\s\S]*?)\r\n--/.exec(
          Buffer.concat(chunks).toString('latin1'),
        )!;
      gotenberg.uploads.push({
        path: request.url!,
        fileName: upload[1]!,
        contentType: upload[2]!,
        body: upload[3]!,
      });
      response.writeHead(200).end('%PDF-1.7');
    });
  });
  await new Promise<void>((resolve) =>
    gotenberg.server.listen(0, '127.0.0.1', resolve),
  );
  gotenberg.url = `http://127.0.0.1:${(gotenberg.server.address() as AddressInfo).port}`;
});

afterEach(() => {
  gotenberg.answer = 'pdf';
  gotenberg.uploads.length = 0;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

afterAll(async () => {
  gotenberg.server.closeAllConnections();
  await new Promise((resolve) => gotenberg.server.close(resolve));
});

describe('convertWithGotenberg', () => {
  it('posts the file to the named route and returns the PDF bytes', async () => {
    vi.stubEnv('GOTENBERG_URL', gotenberg.url);

    const pdf = await convertWithGotenberg(
      '/forms/chromium/convert/html',
      new Blob(['<p>Offer</p>'], { type: 'text/html' }),
      'index.html',
    );

    expect(Buffer.from(pdf).toString('latin1')).toBe('%PDF-1.7');
    expect(gotenberg.uploads).toEqual([
      {
        path: '/forms/chromium/convert/html',
        fileName: 'index.html',
        contentType: 'text/html',
        body: '<p>Offer</p>',
      },
    ]);
  });

  it('throws with the status and the start of the answer when Gotenberg fails', async () => {
    vi.stubEnv('GOTENBERG_URL', gotenberg.url);
    gotenberg.answer = 'error';

    await expect(
      convertWithGotenberg(
        '/forms/libreoffice/convert',
        new Blob(['x']),
        'document.docx',
      ),
    ).rejects.toThrow('Gotenberg conversion failed: 503 LibreOffice is busy');
  });

  it('gives up after 60 seconds when Gotenberg never answers', async () => {
    vi.stubEnv('GOTENBERG_URL', gotenberg.url);
    gotenberg.answer = 'never';
    const realTimeout = AbortSignal.timeout.bind(AbortSignal);
    const waits: number[] = [];
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((milliseconds) => {
      waits.push(milliseconds);
      return realTimeout(milliseconds / 1000);
    });

    await expect(
      convertWithGotenberg(
        '/forms/libreoffice/convert',
        new Blob(['x']),
        'document.docx',
      ),
    ).rejects.toThrow('The operation was aborted due to timeout');
    expect(waits).toEqual([60_000]);
  });
});
