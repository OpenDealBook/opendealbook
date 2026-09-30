import type { MailboxConnection, OutboundEmail } from './types';

const BOUNDARY = 'odb-mailbox-alternative';

export function buildMimeMessage(
  connection: MailboxConnection,
  email: OutboundEmail,
): string {
  const headers = [
    `From: ${connection.emailAddress}`,
    `To: ${email.to}`,
    `Subject: ${email.subject}`,
    'MIME-Version: 1.0',
  ];
  if (email.replyTo) {
    headers.push(`Reply-To: ${email.replyTo}`);
  }

  if (email.text !== undefined && email.html !== undefined) {
    headers.push(`Content-Type: multipart/alternative; boundary="${BOUNDARY}"`);
    const parts = [
      `--${BOUNDARY}`,
      'Content-Type: text/plain; charset="UTF-8"',
      '',
      email.text,
      `--${BOUNDARY}`,
      'Content-Type: text/html; charset="UTF-8"',
      '',
      email.html,
      `--${BOUNDARY}--`,
    ];
    return `${headers.join('\r\n')}\r\n\r\n${parts.join('\r\n')}`;
  }

  const isHtml = email.html !== undefined;
  headers.push(`Content-Type: text/${isHtml ? 'html' : 'plain'}; charset="UTF-8"`);
  return `${headers.join('\r\n')}\r\n\r\n${isHtml ? email.html : email.text}`;
}

export function encodeBase64Url(raw: string): string {
  return Buffer.from(raw, 'utf-8').toString('base64url');
}
