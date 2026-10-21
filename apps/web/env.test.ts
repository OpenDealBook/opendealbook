import { afterEach, describe, expect, it, vi } from 'vitest';

import { stubBootEnv } from './test-env';

async function boot(vars: Record<string, string | undefined>) {
  stubBootEnv(vars);
  const { env } = await import('./env');

  return env;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('the web env contract', () => {
  it('reads the seller delivery sender and boots without one', async () => {
    const configured = await boot({
      SELLER_DELIVERY_FROM_EMAIL: 'Deals <deals@odb.test>',
    });

    expect(configured.SELLER_DELIVERY_FROM_EMAIL).toBe(
      'Deals <deals@odb.test>',
    );

    const unset = await boot({ SELLER_DELIVERY_FROM_EMAIL: undefined });

    expect(unset.SELLER_DELIVERY_FROM_EMAIL).toBeUndefined();
  });

  it('boots with no Stripe configuration when billing is off', async () => {
    await expect(
      boot({
        ENABLE_BILLING: 'false',
        STRIPE_SECRET_KEY: undefined,
        STRIPE_WEBHOOK_SECRET: undefined,
        STRIPE_API_BASE: undefined,
      }),
    ).resolves.toBeDefined();
  });

  it('reads billing and marketing as on by default', async () => {
    const env = await boot({
      ENABLE_BILLING: undefined,
      ENABLE_MARKETING: undefined,
    });

    expect(env.ENABLE_BILLING).toBe(true);
    expect(env.ENABLE_MARKETING).toBe(true);
  });

  it('reads billing and marketing off from the server env', async () => {
    const env = await boot({
      ENABLE_BILLING: 'false',
      ENABLE_MARKETING: 'false',
    });

    expect(env.ENABLE_BILLING).toBe(false);
    expect(env.ENABLE_MARKETING).toBe(false);
  });

  it('accepts a Stripe API base with a scheme, host and explicit port', async () => {
    const env = await boot({ STRIPE_API_BASE: 'http://127.0.0.1:12111' });

    expect(env.STRIPE_API_BASE).toBe('http://127.0.0.1:12111');
  });

  it.each([
    ['ftp://127.0.0.1:12111', 'must use http or https'],
    ['http://127.0.0.1', 'must include an explicit port'],
    ['http://127.0.0.1:12111/v1', 'must not include a path'],
    ['http://127.0.0.1:12111/?mode=test', 'must not include a query string'],
    ['http://127.0.0.1:12111/#top', 'must not include a fragment'],
    ['http://user:pass@127.0.0.1:12111', 'must not include a username'],
  ])('refuses to boot with STRIPE_API_BASE=%s', async (value, rule) => {
    await expect(boot({ STRIPE_API_BASE: value })).rejects.toThrow(
      `STRIPE_API_BASE ${rule}`,
    );
  });

  it.each(['yes', '1', 'on'])(
    'refuses to boot with ENABLE_BILLING=%s',
    async (value) => {
      await expect(boot({ ENABLE_BILLING: value })).rejects.toThrow(
        'ENABLE_BILLING',
      );
    },
  );

  it.each(['yes', '1', 'off'])(
    'refuses to boot with ENABLE_MARKETING=%s',
    async (value) => {
      await expect(boot({ ENABLE_MARKETING: value })).rejects.toThrow(
        'ENABLE_MARKETING',
      );
    },
  );

  it.each(['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'])(
    'refuses to boot without %s when billing is on',
    async (name) => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(boot({ [name]: undefined })).rejects.toThrow();
      expect(JSON.stringify(errors.mock.calls)).toContain(name);
    },
  );

  it('treats an empty optional value as unset', async () => {
    const env = await boot({ NEXT_PUBLIC_SENTRY_DSN: '' });

    expect(env.NEXT_PUBLIC_SENTRY_DSN).toBeUndefined();
  });

  it('treats an empty lender digest interval as unset', async () => {
    const env = await boot({ LENDER_DIGEST_INTERVAL_MINUTES: '' });

    expect(env.LENDER_DIGEST_INTERVAL_MINUTES).toBeUndefined();
  });

  it('reads a positive whole lender digest interval', async () => {
    const env = await boot({ LENDER_DIGEST_INTERVAL_MINUTES: '15' });

    expect(env.LENDER_DIGEST_INTERVAL_MINUTES).toBe(15);
  });

  it.each(['0', '-1', '1.5', 'abc'])(
    'refuses to boot with lender digest interval %s',
    async (value) => {
      await expect(
        boot({ LENDER_DIGEST_INTERVAL_MINUTES: value }),
      ).rejects.toThrow(/LENDER_DIGEST_INTERVAL_MINUTES/);
    },
  );

  it('limits team renames to one a month when the limit is unset', async () => {
    const env = await boot({ TEAM_RENAME_LIMIT: undefined });

    expect(env.TEAM_RENAME_LIMIT).toBe('monthly');
  });

  it('lifts the team rename limit when it is off', async () => {
    const env = await boot({ TEAM_RENAME_LIMIT: 'off' });

    expect(env.TEAM_RENAME_LIMIT).toBe('off');
  });

  it('refuses to boot without the Gotenberg URL', async () => {
    await expect(boot({ GOTENBERG_URL: undefined })).rejects.toThrow(
      /GOTENBERG_URL/,
    );
  });

  it('refuses to boot with an unknown team rename limit', async () => {
    await expect(boot({ TEAM_RENAME_LIMIT: 'weekly' })).rejects.toThrow(
      /TEAM_RENAME_LIMIT/,
    );
  });
});
