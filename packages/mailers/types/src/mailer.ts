import type { MailerConfig } from './config.ts';

export interface MailerSendResult {
  messageId?: string;
}

export interface Mailer {
  sendEmail(config: MailerConfig): Promise<MailerSendResult>;
}
