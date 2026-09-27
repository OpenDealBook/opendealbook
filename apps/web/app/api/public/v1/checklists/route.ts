import { listChecklistItems } from '@tuckin/api/queries';

import { parseListParams, resolveAccount } from '../_shared';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { accountId, response } = await resolveAccount(request);

  if (!accountId) {
    return response!;
  }

  const dealId = new URL(request.url).searchParams.get('deal_id');

  if (!dealId) {
    return Response.json(
      { error: 'deal_id query parameter is required' },
      { status: 400 },
    );
  }

  const page = await listChecklistItems(
    accountId,
    dealId,
    parseListParams(request),
  );

  return Response.json(page);
}
