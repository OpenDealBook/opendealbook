import { getDealBox } from '@odb/api/queries';

import { resolveAccount } from '../_shared';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { accountId, response } = await resolveAccount(request);

  if (!accountId) {
    return response!;
  }

  const dealBox = await getDealBox(accountId);

  if (!dealBox) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  return Response.json(dealBox);
}
