import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

function syncScriptFromChart(): string {
  const lines = readFileSync(
    new URL(
      '../../../../../../charts/opendealbook/templates/workloads.yaml',
      import.meta.url,
    ),
    'utf8',
  ).split('\n');
  const start = lines.findIndex((line) => line.includes('-novu-sync'));
  const block = lines.indexOf('            - |-', start) + 1;
  const end = lines.findIndex(
    (line, index) => index > block && /^ {0,13}\S/.test(line),
  );

  return lines
    .slice(block, end)
    .map((line) => line.slice(14))
    .join('\n');
}

interface Received {
  url: string | undefined;
  authorization: string | undefined;
  body: string;
}

const servers: ReturnType<typeof createServer>[] = [];

async function novuAnswering(status: number, received: Received[] = []) {
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => (body += chunk));
    request.on('end', () => {
      received.push({
        url: request.url,
        authorization: request.headers.authorization,
        body,
      });
      response.writeHead(status).end('not json');
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function runSync(env: Record<string, string>): Promise<number | null> {
  return new Promise((resolve) => {
    spawn(
      process.execPath,
      ['--input-type=module', '--eval', syncScriptFromChart()],
      { env: { PATH: process.env.PATH, ...env } },
    ).on('close', resolve);
  });
}

describe('chart workflow sync script', () => {
  afterEach(() => {
    for (const server of servers.splice(0)) {
      server.close();
    }
  });

  it('asks Novu to sync from the bridge and succeeds on an ok answer', async () => {
    const received: Received[] = [];
    const novuUrl = await novuAnswering(201, received);

    const exitCode = await runSync({
      NOVU_API_KEY: 'key-1',
      NOVU_API_URL: novuUrl,
      NOVU_BRIDGE_URL: 'http://web:3000/api/novu',
    });

    expect(exitCode).toBe(0);
    expect(received).toEqual([
      {
        url: '/v1/bridge/sync?source=cli',
        authorization: 'ApiKey key-1',
        body: JSON.stringify({ bridgeUrl: 'http://web:3000/api/novu' }),
      },
    ]);
  });

  it('fails when Novu refuses the sync', async () => {
    const exitCode = await runSync({
      NOVU_API_KEY: 'key-1',
      NOVU_API_URL: await novuAnswering(400),
      NOVU_BRIDGE_URL: 'http://web:3000/api/novu',
    });

    expect(exitCode).toBe(1);
  });

  it.each<{ missing: string; env: Record<string, string> }>([
    { missing: 'key', env: { NOVU_API_URL: 'http://127.0.0.1:1' } },
    { missing: 'URL', env: { NOVU_API_KEY: 'key-1' } },
  ])('skips without failing when Novu has no $missing', async ({ env }) => {
    expect(
      await runSync({ ...env, NOVU_BRIDGE_URL: 'http://web:3000/api/novu' }),
    ).toBe(0);
  });
});
