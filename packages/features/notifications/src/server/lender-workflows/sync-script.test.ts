import { afterEach, describe, expect, it } from 'vitest';

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

function chartLines(): string[] {
  return readFileSync(
    new URL(
      '../../../../../../charts/opendealbook/templates/workloads.yaml',
      import.meta.url,
    ),
    'utf8',
  ).split('\n');
}

function syncScriptFromChart(): string {
  const lines = chartLines();
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

interface Integration {
  _id: string;
  identifier: string;
  providerId: string;
  channel: string;
  active: boolean;
  primary: boolean;
  credentials: Record<string, unknown>;
}

interface NovuState {
  bridgeUrls: string[];
  integrations: Integration[];
}

const servers: ReturnType<typeof createServer>[] = [];

async function fakeNovu(state: NovuState, refusing?: string) {
  const server = createServer((request, response) => {
    let raw = '';
    request.on('data', (chunk) => (raw += chunk));
    request.on('end', () => {
      const route = `${request.method} ${request.url}`;
      const reply = (status: number, data?: unknown) =>
        response
          .writeHead(status, { 'content-type': 'application/json' })
          .end(JSON.stringify({ data }));

      if (request.headers.authorization !== 'ApiKey key-1') {
        return reply(401);
      }
      if (route === refusing) {
        return reply(400);
      }
      if (route === 'POST /v1/bridge/sync?source=cli') {
        state.bridgeUrls.push(JSON.parse(raw).bridgeUrl);
        return reply(201);
      }
      if (route === 'GET /v1/integrations') {
        return reply(200, state.integrations);
      }
      if (route === 'POST /v1/integrations') {
        const { identifier, providerId, channel, credentials } =
          JSON.parse(raw);
        const created = {
          _id: 'created',
          identifier,
          providerId,
          channel,
          active: false,
          primary: false,
          credentials,
        };
        state.integrations.push(created);
        return reply(201, created);
      }
      const target = state.integrations.find((integration) =>
        route.includes(`/v1/integrations/${integration._id}`),
      );
      if (target && route === `PUT /v1/integrations/${target._id}`) {
        target.credentials = JSON.parse(raw).credentials;
        return reply(200);
      }
      if (
        target &&
        route === `POST /v1/integrations/${target._id}/set-primary`
      ) {
        Object.assign(target, { active: true, primary: true });
        return reply(201);
      }
      reply(404);
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const mail = {
  EMAIL_HOST: 'smtp.example.test',
  EMAIL_PORT: '465',
  EMAIL_SENDER: 'deals@example.test',
  EMAIL_SENDER_NAME: 'OpenDealbook',
};

const auth = { EMAIL_USER: 'mailer', EMAIL_PASSWORD: 'smtp-password' };

function runSync(
  env: Record<string, string>,
): Promise<{ exitCode: number | null; stderr: string }> {
  return new Promise((resolve) => {
    let stderr = '';
    const child = spawn(
      process.execPath,
      ['--input-type=module', '--eval', syncScriptFromChart()],
      { env: { PATH: process.env.PATH, ...env } },
    );
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('close', (exitCode) => resolve({ exitCode, stderr }));
  });
}

function emptyNovu(): NovuState {
  return { bridgeUrls: [], integrations: [] };
}

function handMadeSmtp(): Integration {
  return {
    _id: 'hand-made',
    identifier: 'nodemailer-x1y2',
    providerId: 'nodemailer',
    channel: 'email',
    active: true,
    primary: false,
    credentials: { host: 'other.example.test', port: '587' },
  };
}

describe('chart workflow sync script', () => {
  it('registers the bridge by the address other namespaces resolve', () => {
    const lines = chartLines();
    const name = lines.findIndex((line) =>
      line.includes('- name: NOVU_BRIDGE_URL'),
    );

    expect(lines[name + 1]?.trim()).toBe(
      'value: http://{{ include "opendealbook.fullname" . }}-web.{{ .Release.Namespace }}.svc.cluster.local:3000/api/novu',
    );
  });

  afterEach(() => {
    for (const server of servers.splice(0)) {
      server.close();
    }
  });

  it('asks Novu to sync from the bridge and succeeds on an ok answer', async () => {
    const state = emptyNovu();

    const { exitCode } = await runSync({
      NOVU_API_KEY: 'key-1',
      NOVU_API_URL: await fakeNovu(state),
      NOVU_BRIDGE_URL: 'http://web:3000/api/novu',
      ...mail,
    });

    expect(exitCode).toBe(0);
    expect(state.bridgeUrls).toEqual(['http://web:3000/api/novu']);
  });

  it('creates its own SMTP integration as the active primary, without auth when none is set', async () => {
    const state: NovuState = { bridgeUrls: [], integrations: [handMadeSmtp()] };

    const { exitCode } = await runSync({
      NOVU_API_KEY: 'key-1',
      NOVU_API_URL: await fakeNovu(state),
      NOVU_BRIDGE_URL: 'http://web:3000/api/novu',
      ...mail,
    });

    expect(exitCode).toBe(0);
    expect(state.integrations).toEqual([
      handMadeSmtp(),
      {
        _id: 'created',
        identifier: 'opendealbook-smtp',
        providerId: 'nodemailer',
        channel: 'email',
        active: true,
        primary: true,
        credentials: {
          host: 'smtp.example.test',
          port: '465',
          secure: true,
          from: 'deals@example.test',
          senderName: 'OpenDealbook',
        },
      },
    ]);
  });

  it('overwrites its own SMTP integration and converges on a rerun', async () => {
    const state: NovuState = {
      bridgeUrls: [],
      integrations: [
        handMadeSmtp(),
        {
          _id: 'owned',
          identifier: 'opendealbook-smtp',
          providerId: 'nodemailer',
          channel: 'email',
          active: false,
          primary: false,
          credentials: { host: 'old.example.test', port: '25' },
        },
      ],
    };
    const env = {
      NOVU_API_KEY: 'key-1',
      NOVU_API_URL: await fakeNovu(state),
      NOVU_BRIDGE_URL: 'http://web:3000/api/novu',
      ...mail,
      ...auth,
      EMAIL_TLS: 'false',
    };
    const converged = [
      handMadeSmtp(),
      {
        _id: 'owned',
        identifier: 'opendealbook-smtp',
        providerId: 'nodemailer',
        channel: 'email',
        active: true,
        primary: true,
        credentials: {
          host: 'smtp.example.test',
          port: '465',
          secure: false,
          user: 'mailer',
          password: 'smtp-password',
          from: 'deals@example.test',
          senderName: 'OpenDealbook',
        },
      },
    ];

    expect((await runSync(env)).exitCode).toBe(0);
    expect(state.integrations).toEqual(converged);

    expect((await runSync(env)).exitCode).toBe(0);
    expect(state.integrations).toEqual(converged);
  });

  it('syncs the workflows, then fails naming the missing mail keys before touching integrations', async () => {
    const state = emptyNovu();

    const { exitCode, stderr } = await runSync({
      NOVU_API_KEY: 'key-1',
      NOVU_API_URL: await fakeNovu(state),
      NOVU_BRIDGE_URL: 'http://web:3000/api/novu',
      ...auth,
      EMAIL_PORT: '465',
      EMAIL_SENDER: 'deals@example.test',
    });

    expect(exitCode).toBe(1);
    expect(stderr).toContain('EMAIL_HOST, EMAIL_SENDER_NAME');
    expect(state).toEqual({
      bridgeUrls: ['http://web:3000/api/novu'],
      integrations: [],
    });
  });

  it.each([
    'POST /v1/bridge/sync?source=cli',
    'GET /v1/integrations',
    'POST /v1/integrations',
  ])('fails when Novu refuses %s', async (refusing) => {
    const { exitCode, stderr } = await runSync({
      NOVU_API_KEY: 'key-1',
      NOVU_API_URL: await fakeNovu(emptyNovu(), refusing),
      NOVU_BRIDGE_URL: 'http://web:3000/api/novu',
      ...mail,
    });

    expect(exitCode).toBe(1);
    expect(stderr).toContain(`Novu refused ${refusing}: 400`);
  });

  it.each<{ missing: string; env: Record<string, string> }>([
    { missing: 'key', env: { NOVU_API_URL: 'http://127.0.0.1:1' } },
    { missing: 'URL', env: { NOVU_API_KEY: 'key-1' } },
  ])('skips without failing when Novu has no $missing', async ({ env }) => {
    expect(
      (await runSync({ ...env, NOVU_BRIDGE_URL: 'http://web:3000/api/novu' }))
        .exitCode,
    ).toBe(0);
  });
});
