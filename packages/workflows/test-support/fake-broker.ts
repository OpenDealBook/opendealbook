import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';

interface Received {
  route: string;
  query: Record<string, string>;
  headers: IncomingHttpHeaders;
  body: unknown;
}

export async function fakeBroker() {
  const received: Received[] = [];
  const routes = new Map<string, { status: number; body: unknown; delayMs?: number }>();
  const server = createServer((request, response) => {
    let text = '';
    request.on('data', (chunk) => (text += chunk));
    request.on('end', () => {
      const url = new URL(request.url!, 'http://fake');
      const route = `${request.method} ${url.pathname}`;
      received.push({
        route,
        query: Object.fromEntries(url.searchParams),
        headers: request.headers,
        body: text ? JSON.parse(text) : undefined,
      });
      const reply = routes.get(`${route}${url.search}`) ??
        routes.get(route) ?? { status: 404, body: { error: 'no route' } };
      setTimeout(() => {
        response.writeHead(reply.status, { 'content-type': 'application/json' });
        response.end(typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body));
      }, reply.delayMs ?? 0);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    received,
    routes,
    reset: () => {
      received.length = 0;
      routes.clear();
    },
    close: () => server.close(),
  };
}
