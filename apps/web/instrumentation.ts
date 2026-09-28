export async function register() {
  const { initializeSentryServer } = await import('@odb/sentry/server');

  initializeSentryServer();

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { setupOtel, setupPyroscope } = await import('./observability');

    setupOtel();
    setupPyroscope();
  }
}
