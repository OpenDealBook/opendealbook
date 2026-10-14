import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pinnedRequest } from './pinned-request';
import { readSite, type SiteAccess } from './read-site';
import { PNG, PUBLIC_ADDRESS } from './test-support/fake-site';
import { startTlsSite } from './test-support/tls-site';

import type { Server } from 'node:https';

const LOOPBACK = { address: '127.0.0.1', family: 4 };

let server: Server;
let port: number;
let localSite: SiteAccess;

async function readAll(body: AsyncIterable<Uint8Array>): Promise<string> {
  const chunks: Uint8Array[] = [];

  for await (const chunk of body) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString();
}

function get(path: string, signal = AbortSignal.timeout(5_000)) {
  return pinnedRequest(new URL(path, `https://firstbank.test:${port}`), {
    address: LOOPBACK,
    signal,
  });
}

beforeAll(async () => {
  ({ server, port } = await startTlsSite());

  localSite = {
    lookup: async () => [{ address: PUBLIC_ADDRESS, family: 4 }],
    request: (url, init) =>
      pinnedRequest(new URL(url.pathname, `https://${url.hostname}:${port}`), {
        signal: init.signal,
        address: LOOPBACK,
      }),
  };
});

afterAll(() => {
  server.closeAllConnections();
  server.close();
});

describe('pinnedRequest', () => {
  it('connects to the address it is given, under the name in the URL', async () => {
    const response = await get('/echo');

    expect(response.status).toBe(200);
    expect(response.contentType).toBe('application/json');
    expect(JSON.parse(await readAll(response.body)).host).toBe(
      `firstbank.test:${port}`,
    );
  });

  it('refuses a server whose certificate is for another name', async () => {
    await expect(
      pinnedRequest(new URL(`https://secondbank.test:${port}/echo`), {
        address: LOOPBACK,
        signal: AbortSignal.timeout(5_000),
      }),
    ).rejects.toThrow(/secondbank\.test/);
  });

  it('identifies itself as OpenDealbookBot/1.0', async () => {
    const response = await get('/echo');

    expect(JSON.parse(await readAll(response.body)).userAgent).toBe(
      'OpenDealbookBot/1.0',
    );
  });

  it('hands back a redirect without following it', async () => {
    const response = await get('/moved');

    expect(response.status).toBe(301);
    expect(response.location).toBe('https://www.firstbank.test/');
  });

  it('gives up when the signal aborts before the server answers', async () => {
    await expect(get('/hang', AbortSignal.timeout(200))).rejects.toThrow();
  });
});

describe.concurrent('readSite over the real transport', () => {
  it('reads a page and its icon', async () => {
    expect(await readSite('firstbank.test', localSite)).toEqual({
      name: 'First Bank',
      icon: { bytes: PNG, contentType: 'image/png' },
    });
  });

  it('has no brand when the connection drops part way through the page', async () => {
    expect(await readSite('broken-page.firstbank.test', localSite)).toBeNull();
  });

  it('has no icon when the connection drops part way through the icon', async () => {
    expect(await readSite('broken-icon.firstbank.test', localSite)).toEqual({
      name: 'First Bank',
      icon: null,
    });
  });

  it(
    'has no brand when the page stalls after its headers',
    { timeout: 10_000 },
    async () => {
      expect(
        await readSite('stalled-page.firstbank.test', localSite),
      ).toBeNull();
    },
  );

  it(
    'has no icon when the icon stalls after its headers',
    { timeout: 10_000 },
    async () => {
      expect(await readSite('stalled-icon.firstbank.test', localSite)).toEqual({
        name: 'First Bank',
        icon: null,
      });
    },
  );
});
