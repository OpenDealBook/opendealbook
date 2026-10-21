import { fileURLToPath } from 'node:url';

import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const MONOREPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

const TUCKIN_PACKAGES = [
  '@odb/analytics',
  '@odb/auth',
  '@odb/billing',
  '@odb/billing-gateway',
  '@odb/cms',
  '@odb/cms-types',
  '@odb/database-webhooks',
  '@odb/i18n',
  '@odb/keystatic',
  '@odb/monitoring',
  '@odb/next',
  '@odb/sentry',
  '@odb/shared',
  '@odb/stripe',
  '@odb/supabase',
  '@odb/ui',
];

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

/** @type {import('next').NextConfig} */
const config = {
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  outputFileTracingRoot: MONOREPO_ROOT,
  outputFileTracingIncludes: {
    '/**': ['node_modules/@pyroscope/nodejs/**/*', 'node_modules/@datadog/pprof/**/*'],
    '/api/pdfjs/\\[\\.\\.\\.asset\\]': [
      '../../packages/features/lender-rooms/node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
      '../../packages/features/lender-rooms/node_modules/pdfjs-dist/wasm/*',
      '../../packages/features/lender-rooms/node_modules/pdfjs-dist/cmaps/*',
      '../../packages/features/lender-rooms/node_modules/pdfjs-dist/standard_fonts/*',
      '../../packages/features/lender-rooms/node_modules/pdfjs-dist/iccs/*',
    ],
  },
  transpilePackages: TUCKIN_PACKAGES,
  serverExternalPackages: ['pino', 'pino-pretty', '@pyroscope/nodejs', '@datadog/pprof'],
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
