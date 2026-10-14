import { Client, NovuRequestHandler } from '@novu/framework';

import { buildLenderWorkflows, type LenderWorkflowDeps } from './workflows';

export function createLenderBridge(
  deps: LenderWorkflowDeps & { secretKey: string | undefined },
): (request: Request) => Promise<Response> {
  if (!deps.secretKey) {
    return async () => new Response('Unauthorized', { status: 401 });
  }

  return new NovuRequestHandler({
    frameworkName: 'next',
    client: new Client({
      secretKey: deps.secretKey,
      strictAuthentication: true,
    }),
    workflows: buildLenderWorkflows(deps),
    handler: (request: Request) => ({
      body: () => request.json(),
      headers: (name) => request.headers.get(name),
      method: () => request.method,
      url: () => new URL(request.url),
      transformResponse: ({ body, status, headers }) =>
        new Response(body, { status, headers }),
    }),
  }).createHandler();
}
