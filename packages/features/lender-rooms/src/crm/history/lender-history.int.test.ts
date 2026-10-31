import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  type Person,
  admin,
  provisionPerson,
  removeEverythingSeeded,
  seedRoom,
  seedTeamDeal,
} from '../../asks/integration-harness';
import { listLenderHistory } from './lender-history';

const domain = `history-${crypto.randomUUID().slice(0, 8)}.test`;
const otherDomain = `other-${domain}`;

let owner: Person;
let otherTeamOwner: Person;
let lenderId: string;
let olderRoom: string;
let newerRoom: string;
let otherTeamRoom: string;
let otherDomainRoom: string;

async function dealOn(accountId: string) {
  const dealId = crypto.randomUUID();
  const { data: firm } = await admin
    .from('firm')
    .insert({ account_id: accountId, name: 'History deal' })
    .select('id')
    .single()
    .throwOnError();
  await admin
    .rpc('append_deal_event', {
      p_deal_id: dealId,
      p_aggregate_type: 'deal',
      p_aggregate_id: dealId,
      p_event_type: 'deal.created',
      p_payload: {
        firm_id: firm.id,
        account_id: accountId,
        description: 'History deal',
      },
      p_actor_kind: 'service',
      p_actor_via: 'integration-test',
    })
    .throwOnError();

  return { accountId, dealId };
}

async function roomOn(
  deal: { accountId: string; dealId: string },
  brandDomain: string,
  name: string,
) {
  const { roomId } = await seedRoom(deal, name, []);
  await admin
    .from('lender_room')
    .update({ brand_domain: brandDomain })
    .eq('id', roomId)
    .throwOnError();

  return roomId;
}

beforeAll(async () => {
  owner = await provisionPerson();
  otherTeamOwner = await provisionPerson();
  const colleague = await provisionPerson();

  await admin
    .from('lender_brand')
    .insert([
      { domain, name: 'History Bank' },
      { domain: otherDomain, name: 'Other Bank' },
    ])
    .throwOnError();

  const firstDeal = await seedTeamDeal(owner, colleague);
  const secondDeal = await dealOn(firstDeal.accountId);
  const otherTeamDeal = await seedTeamDeal(otherTeamOwner, colleague);

  olderRoom = await roomOn(firstDeal, domain, 'Older room');
  newerRoom = await roomOn(secondDeal, domain, 'Newer room');
  otherDomainRoom = await roomOn(firstDeal, otherDomain, 'Other domain room');
  otherTeamRoom = await roomOn(otherTeamDeal, domain, 'Other team room');

  const { data: lender } = await admin
    .from('lender')
    .insert({
      account_id: firstDeal.accountId,
      name: 'History Bank',
      website: `https://${domain}`,
      domain,
    })
    .select('id')
    .single()
    .throwOnError();
  lenderId = lender.id;

  await admin
    .from('lender_ask')
    .insert(
      ['One', 'Two'].map((title) => ({
        room_id: newerRoom,
        account_id: firstDeal.accountId,
        kind: 'ask' as const,
        title,
      })),
    )
    .throwOnError();
});

afterAll(async () => {
  await admin.from('lender').delete().eq('id', lenderId).throwOnError();
  await removeEverythingSeeded();
  await admin
    .from('lender_brand')
    .delete()
    .in('domain', [domain, otherDomain])
    .throwOnError();
});

describe('listLenderHistory (integration)', () => {
  it('lists the rooms linked to the lender when it was saved, newest first, with ask counts', async () => {
    const history = await listLenderHistory(owner.client, lenderId);

    expect(history.map((row) => [row.room_id, row.asks_count])).toEqual([
      [newerRoom, 2],
      [olderRoom, 0],
    ]);
  });

  it('leaves out other teams and other domains', async () => {
    const history = await listLenderHistory(owner.client, lenderId);
    const roomIds = history.map((row) => row.room_id);

    expect(roomIds).not.toContain(otherTeamRoom);
    expect(roomIds).not.toContain(otherDomainRoom);
  });

  it("returns nothing to a caller outside the lender's team", async () => {
    const history = await listLenderHistory(otherTeamOwner.client, lenderId);

    expect(history).toEqual([]);
  });
});
