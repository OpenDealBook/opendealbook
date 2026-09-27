export { MailerSchema, type MailerConfig } from './config';
export type { Mailer, MailerSendResult } from './mailer';
export {
  MAILER_PROVIDERS,
  getMailerProvider,
  type MailerProvider,
} from './provider';
export { getMailer } from './factory';
