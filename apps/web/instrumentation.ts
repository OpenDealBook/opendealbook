import { registerEnv } from '@docuconf/t3/next';

// Validates the env contract once per server start, before anything else
// runs, so a misconfigured pod fails fast instead of serving 500s.
const validateEnv = registerEnv(() => import('./env.ts'));

export async function register() {
  await validateEnv();

  const { initializeSentryServer } = await import('@odb/sentry/server');

  initializeSentryServer();

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { setupOtel, setupPyroscope } = await import('./observability');

    setupOtel();
    setupPyroscope();

    const { env } = await import('./env.ts');
    const { getSupabaseServerAdminClient } =
      await import('@odb/supabase/admin');

    await getSupabaseServerAdminClient()
      .rpc('set_team_rename_limit', { rename_limit: env.TEAM_RENAME_LIMIT })
      .throwOnError();

    await getSupabaseServerAdminClient()
      .rpc('set_team_account_billing', { enabled: env.ENABLE_BILLING })
      .throwOnError();
  }
}
