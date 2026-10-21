import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { appendDealEvent } from '@odb/events';

import {
  type IntegrationAccount,
  provisionAccount,
} from '../../test-support/integration-harness';
import { listDealsFaceted } from './list-deals-faceted';

let account: IntegrationAccount;

async function seedDeal(name: string) {
  const firmId = crypto.randomUUID();
  const dealId = crypto.randomUUID();

  await account.admin
    .from('firm')
    .insert({ id: firmId, account_id: account.accountId, name })
    .throwOnError();

  await appendDealEvent(account.user, {
    dealId,
    aggregateType: 'deal',
    aggregateId: dealId,
    eventType: 'deal.created',
    payload: {
      account_id: account.accountId,
      firm_id: firmId,
      owner_user_id: account.userId,
      description: `${name} deal`,
      source: 'manual',
      stage: 'nda_signed',
    },
  });

  return dealId;
}

beforeAll(async () => {
  account = await provisionAccount();

  const dealId = await seedDeal('Brennan Climate Services of Greater Tampa Bay');
  await seedDeal('[Example] Coastal HVAC Services');

  await appendDealEvent(account.user, {
    dealId,
    aggregateType: 'deal_milestone',
    aggregateId: crypto.randomUUID(),
    eventType: 'deal_milestone.set',
    payload: { kind: 'closing', target_on: '2099-01-15', actual_on: null, shared: true },
  });
  await appendDealEvent(account.user, {
    dealId,
    aggregateType: 'checklist_item',
    aggregateId: crypto.randomUUID(),
    eventType: 'checklist_item.added',
    payload: { title: 'Tax returns', due_at: '2000-01-01T00:00:00Z' },
  });
  await appendDealEvent(account.user, {
    dealId,
    aggregateType: 'checklist_item',
    aggregateId: crypto.randomUUID(),
    eventType: 'checklist_item.added',
    payload: { title: 'Lease' },
  });
});

afterAll(async () => {
  await account.admin.from('accounts').delete().eq('id', account.accountId);
  await account.cleanup();
});

describe('listDealsFaceted', () => {
  it('returns card facts for real deals and keeps examples apart', async () => {
    const real = await listDealsFaceted(account.user, { accountId: account.accountId });
    const examples = await listDealsFaceted(account.user, {
      accountId: account.accountId,
      filters: { examples: true },
    });

    const { data: latest } = await account.admin
      .from('deal_event')
      .select('created_at')
      .eq('deal_id', real.items[0]!.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
      .throwOnError();

    expect(real.items).toHaveLength(1);
    expect(real.items[0]).toMatchObject({
      title: 'Brennan Climate Services of Greater Tampa Bay',
      isExample: false,
      nextMilestone: { kind: 'closing', label: null, targetOn: '2099-01-15' },
      openItems: 2,
      overdueItems: 1,
      lastActivityAt: latest.created_at,
    });
    expect(real.facetCounts.examples).toBe(1);
    expect(examples.items.map((item) => item.title)).toEqual([
      '[Example] Coastal HVAC Services',
    ]);
  });
});
