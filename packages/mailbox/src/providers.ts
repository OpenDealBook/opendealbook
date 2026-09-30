import { randomUUID } from 'node:crypto';

import { buildMimeMessage, encodeBase64Url } from './mime';
import type { MailboxConnection, OutboundEmail, SendResult } from './types';

const GMAIL_SEND_URL =
  'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const GRAPH_SEND_MAIL_URL = 'https://graph.microsoft.com/v1.0/me/sendMail';

export async function sendViaGmail(
  accessToken: string,
  connection: MailboxConnection,
  email: OutboundEmail,
): Promise<SendResult> {
  const raw = encodeBase64Url(buildMimeMessage(connection, email));

  const response = await fetch(GMAIL_SEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });

  const { id } = (await response.json()) as { id: string };
  return { providerMessageId: id };
}

export async function sendViaMicrosoft(
  accessToken: string,
  email: OutboundEmail,
): Promise<SendResult> {
  const message = {
    subject: email.subject,
    body: {
      contentType: email.html !== undefined ? 'HTML' : 'Text',
      content: email.html ?? email.text,
    },
    toRecipients: [{ emailAddress: { address: email.to } }],
    ...(email.replyTo
      ? { replyTo: [{ emailAddress: { address: email.replyTo } }] }
      : {}),
  };

  await fetch(GRAPH_SEND_MAIL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message }),
  });

  return { providerMessageId: randomUUID() };
}
