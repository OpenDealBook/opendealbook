import { resolveAccessToken } from './nango';
import {
  listGmailThreadMessages,
  listMicrosoftConversationMessages,
  sendViaGmail,
  sendViaMicrosoft,
} from './providers';
import type {
  MailboxConnection,
  OutboundEmail,
  SendResult,
  ThreadMessage,
} from './types';

export type {
  MailboxProvider,
  MailboxConnection,
  OutboundEmail,
  SendResult,
  ThreadMessage,
} from './types';
export { MailboxAccessDenied } from './types';

export async function sendAs(
  connection: MailboxConnection,
  email: OutboundEmail,
): Promise<SendResult> {
  const accessToken = await resolveAccessToken(connection);

  if (connection.provider === 'gmail') {
    return sendViaGmail(accessToken, connection, email);
  }

  return sendViaMicrosoft(accessToken, email);
}

export async function listThreadMessages(
  connection: MailboxConnection,
  threadId: string,
): Promise<ThreadMessage[]> {
  const accessToken = await resolveAccessToken(connection);

  if (connection.provider === 'gmail') {
    return listGmailThreadMessages(accessToken, threadId);
  }

  return listMicrosoftConversationMessages(accessToken, threadId);
}
