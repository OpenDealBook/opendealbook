import { subscribe, unsubscribe } from 'node:diagnostics_channel';
import { createServer } from 'node:http';
import type { ClientRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createStripeClient } from './stripe-client';

async function interceptRequestTargets(): Promise<string[]> {
  const targets: string[] = [];
  const intercept = (message: unknown) => {
    const { request } = message as { request: ClientRequest };
    targets.push(`${request.protocol}//${String(request.getHeader('host'))}`);
    request.destroy(new Error('intercepted'));
  };
  subscribe('http.client.request.created', intercept);

  try {
    await expect(
      createStripeClient().balance.retrieve(undefined, { maxNetworkRetries: 0 }),
    ).rejects.toThrow();
  } finally {
    unsubscribe('http.client.request.created', intercept);
  }

  return targets;
}

function expectRefusal(apiBase: string, message: string) {
  vi.stubEnv('STRIPE_API_BASE', apiBase);

  expect(() => createStripeClient()).toThrow(new Error(message));
}

describe('createStripeClient', () => {
  beforeEach(() => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sends API requests to STRIPE_API_BASE when it is set', async () => {
    const receivedPaths: string[] = [];
    const server = createServer((request, response) => {
      receivedPaths.push(request.url ?? '');
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ object: 'balance', available: [], pending: [] }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

    try {
      const { port } = server.address() as AddressInfo;
      vi.stubEnv('STRIPE_API_BASE', `http://127.0.0.1:${port}`);

      const balance = await createStripeClient().balance.retrieve();

      expect(receivedPaths).toEqual(['/v1/balance']);
      expect(balance.object).toBe('balance');
    } finally {
      server.close();
    }
  });

  it('sends API requests over https when STRIPE_API_BASE uses https', async () => {
    vi.stubEnv('STRIPE_API_BASE', 'https://stripe-stub.test:8443');

    expect(await interceptRequestTargets()).toEqual(['https://stripe-stub.test:8443']);
  });

  it.each([
    ['http://stripe-stub.test:80', 'http://stripe-stub.test'],
    ['https://stripe-stub.test:443', 'https://stripe-stub.test'],
  ])('accepts the explicitly written default port in %s', async (apiBase, target) => {
    vi.stubEnv('STRIPE_API_BASE', apiBase);

    expect(await interceptRequestTargets()).toEqual([target]);
  });

  it.each(['http://stripe-stub.test:12111?', 'http://stripe-stub.test:12111#'])(
    'accepts the empty query or fragment marker in %s',
    async (apiBase) => {
      vi.stubEnv('STRIPE_API_BASE', apiBase);

      expect(await interceptRequestTargets()).toEqual(['http://stripe-stub.test:12111']);
    },
  );

  it('sends API requests to https://api.stripe.com when STRIPE_API_BASE is unset', async () => {
    vi.stubEnv('STRIPE_API_BASE', undefined);

    expect(await interceptRequestTargets()).toEqual(['https://api.stripe.com']);
  });

  it('sends API requests to https://api.stripe.com when STRIPE_API_BASE is empty', async () => {
    vi.stubEnv('STRIPE_API_BASE', '');

    expect(await interceptRequestTargets()).toEqual(['https://api.stripe.com']);
  });

  it.each(['127.0.0.1:12111', 'not a url'])('refuses the malformed STRIPE_API_BASE %s', (apiBase) => {
    expectRefusal(apiBase, 'STRIPE_API_BASE must be a valid URL');
  });

  it('refuses a STRIPE_API_BASE whose scheme is not http or https', () => {
    expectRefusal('ftp://127.0.0.1:2121', 'STRIPE_API_BASE must use http or https');
  });

  it('refuses a STRIPE_API_BASE with a username or password', () => {
    expectRefusal(
      'http://user:secret@127.0.0.1:12111',
      'STRIPE_API_BASE must not include a username or password',
    );
  });

  it('refuses a STRIPE_API_BASE without an explicit port', () => {
    expectRefusal('http://stripe-stub', 'STRIPE_API_BASE must include an explicit port');
  });

  it('refuses a STRIPE_API_BASE with a path', () => {
    expectRefusal('http://127.0.0.1:12111/prefix', 'STRIPE_API_BASE must not include a path');
  });

  it('refuses a STRIPE_API_BASE with a query string', () => {
    expectRefusal('http://127.0.0.1:12111?x=1', 'STRIPE_API_BASE must not include a query string');
  });

  it('refuses a STRIPE_API_BASE with a fragment', () => {
    expectRefusal('http://127.0.0.1:12111#x', 'STRIPE_API_BASE must not include a fragment');
  });
});
