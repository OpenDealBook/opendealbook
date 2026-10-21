import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  appendDealEvent,
  provisionAccount,
  seedDeal,
  type IntegrationAccount,
} from '../../test-support/integration-harness';
import { anonymizeClose } from '../comps/anonymizeClose';
import { detectDuplicates } from '../comps/detectDuplicates';
import { recordDealActivity } from '../comps/recordDealActivity';

let account: IntegrationAccount;
const pseudonyms: { table: 'comp_pool' | 'activity_pool'; pseudonym: string }[] = [];

beforeAll(async () => {
  account = await provisionAccount();
});

afterAll(async () => {
  for (const row of pseudonyms) {
    await account.admin.from(row.table).delete().eq('pseudonym', row.pseudonym);
  }
  await account.cleanup();
});

describe('comp relay consumers replayed for the same event', () => {
  it('recordDealActivity leaves one activity_pool row for the deal', async () => {
    const dealId = await seedDeal(account.admin, account.accountId, account.userId, {
      description: 'Replay activity deal',
      stage: 'integration',
      asking_price: 700_000,
    });

    await recordDealActivity({ dealId, dealSeq: 1 });
    await recordDealActivity({ dealId, dealSeq: 1 });

    const { data: keys } = await account.admin
      .from('activity_pool_key')
      .select('pseudonym')
      .eq('deal_id', dealId);
    expect(keys).toHaveLength(1);
    pseudonyms.push({ table: 'activity_pool', pseudonym: keys![0]!.pseudonym });

    const { data: rows } = await account.admin
      .from('activity_pool')
      .select('asking_price_banded')
      .eq('pseudonym', keys![0]!.pseudonym);
    expect(rows).toEqual([{ asking_price_banded: 700_000 }]);
  });

  it('anonymizeClose leaves one comp_pool row for the deal', async () => {
    await account.admin
      .from('comp_pool_optin')
      .insert({ account_id: account.accountId, opted_in: true });
    const dealId = await seedDeal(account.admin, account.accountId, account.userId, {
      description: 'Replay close deal',
      stage: 'integration',
      asking_price: 1_200_000,
      revenue_ttm: 800_000,
      sde_ttm: 300_000,
    });
    await appendDealEvent(account.admin, {
      dealId,
      aggregateType: 'deal_milestone',
      aggregateId: crypto.randomUUID(),
      eventType: 'deal_milestone.set',
      payload: { kind: 'closing', target_on: null, actual_on: new Date().toISOString().slice(0, 10) },
    });

    await anonymizeClose({ dealId, dealSeq: 1 });
    await anonymizeClose({ dealId, dealSeq: 1 });

    const { data: keys } = await account.admin
      .from('comp_pool_key')
      .select('pseudonym')
      .eq('deal_id', dealId);
    expect(keys).toHaveLength(1);
    pseudonyms.push({ table: 'comp_pool', pseudonym: keys![0]!.pseudonym });

    const { data: rows } = await account.admin
      .from('comp_pool')
      .select('sale_price_banded')
      .eq('pseudonym', keys![0]!.pseudonym);
    expect(rows).toEqual([{ sale_price_banded: 1_200_000 }]);
  });

  it('detectDuplicates flags a copied listing once', async () => {
    const sourceUrl = `https://example.com/listing/${crypto.randomUUID()}`;
    await seedDeal(account.admin, account.accountId, account.userId, {
      description: 'Replay original',
      source_url: sourceUrl,
    });
    const copy = await seedDeal(account.admin, account.accountId, account.userId, {
      description: 'Replay copy',
      source_url: sourceUrl,
    });

    await detectDuplicates({ dealId: copy });
    await detectDuplicates({ dealId: copy });

    const { data: flags } = await account.admin
      .from('deal_event')
      .select('global_seq')
      .eq('deal_id', copy)
      .eq('event_type', 'deal.duplicate_flagged');
    expect(flags).toHaveLength(1);
  });

  it('detectDuplicates does not re-flag a listing the user cleared', async () => {
    const sourceUrl = `https://example.com/listing/${crypto.randomUUID()}`;
    await seedDeal(account.admin, account.accountId, account.userId, {
      description: 'Cleared original',
      source_url: sourceUrl,
    });
    const copy = await seedDeal(account.admin, account.accountId, account.userId, {
      description: 'Cleared copy',
      source_url: sourceUrl,
    });
    await detectDuplicates({ dealId: copy });
    await appendDealEvent(account.admin, {
      dealId: copy,
      aggregateType: 'deal',
      aggregateId: copy,
      eventType: 'deal.duplicate_cleared',
      payload: {},
    });

    await detectDuplicates({ dealId: copy });

    const { data: deal } = await account.admin
      .from('deal')
      .select('duplicate_of')
      .eq('id', copy)
      .single();
    expect(deal).toEqual({ duplicate_of: null });
  });

  it('detectDuplicates keeps a dismissed description candidate dismissed', async () => {
    const description = `Replay bookkeeping ${crypto.randomUUID()}`;
    await seedDeal(account.admin, account.accountId, account.userId, { description });
    const second = await seedDeal(account.admin, account.accountId, account.userId, {
      description,
    });
    await detectDuplicates({ dealId: second });
    await account.admin
      .from('duplicate_candidate')
      .update({ status: 'dismissed' })
      .eq('deal_id', second);

    await detectDuplicates({ dealId: second });

    const { data: candidates } = await account.admin
      .from('duplicate_candidate')
      .select('status')
      .eq('deal_id', second);
    expect(candidates).toEqual([{ status: 'dismissed' }]);
  });
});
