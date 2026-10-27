import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';

interface ReceivedSearch {
  path: string;
  query: Record<string, string>;
  headers: IncomingHttpHeaders;
  at: number;
}

export async function fakeCourtListener(
  reply: { status: number; body: unknown; delayMs?: number },
  now: () => number = Date.now,
) {
  const received: ReceivedSearch[] = [];
  const server = createServer((request, response) => {
    const url = new URL(request.url!, 'http://fake');
    received.push({
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      headers: request.headers,
      at: now(),
    });
    setTimeout(() => {
      if (typeof reply.body === 'string') {
        response.writeHead(reply.status, { 'content-type': 'text/html' });
        response.end(reply.body);
        return;
      }
      response.writeHead(reply.status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(reply.body));
    }, reply.delayMs ?? 0);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}/api/rest/v4`,
    received,
    reply,
    close: () => server.close(),
  };
}

export function docketHit(overrides: Record<string, unknown>) {
  return {
    caseName: 'Rowan Fixture Plumbing v. Harbour Supply',
    court: 'District Court, S.D. Texas',
    court_id: 'txsd',
    docketNumber: '4:21-cv-00412',
    docket_absolute_url: '/docket/61234567/rowan-fixture-plumbing-v-harbour-supply/',
    dateFiled: '2021-03-04',
    dateTerminated: null,
    suitNature: '190 Contract: Other',
    ...overrides,
  };
}

export function searchPage(results: unknown[]) {
  return { count: results.length, next: null, previous: null, results };
}
