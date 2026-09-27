import { init } from '@sentry/nextjs';

type SentryInitOptions = NonNullable<Parameters<typeof init>[0]>;

export function initializeSentryClient(options: SentryInitOptions = {}) {
  init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    ...options,
  });
}
