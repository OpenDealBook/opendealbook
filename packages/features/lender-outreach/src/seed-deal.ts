import { seedRoom } from '@odb/lender-rooms/asks/integration-harness.ts';

import { admin } from './test-support';

export async function seedDeal(accountId: string, firmName: string) {
  const { data: firm } = await admin
    .from('firm')
    .insert({ account_id: accountId, name: firmName })
    .select('id')
    .single()
    .throwOnError();

  const dealId = crypto.randomUUID();
  await appendEvent(dealId, dealId, 'deal', 'deal.created', {
    account_id: accountId,
    firm_id: firm.id,
    description: `${firmName} summary`,
  });

  return dealId;
}

export async function appendEvent(
  dealId: string,
  aggregateId: string,
  aggregateType: string,
  eventType: string,
  payload: Record<string, unknown>,
) {
  await admin
    .rpc('append_deal_event', {
      p_deal_id: dealId,
      p_aggregate_type: aggregateType,
      p_aggregate_id: aggregateId,
      p_event_type: eventType,
      p_payload: payload as never,
      p_actor_kind: 'service',
      p_actor_via: 'integration-test',
    })
    .throwOnError();
}

export async function seedLender(
  accountId: string,
  domain: string,
  name: string,
  contacts: Array<{ name: string; email: string; isPrimary: boolean }>,
) {
  const { data: lender } = await admin
    .from('lender')
    .insert({ account_id: accountId, name, website: `https://${domain}`, domain })
    .select('id')
    .single()
    .throwOnError();

  await admin
    .from('lender_contact')
    .insert(
      contacts.map((contact) => ({
        account_id: accountId,
        lender_id: lender.id,
        name: contact.name,
        email: contact.email,
        is_primary: contact.isPrimary,
      })),
    )
    .throwOnError();
}

export async function seedRoomFor(
  deal: { accountId: string; dealId: string },
  name: string,
  brandDomain: string,
) {
  const { roomId } = await seedRoom(deal, name, []);

  await admin
    .from('lender_brand')
    .upsert({ domain: brandDomain, name })
    .throwOnError();
  const { data: lender } = await admin
    .from('lender')
    .select('id')
    .eq('account_id', deal.accountId)
    .eq('domain', brandDomain)
    .maybeSingle()
    .throwOnError();
  await admin
    .from('lender_room')
    .update({ brand_domain: brandDomain, lender_id: lender?.id ?? null })
    .eq('id', roomId)
    .throwOnError();

  return roomId;
}
