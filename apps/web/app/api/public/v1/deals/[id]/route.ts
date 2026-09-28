import { getDeal } from '@odb/api/queries';

import { resolveAccount } from '../../_shared';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { accountId, response } = await resolveAccount(request);

  if (!accountId) {
    return response!;
  }

  const { id } = await params;
  const deal = await getDeal(accountId, id);

  if (!deal) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  return Response.json(deal);
}
