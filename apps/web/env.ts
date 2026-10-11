import { z } from 'zod';

import { createEnv, secret, url } from '@docuconf/t3';

/**
 * The typed, boot-validated env contract for the web app. Import `env`
 * instead of reading `process.env` directly in new code; existing
 * `process.env` reads elsewhere keep working unchanged.
 *
 * Keep this module free of side effects beyond `createEnv`: `docuconf-t3
 * export` imports it in export mode, which must not start anything.
 */
export const env = createEnv({
  name: 'web',
  clientPrefix: 'NEXT_PUBLIC_',
  client: {
    NEXT_PUBLIC_SUPABASE_URL: z
      .url()
      .describe('Base URL of the Supabase project used for auth and data'),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z
      .string()
      .min(1)
      .describe('Supabase anon key exposed to the browser client'),
    NEXT_PUBLIC_SITE_URL: z
      .url()
      .default('https://opendealbook.com')
      .describe('Public base URL the app is served from'),
    NEXT_PUBLIC_DEFAULT_LOCALE: z
      .string()
      .default('en')
      .describe('Default locale for next-intl routing'),
    NEXT_PUBLIC_DEFAULT_TIMEZONE: z
      .string()
      .default('UTC')
      .describe('Default timezone for date and time formatting'),
    NEXT_PUBLIC_LOCALES: z
      .string()
      .optional()
      .describe('Comma-separated list of locales next-intl serves'),
    NEXT_PUBLIC_ENABLE_MARKETING: z
      .stringbool()
      .default(true)
      .describe('Toggles the public marketing site routes'),
    NEXT_PUBLIC_SENTRY_DSN: z
      .url()
      .optional()
      .describe('Sentry DSN the browser client reports errors to'),
    NEXT_PUBLIC_MONITORING_PROVIDER: z
      .enum(['sentry', 'console'])
      .optional()
      .describe('Which monitoring backend the app reports errors to'),
    NEXT_PUBLIC_POSTHOG_KEY: z
      .string()
      .optional()
      .describe('PostHog project key that enables client analytics'),
    NEXT_PUBLIC_POSTHOG_HOST: z
      .url()
      .default('https://us.i.posthog.com')
      .describe('PostHog ingestion host the browser client sends events to'),
  },
  server: {
    SUPABASE_SERVICE_ROLE_KEY: secret(z.string().min(1)).describe(
      'Supabase service role key used for privileged server-side access',
    ),
    SUPABASE_DB_WEBHOOK_SECRET: secret(z.string().min(1)).describe(
      'Shared secret that signs inbound Supabase database webhooks',
    ),
    STRIPE_SECRET_KEY: secret(z.string().min(1)).describe(
      'Stripe API secret key used for billing operations',
    ),
    STRIPE_WEBHOOK_SECRET: secret(z.string().min(1)).describe(
      'Signing secret that verifies inbound Stripe webhooks',
    ),
    NANGO_HOST: url()
      .default('http://localhost:3003')
      .describe('Base URL of the Nango instance brokering OAuth connections'),
    NANGO_SECRET_KEY: secret(z.string())
      .optional()
      .describe('Nango secret key used to call the Nango server API'),
    NANGO_GMAIL_INTEGRATION_ID: z
      .string()
      .optional()
      .describe('Nango integration id for Gmail mailbox connections'),
    NANGO_MICROSOFT_INTEGRATION_ID: z
      .string()
      .optional()
      .describe('Nango integration id for Microsoft mailbox connections'),
    NANGO_GOOGLE_CALENDAR_INTEGRATION_ID: z
      .string()
      .optional()
      .describe('Nango integration id for Google Calendar connections'),
    NANGO_MICROSOFT_CALENDAR_INTEGRATION_ID: z
      .string()
      .optional()
      .describe('Nango integration id for Microsoft Calendar connections'),
    NOVU_API_KEY: secret(z.string())
      .optional()
      .describe('Novu API key used to trigger notification workflows'),
    NOVU_API_URL: url()
      .optional()
      .describe('Base URL of the Novu API the app sends notifications to'),
    DOCUMENSO_URL: url()
      .optional()
      .describe('Base URL of the Documenso instance used for e-signature'),
    DOCUMENSO_API_KEY: secret(z.string())
      .optional()
      .describe('Documenso API key used to create and send documents'),
    DOCLING_URL: url()
      .optional()
      .describe('Base URL of the Docling service used to extract document text'),
    DOCLING_API_KEY: secret(z.string())
      .optional()
      .describe('Docling API key used to authenticate extraction requests'),
    GOTENBERG_URL: url()
      .optional()
      .describe('Base URL of the Gotenberg service used to render PDFs'),
    KEYSTATIC_CONTENT_ROOT: z
      .string()
      .optional()
      .describe('Filesystem root Keystatic reads marketing content from'),
    CMS_CLIENT: z
      .enum(['keystatic', 'wordpress'])
      .default('keystatic')
      .describe('Which CMS provider backs the marketing content client'),
    CONTACT_LEAD_NOTIFY_EMAIL: z
      .string()
      .optional()
      .describe('Mailbox notified when the contact form receives a new lead'),
    PYROSCOPE_SERVER_ADDRESS: url()
      .optional()
      .describe('Pyroscope server address continuous profiling data is sent to'),
    OTEL_EXPORTER_OTLP_ENDPOINT: url()
      .optional()
      .describe('OTLP collector endpoint traces, metrics and logs are exported to'),
    OTEL_SERVICE_NAME: z
      .string()
      .optional()
      .describe('Service name attached to exported OpenTelemetry data'),
  },
  runtimeEnv: {
    ...process.env,
    // Next.js only inlines `process.env.NEXT_PUBLIC_*` written out in full.
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_DEFAULT_LOCALE: process.env.NEXT_PUBLIC_DEFAULT_LOCALE,
    NEXT_PUBLIC_DEFAULT_TIMEZONE: process.env.NEXT_PUBLIC_DEFAULT_TIMEZONE,
    NEXT_PUBLIC_LOCALES: process.env.NEXT_PUBLIC_LOCALES,
    NEXT_PUBLIC_ENABLE_MARKETING: process.env.NEXT_PUBLIC_ENABLE_MARKETING,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_MONITORING_PROVIDER: process.env.NEXT_PUBLIC_MONITORING_PROVIDER,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  },
  exitOnError: true,
  skipValidation: process.env.SKIP_ENV_VALIDATION === '1',
});
