import { listFirms } from '@odb/api/queries';

import { parseListParams, resolveAccount } from '../_shared';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { accountId, response } = await resolveAccount(request);

  if (!accountId) {
    return response!;
  }

  const status = new URL(request.url).searchParams.get('status') ?? undefined;

  const page = await listFirms(accountId, {
    ...parseListParams(request),
    status,
  });

  return Response.json(page);
}
