import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const TUCKIN_PACKAGES = [
  '@tuckin/analytics',
  '@tuckin/auth',
  '@tuckin/billing',
  '@tuckin/billing-gateway',
  '@tuckin/cms',
  '@tuckin/cms-types',
  '@tuckin/database-webhooks',
  '@tuckin/i18n',
  '@tuckin/keystatic',
  '@tuckin/monitoring',
  '@tuckin/next',
  '@tuckin/sentry',
  '@tuckin/shared',
  '@tuckin/stripe',
  '@tuckin/supabase',
  '@tuckin/ui',
];

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: TUCKIN_PACKAGES,
  serverExternalPackages: ['pino', 'pino-pretty'],
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: '127.0.0.1' },
      { protocol: 'http', hostname: 'localhost' },
      ...(SUPABASE_URL
        ? [
            {
              protocol: new URL(SUPABASE_URL).protocol.replace(':', ''),
              hostname: new URL(SUPABASE_URL).hostname,
            },
          ]
        : []),
    ],
  },
};

export default withNextIntl(config);
