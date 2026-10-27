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
  headers?: Record<string, string>;
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

export class MailboxNoResponse extends Error {
  constructor(action: string, cause: unknown) {
    super(`${action} got no response`, { cause });
  }
}

export class MailboxRequestFailed extends Error {
  constructor(
    readonly status: number,
    action: string,
  ) {
    super(`${action} failed with status ${status}`);
  }
}
