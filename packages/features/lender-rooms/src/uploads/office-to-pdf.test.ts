import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { convertOfficeToPdf } from './office-to-pdf';

import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

const gotenberg = {
  server: null as unknown as Server,
  neverAnswers: false,
  uploads: [] as { path: string; fileName: string; contentType: string }[],
};

beforeAll(async () => {
  gotenberg.server = createServer((request, response) => {
    const chunks: Buffer[] = [];

    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      if (gotenberg.neverAnswers) {
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
      });
      response.writeHead(200).end(`%PDF-1.7 of ${upload[3]}`);
    });
  });
  await new Promise<void>((resolve) => gotenberg.server.listen(0, resolve));
  process.env.GOTENBERG_URL = `http://127.0.0.1:${(gotenberg.server.address() as AddressInfo).port}`;
});

afterEach(() => {
  gotenberg.neverAnswers = false;
  gotenberg.uploads.length = 0;
  vi.restoreAllMocks();
});

afterAll(async () => {
  gotenberg.server.closeAllConnections();
  await new Promise((resolve) => gotenberg.server.close(resolve));
});

describe('converting an office file to PDF', () => {
  it.each([
    [
      'guaranty.docx',
      'document.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    ['guaranty.doc', 'document.doc', 'application/msword'],
    [
      'Board Deck.PPTX',
      'document.pptx',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ],
  ])(
    'hands %s to LibreOffice as %s with its type and returns the PDF',
    async (fileName, sentAs, contentType) => {
      const pdf = await convertOfficeToPdf(
        Buffer.from('the bytes', 'latin1'),
        fileName,
      );

      expect(Buffer.from(pdf).toString('latin1')).toBe('%PDF-1.7 of the bytes');
      expect(gotenberg.uploads).toEqual([
        {
          path: '/forms/libreoffice/convert',
          fileName: sentAs,
          contentType,
        },
      ]);
    },
  );

  it('gives up after 60 seconds when Gotenberg never answers', async () => {
    const realTimeout = AbortSignal.timeout.bind(AbortSignal);
    const waits: number[] = [];
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((milliseconds) => {
      waits.push(milliseconds);
      return realTimeout(milliseconds / 1000);
    });
    gotenberg.neverAnswers = true;

    await expect(
      convertOfficeToPdf(new Uint8Array([1, 2, 3]), 'guaranty.docx'),
    ).rejects.toThrow('The operation was aborted due to timeout');
    expect(waits).toEqual([60_000]);
  });
});
