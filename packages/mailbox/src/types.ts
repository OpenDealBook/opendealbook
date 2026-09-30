export type MailboxProvider = 'gmail' | 'microsoft';

export interface MailboxConnection {
  provider: MailboxProvider;
  nangoConnectionId: string;
  providerConfigKey: string;
  emailAddress: string;
}

export interface OutboundEmail {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
}

export interface SendResult {
  providerMessageId: string;
}
