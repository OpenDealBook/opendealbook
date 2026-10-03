export {
  MailerSchema,
  type MailerConfig,
  type Mailer,
  type MailerSendResult,
} from '@odb/mailer-types';
export {
  MAILER_PROVIDERS,
  getMailerProvider,
  type MailerProvider,
} from './provider.ts';
export { getMailer } from './factory.ts';
