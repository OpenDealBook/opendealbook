import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';

export interface StandInRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: IncomingHttpHeaders;
  body: string;
}

export type StandInResponse =
  | { status: number; json: unknown }
  | { status: number; html: string };

export type Handler = (
  request: StandInRequest,
) => StandInResponse | Promise<StandInResponse>;

export function notFound(
  request: StandInRequest,
  message?: string,
): StandInResponse {
  return {
    status: 404,
    json: {
      error: {
        message:
          message ?? `no stand-in route for ${request.method} ${request.path}`,
      },
    },
  };
}

export function serve(url: string, handler: Handler): Promise<Server> {
  const server = createServer(async (incoming, outgoing) => {
    const chunks: Buffer[] = [];
    for await (const chunk of incoming) {
      chunks.push(chunk);
    }
    const parsed = new URL(incoming.url!, url);
    const response = await handler({
      method: incoming.method!,
      path: parsed.pathname,
      query: parsed.searchParams,
      headers: incoming.headers,
      body: Buffer.concat(chunks).toString('utf8'),
    });

    if ('html' in response) {
      outgoing.writeHead(response.status, { 'content-type': 'text/html' });
      outgoing.end(response.html);
    } else {
      outgoing.writeHead(response.status, {
        'content-type': 'application/json',
      });
      outgoing.end(JSON.stringify(response.json));
    }
  });

  return new Promise((resolve) => {
    server.listen(Number(new URL(url).port), () => resolve(server));
  });
}
