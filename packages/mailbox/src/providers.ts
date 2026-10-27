import { buildMimeMessage, encodeBase64Url } from './mime';
import {
  MailboxAccessDenied,
  MailboxNoResponse,
  MailboxRequestFailed,
  type MailboxConnection,
  type OutboundEmail,
  type SendResult,
  type ThreadMessage,
} from './types';

function gmailUrl(path: string) {
  return `${process.env.GMAIL_API_BASE ?? 'https://gmail.googleapis.com'}/gmail/v1/users/me${path}`;
}
const GRAPH_MESSAGES_URL = 'https://graph.microsoft.com/v1.0/me/messages';

async function send(action: string, url: string, init: RequestInit): Promise<Response> {
  const response = await fetch(url, init).catch((error: unknown) => {
    throw new MailboxNoResponse(action, error);
  });
  assertOk(response, action);
  return response;
}

function assertOk(response: Response, action: string): void {
  if (!response.ok) {
    throw new MailboxRequestFailed(response.status, action);
  }
}

export async function sendViaGmail(
  accessToken: string,
  connection: MailboxConnection,
  email: OutboundEmail,
): Promise<SendResult> {
  const threadHeaders =
    email.inThread === undefined
      ? []
      : await gmailReplyHeaders(accessToken, email.inThread);
  const raw = encodeBase64Url(
    buildMimeMessage(connection, email, threadHeaders),
  );

  const response = await send('Gmail send', gmailUrl('/messages/send'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw, threadId: email.inThread }),
  });

  const { id, threadId } = (await response.json()) as {
    id: string;
    threadId: string;
  };
  return { providerMessageId: id, threadId };
}

async function gmailReplyHeaders(accessToken: string, threadId: string) {
  const url = new URL(gmailUrl(`/threads/${encodeURIComponent(threadId)}`));
  url.searchParams.set('format', 'metadata');
  url.searchParams.set('metadataHeaders', 'Message-ID');

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const { messages } = (await response.json()) as {
    messages: { payload: { headers: { name: string; value: string }[] } }[];
  };
  const messageIds = messages.map(
    (message) =>
      message.payload.headers.find(
        ({ name }) => name.toLowerCase() === 'message-id',
      )!.value,
  );

  return [
    `In-Reply-To: ${messageIds.at(-1)}`,
    `References: ${messageIds.join(' ')}`,
  ];
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

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  const draft =
    email.inThread === undefined
      ? await fetch(GRAPH_MESSAGES_URL, {
          method: 'POST',
          headers,
          body: JSON.stringify(message),
        })
      : await fetch(
          `${GRAPH_MESSAGES_URL}/${await latestInConversation(accessToken, email.inThread)}/createReply`,
          { method: 'POST', headers, body: JSON.stringify({ message }) },
        );
  assertOk(draft, 'Microsoft draft');
  const { id, conversationId } = (await draft.json()) as {
    id: string;
    conversationId: string;
  };

  await send('Microsoft send', `${GRAPH_MESSAGES_URL}/${id}/send`, { method: 'POST', headers });

  return { providerMessageId: id, threadId: conversationId };
}

async function latestInConversation(
  accessToken: string,
  conversationId: string,
) {
  const messages = await listMicrosoftConversationMessages(
    accessToken,
    conversationId,
  );

  return messages.reduce((latest, message) =>
    message.receivedAt > latest.receivedAt ? message : latest,
  ).providerMessageId;
}

function assertReadable(response: Response): void {
  if (response.status === 401 || response.status === 403) {
    throw new MailboxAccessDenied(`mailbox read denied: ${response.status}`);
  }
}

export async function listGmailThreadMessages(
  accessToken: string,
  threadId: string,
): Promise<ThreadMessage[]> {
  const url = new URL(gmailUrl(`/threads/${encodeURIComponent(threadId)}`));
  url.searchParams.set('format', 'metadata');
  url.searchParams.set('metadataHeaders', 'From');

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  assertReadable(response);
  assertOk(response, 'Thread read');

  const { messages } = (await response.json()) as {
    messages: {
      id: string;
      internalDate: string;
      payload: { headers: { name: string; value: string }[] };
    }[];
  };

  return messages.map((message) => {
    const from = message.payload.headers.find(({ name }) => name === 'From')!;
    return {
      providerMessageId: message.id,
      receivedAt: new Date(Number(message.internalDate)).toISOString(),
      fromAddress: from.value.match(/<([^>]+)>/)?.[1] ?? from.value,
    };
  });
}

export async function listMicrosoftConversationMessages(
  accessToken: string,
  conversationId: string,
): Promise<ThreadMessage[]> {
  const url = new URL(GRAPH_MESSAGES_URL);
  url.searchParams.set('$filter', `conversationId eq '${conversationId}'`);
  url.searchParams.set('$select', 'id,receivedDateTime,from');

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  assertReadable(response);
  assertOk(response, 'Thread read');

  const { value } = (await response.json()) as {
    value: {
      id: string;
      receivedDateTime: string;
      from: { emailAddress: { address: string } };
    }[];
  };

  return value.map((message) => ({
    providerMessageId: message.id,
    receivedAt: new Date(message.receivedDateTime).toISOString(),
    fromAddress: message.from.emailAddress.address,
  }));
}
