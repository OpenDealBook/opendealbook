import { z } from 'zod';

import { createEnv, secret, url } from '@docuconf/t3';

/**
 * The typed, boot-validated env contract for the Temporal worker process.
 *
 * Keep this module free of side effects beyond `createEnv`: `docuconf-t3
 * export` imports it in export mode, which must not connect to Temporal.
 */
export const env = createEnv({
  name: 'workers',
  server: {
    TEMPORAL_ADDRESS: z
      .string()
      .default('localhost:7233')
      .describe('Host and port of the Temporal frontend the worker connects to'),
    SUPABASE_SERVICE_ROLE_KEY: secret(z.string().min(1)).describe(
      'Supabase service role key used for privileged server-side access',
    ),
    MAILER_PROVIDER: z
      .enum(['nodemailer', 'resend'])
      .default('nodemailer')
      .describe('Which mailer backend outbound email activities use'),
    EMAIL_HOST: z
      .string()
      .optional()
      .describe('SMTP host the nodemailer mailer connects to'),
    EMAIL_PORT: z.coerce
      .number()
      .int()
      .min(1)
      .max(65535)
      .optional()
      .describe('SMTP port the nodemailer mailer connects to'),
    EMAIL_USER: z
      .string()
      .optional()
      .describe('SMTP username the nodemailer mailer authenticates with'),
    EMAIL_PASSWORD: secret(z.string())
      .optional()
      .describe('SMTP password the nodemailer mailer authenticates with'),
    EMAIL_TLS: z
      .stringbool()
      .default(true)
      .describe('Whether the nodemailer mailer connects over TLS'),
    RESEND_API_KEY: secret(z.string())
      .optional()
      .describe('Resend API key the resend mailer sends email with'),
    TRIAL_DRIP_FROM_EMAIL: z
      .string()
      .optional()
      .describe('From address the trial drip email activity sends with'),
    NOVU_API_KEY: secret(z.string())
      .optional()
      .describe('Novu API key used to trigger notification workflows'),
    NOVU_API_URL: url()
      .optional()
      .describe('Base URL of the Novu API the worker sends notifications to'),
    DOCLING_URL: url()
      .optional()
      .describe('Base URL of the Docling service used to extract document text'),
    DOCLING_API_KEY: secret(z.string())
      .optional()
      .describe('Docling API key used to authenticate extraction requests'),
  },
  runtimeEnv: process.env,
  exitOnError: true,
  skipValidation: process.env.SKIP_ENV_VALIDATION === '1',
});
