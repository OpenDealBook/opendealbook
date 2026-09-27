export async function register() {
  const { initializeSentryServer } = await import('@tuckin/sentry/server');

  initializeSentryServer();
}
