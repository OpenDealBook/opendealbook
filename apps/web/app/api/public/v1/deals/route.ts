import { listDeals } from '@odb/api/queries';

import { parseListParams, resolveAccount } from '../_shared';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { accountId, response } = await resolveAccount(request);

  if (!accountId) {
    return response!;
  }

  const params = new URL(request.url).searchParams;

  const page = await listDeals(accountId, {
    ...parseListParams(request),
    stage: params.get('stage') ?? undefined,
    source: params.get('source') ?? undefined,
  });

  return Response.json(page);
}
