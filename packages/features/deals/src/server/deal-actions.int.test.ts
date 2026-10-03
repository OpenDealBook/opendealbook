import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  type IntegrationAccount,
  provisionAccount,
} from '../../test-support/integration-harness';

const holder = vi.hoisted(() => ({
  client: null as unknown,
}));

vi.mock('@odb/next/actions', () => ({
  enhanceAction: (fn: unknown) => fn,
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => holder.client,
}));

import {
  adoptDealFinancials,
  archiveDeal,
  createDeal,
  setDealResolution,
  starDeal,
  unarchiveDeal,
  unstarDeal,
  updateDealStage,
} from './deal-actions';

type Action = (
  data: Record<string, unknown>,
  user: { id: string },
) => Promise<unknown>;

let account: IntegrationAccount;
let actor: { id: string };

async function newDeal(description: string): Promise<string> {
  const id = (await (createDeal as unknown as Action)(
    {
      account_id: account.accountId,
      description,
      source: 'manual',
      stage: 'sourcing',
    },
    actor,
  )) as string;

  return id;
}

beforeAll(async () => {
  account = await provisionAccount();
  holder.client = account.user;
  actor = { id: account.userId };
});

afterAll(async () => {
  await account.cleanup();
});

describe('createDeal (integration)', () => {
  it('appends deal.created and projects a deal row plus a deal_profile row', async () => {
    const dealId = (await (createDeal as unknown as Action)(
      {
        account_id: account.accountId,
        description: 'Main Street CPA',
        source: 'marketplace',
        stage: 'sourcing',
        employee_band: '10-24',
        website: 'https://mainstreetcpa.example',
        owner_role: 'managing_partner',
        reason_for_sale: 'retirement',
        year_established: 1998,
      },
      actor,
    )) as string;

    const { data: deal } = await account.admin
      .from('deal')
      .select('id, account_id, stage, source, description, owner_user_id')
      .eq('id', dealId)
      .single();

    expect(deal).toMatchObject({
      id: dealId,
      account_id: account.accountId,
      stage: 'sourcing',
      source: 'marketplace',
      description: 'Main Street CPA',
      owner_user_id: account.userId,
    });

    const { data: profile } = await account.admin
      .from('deal_profile')
      .select('deal_id, employee_band, website, owner_role, reason_for_sale, year_established')
      .eq('deal_id', dealId)
      .single();

    expect(profile).toMatchObject({
      deal_id: dealId,
      employee_band: '10-24',
      website: 'https://mainstreetcpa.example',
      owner_role: 'managing_partner',
      reason_for_sale: 'retirement',
      year_established: 1998,
    });

    const { data: events } = await account.admin
      .from('deal_event')
      .select('event_type')
      .eq('deal_id', dealId)
      .eq('event_type', 'deal.created');

    expect(events).toHaveLength(1);
  });
});

describe('updateDealStage (integration)', () => {
  it('appends deal.stage_changed and advances deal.stage with a stage_changed_at stamp', async () => {
    const dealId = await newDeal('Stage move deal');

    await (updateDealStage as unknown as Action)(
      { deal_id: dealId, stage: 'nda_signed' },
      actor,
    );

    const { data: deal } = await account.admin
      .from('deal')
      .select('stage, stage_changed_at')
      .eq('id', dealId)
      .single();

    expect(deal?.stage).toBe('nda_signed');
    expect(deal?.stage_changed_at).not.toBeNull();
  });
});

describe('setDealResolution (integration)', () => {
  it('records the resolution and reason on the deal', async () => {
    const dealId = await newDeal('Resolution deal');

    await (setDealResolution as unknown as Action)(
      { deal_id: dealId, resolution: 'lost', resolution_reason: 'deal_did_not_close' },
      actor,
    );

    const { data: deal } = await account.admin
      .from('deal')
      .select('resolution, resolution_reason')
      .eq('id', dealId)
      .single();

    expect(deal).toMatchObject({
      resolution: 'lost',
      resolution_reason: 'deal_did_not_close',
    });
  });
});

describe('adoptDealFinancials (integration)', () => {
  it('projects a deal_financials row from the adopted figures', async () => {
    const dealId = await newDeal('Financials deal');

    await (adoptDealFinancials as unknown as Action)(
      {
        deal_id: dealId,
        adopted_revenue: 1_000_000,
        adopted_sde: 250_000,
        adopted_ebitda: 300_000,
      },
      actor,
    );

    const { data: financials } = await account.admin
      .from('deal_financials')
      .select('deal_id, adopted_revenue, adopted_sde, adopted_ebitda')
      .eq('deal_id', dealId)
      .single();

    expect(financials).toMatchObject({
      deal_id: dealId,
      adopted_revenue: 1_000_000,
      adopted_sde: 250_000,
      adopted_ebitda: 300_000,
    });
  });
});

describe('star toggle (integration)', () => {
  it('inserts then removes a deal_star row', async () => {
    const dealId = await newDeal('Star deal');

    await (starDeal as unknown as Action)({ deal_id: dealId }, actor);

    const starred = await account.admin
      .from('deal_star')
      .select('deal_id')
      .eq('deal_id', dealId)
      .eq('user_id', account.userId);

    expect(starred.data).toHaveLength(1);

    await (unstarDeal as unknown as Action)({ deal_id: dealId }, actor);

    const cleared = await account.admin
      .from('deal_star')
      .select('deal_id')
      .eq('deal_id', dealId)
      .eq('user_id', account.userId);

    expect(cleared.data).toHaveLength(0);
  });
});

describe('archive toggle (integration)', () => {
  it('sets then clears deal.archived_at', async () => {
    const dealId = await newDeal('Archive deal');

    await (archiveDeal as unknown as Action)({ deal_id: dealId }, actor);

    const archived = await account.admin
      .from('deal')
      .select('archived_at')
      .eq('id', dealId)
      .single();

    expect(archived.data?.archived_at).not.toBeNull();

    await (unarchiveDeal as unknown as Action)({ deal_id: dealId }, actor);

    const unarchived = await account.admin
      .from('deal')
      .select('archived_at')
      .eq('id', dealId)
      .single();

    expect(unarchived.data?.archived_at).toBeNull();
  });
});
