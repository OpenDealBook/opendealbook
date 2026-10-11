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
  }
}
