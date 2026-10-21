import { Client, NovuRequestHandler } from '@novu/framework';

import {
  buildCounselWorkflows,
  type CounselWorkflowDeps,
} from '../counsel-workflows/workflows';
import { buildDealEventWorkflows } from '../deal-event-workflows/workflows';
import {
  buildDealUpdateWorkflows,
  type DealUpdateWorkflowDeps,
} from '../deal-update-workflows/workflows';
import { buildSellerCounselWorkflows } from '../seller-counsel-workflows/workflows';
import {
  buildSellerWorkflows,
  type SellerWorkflowDeps,
} from '../seller-workflows/workflows';
import { buildTodoWorkflows } from '../todo-workflows/workflows';
import { buildLenderWorkflows, type LenderWorkflowDeps } from './workflows';

export type { SellerDigestItem } from '../seller-workflows/workflows';

export function createLenderBridge(
  deps: LenderWorkflowDeps &
    SellerWorkflowDeps &
    CounselWorkflowDeps &
    DealUpdateWorkflowDeps & { secretKey: string | undefined },
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
    workflows: [
      ...buildLenderWorkflows(deps),
      ...buildSellerWorkflows(deps),
      ...buildCounselWorkflows(deps),
      ...buildDealUpdateWorkflows(deps),
      ...buildDealEventWorkflows(deps),
      ...buildTodoWorkflows(deps),
      ...buildSellerCounselWorkflows(deps),
    ],
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
