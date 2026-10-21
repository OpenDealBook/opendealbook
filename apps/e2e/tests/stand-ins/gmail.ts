import { notFound, type Handler } from './http';

export interface SentGmail {
  id: string;
  threadId: string;
  sentAt: string;
  mime: string;
}

const SEND_PATH = '/gmail/v1/users/me/messages/send';
const THREADS_PATH = '/gmail/v1/users/me/threads/';

function header(mime: string, name: string) {
  return mime.match(new RegExp(`^${name}: (.*)$`, 'mi'))![1]!.trim();
}

export function gmailStandIn(): Handler {
  const sent: SentGmail[] = [];

  return (request) => {
    if (request.method === 'POST' && request.path === SEND_PATH) {
      const { raw, threadId } = JSON.parse(request.body) as {
        raw: string;
        threadId?: string;
      };
      const id = `gmail-e2e-${sent.length + 1}`;
      const message: SentGmail = {
        id,
        threadId: threadId ?? `thread-${id}`,
        sentAt: new Date().toISOString(),
        mime: Buffer.from(raw, 'base64url').toString('utf8'),
      };
      sent.push(message);
      return { status: 200, json: { id, threadId: message.threadId } };
    }

    if (request.method === 'GET' && request.path.startsWith(THREADS_PATH)) {
      const threadId = decodeURIComponent(
        request.path.slice(THREADS_PATH.length),
      );
      const messages = sent.filter((message) => message.threadId === threadId);

      if (messages.length === 0) {
        return notFound(request, `no stand-in thread ${threadId}`);
      }

      return {
        status: 200,
        json: {
          id: threadId,
          messages: messages.map((message) => ({
            id: message.id,
            threadId,
            internalDate: String(Date.parse(message.sentAt)),
            payload: {
              headers: [
                { name: 'From', value: header(message.mime, 'From') },
                { name: 'Message-ID', value: `<${message.id}@stand-in.gmail>` },
              ],
            },
          })),
        },
      };
    }

    if (request.method === 'GET' && request.path === '/__e2e/sent') {
      return { status: 200, json: sent };
    }

    return notFound(request);
  };
}
