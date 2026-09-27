import { init } from '@sentry/nextjs';

type SentryInitOptions = NonNullable<Parameters<typeof init>[0]>;

export function initializeSentryServer(options: SentryInitOptions = {}) {
  init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 1.0,
    ...options,
  });
}
