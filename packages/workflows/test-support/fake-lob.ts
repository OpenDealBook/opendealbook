import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface ReceivedLobCall {
  path: string;
  headers: IncomingHttpHeaders;
  body: Record<string, unknown>;
}

export type LobReply = { status: number; body: unknown };

export async function fakeLob() {
  const replies: { verification: LobReply; letter: LobReply } = {
    verification: deliverable(),
    letter: letterCreated('ltr_fake_1'),
  };
  const received: ReceivedLobCall[] = [];
  const server = createServer((request, response) => {
    let raw = '';
    request.on('data', (chunk) => (raw += chunk));
    request.on('end', () => {
      received.push({ path: request.url!, headers: request.headers, body: JSON.parse(raw) });
      const reply = request.url === '/v1/us_verifications' ? replies.verification : replies.letter;
      const html = typeof reply.body === 'string';
      response.writeHead(reply.status, { 'content-type': html ? 'text/html' : 'application/json' });
      response.end(typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    received,
    replies,
    lettersCreated: () => received.filter((call) => call.path === '/v1/letters'),
    close: () => server.close(),
  };
}

export function deliverable(): LobReply {
  return {
    status: 200,
    body: {
      deliverability: 'deliverable',
      primary_line: '100 MAIN ST STE 2',
      components: { city: 'AUSTIN', state: 'TX', zip_code: '78701' },
    },
  };
}

export function undeliverable(): LobReply {
  return {
    status: 200,
    body: {
      deliverability: 'undeliverable',
      primary_line: '1 NOWHERE RD',
      components: { city: 'AUSTIN', state: 'TX', zip_code: '78799' },
    },
  };
}

export function letterCreated(id: string): LobReply {
  return { status: 200, body: { id, object: 'letter' } };
}
