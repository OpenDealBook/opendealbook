export async function register() {
  const { initializeSentryServer } = await import('@tuckin/sentry/server');

  initializeSentryServer();

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { setupOtel, setupPyroscope } = await import('./observability');

    setupOtel();
    setupPyroscope();
  }
}
