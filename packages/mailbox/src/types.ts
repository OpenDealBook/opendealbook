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
  inThread?: string;
}

export interface SendResult {
  providerMessageId: string;
  threadId: string;
}

export interface ThreadMessage {
  providerMessageId: string;
  receivedAt: string;
  fromAddress: string;
}

export class MailboxAccessDenied extends Error {}
