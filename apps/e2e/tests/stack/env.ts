import {
  ANON_KEY,
  DOCUMENSO_URL,
  DOCUMENSO_WEBHOOK_SECRET,
  GOTENBERG_URL,
  LLM_API_KEY,
  LLM_API_KEY_ENV,
  MAILPIT_SMTP_PORT,
  NANGO_SECRET_KEY,
  NOVU_API_URL,
  SERVICE_ROLE_KEY,
  STAND_INS,
  STRIPE_WEBHOOK_SECRET,
  SUPABASE_URL,
  VARIANT_URL,
  WEB_URL,
} from '../fixtures/stack';

export const SENDER = {
  address: 'e2e@opendealbook.test',
  name: 'Open Deal Book',
};

function sharedEnv(novuApiKey: string) {
  return {
    MAILER_PROVIDER: 'nodemailer',
    EMAIL_HOST: '127.0.0.1',
    EMAIL_PORT: String(MAILPIT_SMTP_PORT),
    EMAIL_TLS: 'false',
    NOVU_API_URL,
    NOVU_API_KEY: novuApiKey,
    [LLM_API_KEY_ENV]: LLM_API_KEY,
    GMAIL_API_BASE: STAND_INS.gmail,
    E2E_CLOCK_OFFSET_HOURS: '48',
  };
}

export function workersEnv(novuApiKey: string): Record<string, string> {
  return {
    ...sharedEnv(novuApiKey),
    NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
    NANGO_HOST: STAND_INS.nango,
    NANGO_SECRET_KEY,
    TRIAL_DRIP_FROM_EMAIL: `${SENDER.name} <${SENDER.address}>`,
    SELLER_DELIVERY_FROM_EMAIL: `${SENDER.name} <${SENDER.address}>`,
  };
}

function webEnv(novuApiKey: string, siteUrl: string) {
  return {
    ...sharedEnv(novuApiKey),
    NEXT_PUBLIC_SITE_URL: siteUrl,
    LENDER_ROOMS_FROM_EMAIL: `${SENDER.name} <${SENDER.address}>`,
    SELLER_DELIVERY_FROM_EMAIL: `${SENDER.name} <${SENDER.address}>`,
    CONTACT_LEAD_NOTIFY_EMAIL: 'leads@opendealbook.test',
    STRIPE_API_BASE: STAND_INS.stripe,
    STRIPE_SECRET_KEY: 'sk_test_e2e_stand_in',
    STRIPE_WEBHOOK_SECRET,
    NANGO_HOST: STAND_INS.nango,
    NANGO_SECRET_KEY,
    GOTENBERG_URL,
    LENDER_DIGEST_INTERVAL_MINUTES: '1',
  };
}

// Each server builds into its own distDir so neither takes the dev lock of a
// developer's own `next dev` in apps/web.
export function mainServerEnv({
  novuApiKey,
  documensoApiKey,
}: {
  novuApiKey: string;
  documensoApiKey: string;
}): Record<string, string> {
  return {
    ...webEnv(novuApiKey, WEB_URL),
    NEXT_DIST_DIR: '.next/e2e-main',
    DOCUMENSO_URL,
    DOCUMENSO_API_KEY: documensoApiKey,
    DOCUMENSO_WEBHOOK_SECRET,
  };
}

export function variantServerEnv({
  novuApiKey,
}: {
  novuApiKey: string;
}): Record<string, string> {
  return {
    ...webEnv(novuApiKey, VARIANT_URL),
    NEXT_DIST_DIR: '.next/e2e-variant',
    ENABLE_MARKETING: 'false',
    ENABLE_BILLING: 'false',
  };
}
