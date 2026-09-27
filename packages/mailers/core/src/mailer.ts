import type { MailerConfig } from './config';

export interface MailerSendResult {
  messageId?: string;
}

export interface Mailer {
  sendEmail(config: MailerConfig): Promise<MailerSendResult>;
}
