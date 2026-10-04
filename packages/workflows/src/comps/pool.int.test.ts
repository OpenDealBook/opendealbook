import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  appendDealEvent,
  provisionAccount,
  seedDeal,
  type IntegrationAccount,
} from '../../test-support/integration-harness';

import { anonymizeClose } from './anonymizeClose';
import { detectDuplicates } from './detectDuplicates';
import { recordDealActivity } from './recordDealActivity';

let account: IntegrationAccount;
const poolCleanup: { table: 'comp_pool' | 'activity_pool'; pseudonym: string }[] =
  [];
const regionCleanup: string[] = [];

const today = new Date().toISOString().slice(0, 10);

beforeAll(async () => {
  account = await provisionAccount();
});

afterAll(async () => {
  for (const row of poolCleanup) {
    await account.admin.from(row.table).delete().eq('pseudonym', row.pseudonym);
  }
  for (const region of regionCleanup) {
    await account.admin.from('comp_pool').delete().eq('region', region);
    await account.admin.from('activity_pool').delete().eq('region', region);
  }
  await account.cleanup();
});

describe('recordDealActivity (integration)', () => {
  it('projects a banded activity_pool row and a key linking the pseudonym to the deal', async () => {
    const dealId = await seedDeal(account.admin, account.accountId, account.userId, {
      description: 'Activity deal',
      source: 'manual',
      stage: 'integration',
      asking_price: 900_000,
    });
    await appendDealEvent(account.admin, {
      dealId,
      aggregateType: 'deal',
      aggregateId: dealId,
      eventType: 'deal.resolved',
      payload: { resolution: 'won', resolution_reason: 'completed' },
    });

    await recordDealActivity({ dealId, dealSeq: 1 });

    const { data: key } = await account.admin
      .from('activity_pool_key')
      .select('pseudonym, deal_id, account_id')
      .eq('deal_id', dealId)
      .single();

    expect(key?.account_id).toBe(account.accountId);
    poolCleanup.push({ table: 'activity_pool', pseudonym: key!.pseudonym });

    const { data: pool } = await account.admin
      .from('activity_pool')
      .select('asking_price_banded, confidence, furthest_stage, outcome')
      .eq('pseudonym', key!.pseudonym)
      .single();

    expect(pool).toMatchObject({
      asking_price_banded: 900_000,
      confidence: 'verified',
      furthest_stage: 'integration',
      outcome: 'won',
    });
  });
});

describe('anonymizeClose opt-in gating (integration)', () => {
  it('writes no comp_pool row when the account has not opted in, and a banded row once it has', async () => {
    const dealId = await seedDeal(account.admin, account.accountId, account.userId, {
      description: 'Opt-in deal',
      stage: 'integration',
      asking_price: 1_200_000,
      revenue_ttm: 800_000,
      sde_ttm: 300_000,
    });
    await appendDealEvent(account.admin, {
      dealId,
      aggregateType: 'deal',
      aggregateId: dealId,
      eventType: 'deal.updated',
      payload: { close_date: today },
    });

    await anonymizeClose({ dealId, dealSeq: 1 });

    const { data: noKey } = await account.admin
      .from('comp_pool_key')
      .select('id')
      .eq('deal_id', dealId);
    expect(noKey).toHaveLength(0);

    await account.admin
      .from('comp_pool_optin')
      .insert({ account_id: account.accountId, opted_in: true });

    await anonymizeClose({ dealId, dealSeq: 1 });

    const { data: key } = await account.admin
      .from('comp_pool_key')
      .select('pseudonym, account_id')
      .eq('deal_id', dealId)
      .single();
    expect(key?.account_id).toBe(account.accountId);
    poolCleanup.push({ table: 'comp_pool', pseudonym: key!.pseudonym });

    const { data: pool } = await account.admin
      .from('comp_pool')
      .select('sale_price_banded, revenue_banded, sde_banded, sde_multiple')
      .eq('pseudonym', key!.pseudonym)
      .single();

    expect(pool).toMatchObject({
      sale_price_banded: 1_200_000,
      revenue_banded: 800_000,
      sde_banded: 300_000,
    });
    expect(Number(pool!.sde_multiple)).toBeCloseTo(4, 5);
  });
});

describe('anonymizeClose 2-quarter hold (integration)', () => {
  it('holds a lost-to-other-buyer close until two quarters pass', async () => {
    const recent = await seedDeal(account.admin, account.accountId, account.userId, {
      description: 'Recent lost deal',
      stage: 'integration',
      asking_price: 1_000_000,
      revenue_ttm: 700_000,
      sde_ttm: 250_000,
    });
    await appendDealEvent(account.admin, {
      dealId: recent,
      aggregateType: 'deal',
      aggregateId: recent,
      eventType: 'deal.updated',
      payload: { close_date: today },
    });
    await appendDealEvent(account.admin, {
      dealId: recent,
      aggregateType: 'deal',
      aggregateId: recent,
      eventType: 'deal.stage_changed',
      payload: { stage: 'integration', outcome_reason: 'lost_to_other_buyer' },
    });

    await anonymizeClose({ dealId: recent, dealSeq: 1 });

    const { data: heldKey } = await account.admin
      .from('comp_pool_key')
      .select('id')
      .eq('deal_id', recent);
    expect(heldKey).toHaveLength(0);

    const aged = await seedDeal(account.admin, account.accountId, account.userId, {
      description: 'Aged lost deal',
      stage: 'integration',
      asking_price: 1_000_000,
      revenue_ttm: 700_000,
      sde_ttm: 250_000,
    });
    await appendDealEvent(account.admin, {
      dealId: aged,
      aggregateType: 'deal',
      aggregateId: aged,
      eventType: 'deal.updated',
      payload: { close_date: '2024-01-01' },
    });
    await appendDealEvent(account.admin, {
      dealId: aged,
      aggregateType: 'deal',
      aggregateId: aged,
      eventType: 'deal.stage_changed',
      payload: { stage: 'integration', outcome_reason: 'lost_to_other_buyer' },
    });

    await anonymizeClose({ dealId: aged, dealSeq: 1 });

    const { data: releasedKey } = await account.admin
      .from('comp_pool_key')
      .select('pseudonym')
      .eq('deal_id', aged)
      .single();
    expect(releasedKey?.pseudonym).toBeTruthy();
    poolCleanup.push({ table: 'comp_pool', pseudonym: releasedKey!.pseudonym });
  });
});

describe('detectDuplicates (integration)', () => {
  it('auto-flags a matching source_url by appending deal.duplicate_flagged', async () => {
    const original = await seedDeal(account.admin, account.accountId, account.userId, {
      description: 'Original listing',
      source_url: 'https://example.com/listing/alpha',
    });
    const copy = await seedDeal(account.admin, account.accountId, account.userId, {
      description: 'Copied listing',
      source_url: 'https://example.com/listing/alpha',
    });

    await detectDuplicates({ dealId: copy });

    const { data: events } = await account.admin
      .from('deal_event')
      .select('event_type, payload')
      .eq('deal_id', copy)
      .eq('event_type', 'deal.duplicate_flagged');

    expect(events).toHaveLength(1);
    expect(events![0]!.payload).toMatchObject({ duplicate_of: original });
  });

  it('records a description match as a duplicate_candidate', async () => {
    const first = await seedDeal(account.admin, account.accountId, account.userId, {
      description: 'Harbor Freight Bookkeeping',
    });
    const second = await seedDeal(account.admin, account.accountId, account.userId, {
      description: 'Harbor Freight Bookkeeping',
    });

    await detectDuplicates({ dealId: second });

    const { data: candidates } = await account.admin
      .from('duplicate_candidate')
      .select('candidate_deal_id, signal, score')
      .eq('deal_id', second);

    expect(candidates).toHaveLength(1);
    expect(candidates![0]).toMatchObject({
      candidate_deal_id: first,
      signal: 'description',
    });
    expect(Number(candidates![0]!.score)).toBeCloseTo(0.5, 5);
  });
});

describe('k-anonymity read surface (integration)', () => {
  it('hides raw pools from tenants and exposes only aggregate buckets at or above the minimum', async () => {
    const region = `ZZ-${crypto.randomUUID().slice(0, 8)}`;
    regionCleanup.push(region);

    const bucketRow = (ordinal: number) => ({
      pseudonym: `${region}-${ordinal}`,
      region,
      naics3: '541',
      industry_short: 'CPA Firm',
      close_quarter: '2025-Q1',
      sale_price_banded: 1_000_000 + ordinal * 10_000,
      revenue_banded: 700_000,
      sde_banded: 250_000,
      sde_multiple: 4,
      outcome: 'won',
    });

    for (let i = 0; i < 4; i += 1) {
      await account.admin.from('comp_pool').insert(bucketRow(i));
    }

    const tenantBase = await account.user
      .from('comp_pool')
      .select('id')
      .eq('region', region);
    expect(tenantBase.error).not.toBeNull();

    const tenantKey = await account.user
      .from('comp_pool_key')
      .select('id')
      .limit(1);
    expect(tenantKey.error).not.toBeNull();

    const tenantActivityBase = await account.user
      .from('activity_pool')
      .select('id')
      .limit(1);
    expect(tenantActivityBase.error).not.toBeNull();

    const belowMin = await account.user
      .from('comp_pool_public')
      .select('region, n')
      .eq('region', region);
    expect(belowMin.error).toBeNull();
    expect(belowMin.data).toHaveLength(0);

    await account.admin.from('comp_pool').insert(bucketRow(4));

    const atMin = await account.user
      .from('comp_pool_public')
      .select('*')
      .eq('region', region);
    expect(atMin.error).toBeNull();
    expect(atMin.data).toHaveLength(1);

    const bucket = atMin.data![0];
    expect(Number(bucket.n)).toBe(5);
    expect(bucket).toHaveProperty('median_sale_price');
    expect(bucket).toHaveProperty('median_sde_multiple');
    expect(bucket).not.toHaveProperty('pseudonym');
    expect(bucket).not.toHaveProperty('sale_price_banded');
  });
});
