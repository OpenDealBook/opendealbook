import * as z from 'zod';

export const MAILER_PROVIDERS = ['nodemailer', 'resend'] as const;

export type MailerProvider = (typeof MAILER_PROVIDERS)[number];

const MailerProviderSchema = z.enum(MAILER_PROVIDERS).default('nodemailer');

export function getMailerProvider(): MailerProvider {
  return MailerProviderSchema.parse(process.env.MAILER_PROVIDER);
}
