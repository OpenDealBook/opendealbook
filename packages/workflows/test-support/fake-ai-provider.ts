import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface ReceivedAiCall {
  path: string;
  headers: IncomingHttpHeaders;
  body: { model: string; messages: { role: string; content: string }[] };
}

export async function fakeAiProvider(reply: {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
  delayMs?: number;
}) {
  const received: ReceivedAiCall[] = [];
  const server = createServer((request, response) => {
    let raw = '';
    request.on('data', (chunk) => (raw += chunk));
    request.on('end', () => {
      received.push({ path: request.url!, headers: request.headers, body: JSON.parse(raw) });
      setTimeout(() => {
        response.writeHead(reply.status, { 'content-type': 'application/json', ...reply.headers });
        response.end(JSON.stringify(reply.body));
      }, reply.delayMs ?? 0);
    });
  });
  const connections = { count: 0 };
  server.on('connection', () => (connections.count += 1));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    received,
    connections,
    reply,
    close: () => server.close(),
  };
}

export function openAiReply(content: string) {
  return {
    status: 200,
    body: {
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 12, completion_tokens: 5 },
    },
  };
}
