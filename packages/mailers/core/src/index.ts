export { MailerSchema, type MailerConfig } from './config.ts';
export type { Mailer, MailerSendResult } from './mailer.ts';
export {
  MAILER_PROVIDERS,
  getMailerProvider,
  type MailerProvider,
} from './provider.ts';
export { getMailer } from './factory.ts';
