import { resolveAccessToken } from './nango';
import { sendViaGmail, sendViaMicrosoft } from './providers';
import type { MailboxConnection, OutboundEmail, SendResult } from './types';

export type {
  MailboxProvider,
  MailboxConnection,
  OutboundEmail,
  SendResult,
} from './types';

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
