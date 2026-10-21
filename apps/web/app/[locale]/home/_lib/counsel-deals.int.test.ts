import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  admin,
  cleanUp,
  newDeal,
  provisionPerson,
  provisionTeam,
  type Person,
} from '@odb/seller-rooms/test-support/world.ts';

import { closedSellerCounselDeals } from './counsel-deals';

let owner: Person;
let counsel: Person;
let teamId: string;

async function counselOn(side: 'buyer' | 'seller', ended: boolean) {
  const dealId = await newDeal(teamId, owner);
  await admin
    .from('deal_counsel')
    .insert({
      account_id: teamId,
      deal_id: dealId,
      side,
      user_id: counsel.userId,
      email: counsel.email,
    })
    .throwOnError();

  if (ended) {
    await admin
      .rpc('append_deal_event', {
        p_deal_id: dealId,
        p_aggregate_type: 'deal',
        p_aggregate_id: dealId,
        p_event_type: 'deal.archived',
        p_actor_kind: 'service',
      })
      .throwOnError();
  }

  return dealId;
}

beforeAll(async () => {
  owner = await provisionPerson();
  counsel = await provisionPerson();
  teamId = await provisionTeam(owner, 'Harbor Holdings');
});

afterAll(async () => {
  await cleanUp([teamId]);
});

describe('closedSellerCounselDeals', () => {
  it("lists the ended deals the caller is seller's counsel on, readable until a year after they ended", async () => {
    const endedSellerDeal = await counselOn('seller', true);
    await counselOn('seller', false);
    await counselOn('buyer', true);

    const { data: ended } = await admin
      .from('deal')
      .select('archived_at')
      .eq('id', endedSellerDeal)
      .single()
      .throwOnError();
    const readUntil = new Date(ended.archived_at!);
    readUntil.setUTCFullYear(readUntil.getUTCFullYear() + 1);

    const closed = await closedSellerCounselDeals(
      counsel.client,
      counsel.userId,
    );

    expect(closed.map(({ dealId }) => dealId)).toEqual([endedSellerDeal]);
    expect(Date.parse(closed[0]!.readUntil)).toBe(readUntil.getTime());
  });
});
