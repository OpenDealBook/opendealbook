import { afterEach, describe, expect, it, vi } from 'vitest';

const databaseWrites: unknown[] = [];

vi.mock('@docuconf/t3/next', () => ({
  registerEnv: () => async () => {},
}));
vi.mock('@odb/sentry/server', () => ({ initializeSentryServer: () => {} }));
vi.mock('./observability', () => ({
  setupOtel: () => {},
  setupPyroscope: () => {},
}));
vi.mock('@odb/supabase/admin', () => ({
  getSupabaseServerAdminClient: () => ({
    rpc: (name: string, args: unknown) => ({
      throwOnError: async () => {
        databaseWrites.push([name, args]);
      },
    }),
  }),
}));

async function boot(vars: Record<string, string | undefined>) {
  vi.resetModules();
  databaseWrites.length = 0;
  for (const [name, value] of Object.entries({
    NEXT_RUNTIME: 'nodejs',
    NEXT_PUBLIC_SUPABASE_URL: 'https://supabase.test',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    SUPABASE_DB_WEBHOOK_SECRET: 'test-db-webhook-secret',
    GOTENBERG_URL: 'http://gotenberg.test',
    ...vars,
  })) {
    vi.stubEnv(name, value);
  }

  const { register } = await import('./instrumentation');
  await register();
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('server boot', () => {
  it('writes the team rename limit and the billing switch to the database', async () => {
    await boot({ TEAM_RENAME_LIMIT: 'off', ENABLE_BILLING: 'false' });

    expect(databaseWrites).toEqual([
      ['set_team_rename_limit', { rename_limit: 'off' }],
      ['set_team_account_billing', { enabled: false }],
    ]);
  });

  it('writes the monthly rename limit when it is unset', async () => {
    await boot({ TEAM_RENAME_LIMIT: undefined, ENABLE_BILLING: 'false' });

    expect(databaseWrites).toContainEqual([
      'set_team_rename_limit',
      { rename_limit: 'monthly' },
    ]);
  });
});
