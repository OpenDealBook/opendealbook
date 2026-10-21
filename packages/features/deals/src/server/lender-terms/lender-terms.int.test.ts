import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { TEAM_READ_ONLY } from '@odb/next';

import {
  type IntegrationAccount,
  provisionAccount,
} from '../../../test-support/integration-harness';

const holder = vi.hoisted(() => ({
  client: null as unknown,
}));

vi.mock('@odb/next/actions', () => ({
  enhanceAction: (fn: unknown) => fn,
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => holder.client,
}));

import { createDealCore } from '../deal-actions';
import { saveDealTermsSought, setCloseDeadline } from './lender-terms-actions';
import {
  fetchCloseDeadline,
  fetchDealTermsSought,
  loadDealTermsSought,
} from './lender-terms-loaders';

type Action = (
  data: Record<string, unknown>,
  user: { id: string },
) => Promise<unknown>;

let account: IntegrationAccount;
let actor: { id: string };
let dealId: string;

beforeAll(async () => {
  account = await provisionAccount();
  holder.client = account.user;
  actor = { id: account.userId };
  dealId = await createDealCore(
    account.user,
    {
      account_id: account.accountId,
      business_name: 'Lender terms deal',
      industry: 'Accounting',
      description: 'Lender terms deal',
      source: 'manual',
      stage: 'sourcing',
    },
    actor.id,
  );
});

afterAll(async () => {
  await account.cleanup();
});

describe('close deadline (integration)', () => {
  it('has no deadline until one is set', async () => {
    expect(await fetchCloseDeadline(account.user, dealId)).toBeNull();
  });

  it('sets, replaces, and clears the deadline through the deal log', async () => {
    await (setCloseDeadline as unknown as Action)(
      {
        deal_id: dealId,
        must_close_by: '2027-03-31',
        must_close_reason: 'Lease expires',
      },
      actor,
    );
    expect(await fetchCloseDeadline(account.user, dealId)).toMatchObject({
      must_close_by: '2027-03-31',
      must_close_reason: 'Lease expires',
    });

    await (setCloseDeadline as unknown as Action)(
      { deal_id: dealId, must_close_by: '2027-04-15', must_close_reason: null },
      actor,
    );
    expect(await fetchCloseDeadline(account.user, dealId)).toMatchObject({
      must_close_by: '2027-04-15',
      must_close_reason: null,
    });

    await (setCloseDeadline as unknown as Action)(
      { deal_id: dealId, must_close_by: null, must_close_reason: null },
      actor,
    );
    expect(await fetchCloseDeadline(account.user, dealId)).toMatchObject({
      must_close_by: null,
      must_close_reason: null,
    });
  });
});

describe('terms sought (integration)', () => {
  it('has no row until terms are saved', async () => {
    expect(await fetchDealTermsSought(account.user, dealId)).toBeNull();
  });

  it('saves one row per deal and a second save replaces its values', async () => {
    await (saveDealTermsSought as unknown as Action)(
      {
        deal_id: dealId,
        loan_amount: 800_000,
        loan_type: 'sba_7a',
        term_years: 10,
        rate_type: 'fixed',
        seller_note_amount: 200_000,
        notes: 'Prefer no prepayment penalty',
      },
      actor,
    );
    await (saveDealTermsSought as unknown as Action)(
      {
        deal_id: dealId,
        loan_amount: 750_000,
        loan_type: 'conventional',
        term_years: null,
        rate_type: null,
        seller_note_amount: null,
        notes: null,
      },
      actor,
    );

    const { count } = await account.user
      .from('deal_terms_sought')
      .select('id', { count: 'exact', head: true })
      .eq('deal_id', dealId);
    expect(count).toBe(1);

    expect(await fetchDealTermsSought(account.user, dealId)).toMatchObject({
      deal_id: dealId,
      account_id: account.accountId,
      loan_amount: 750_000,
      loan_type: 'conventional',
      term_years: null,
      rate_type: null,
      seller_note_amount: null,
      notes: null,
    });
  });
});

describe('loadDealTermsSought (integration)', () => {
  async function newDeal(description: string): Promise<string> {
    return await createDealCore(
      account.user,
      {
        account_id: account.accountId,
        business_name: description,
        industry: 'Accounting',
        description,
        source: 'manual',
        stage: 'sourcing',
      },
      actor.id,
    );
  }

  async function addDealCalc(
    deal: string,
    isPrimary: boolean,
    sources: { type: string; amount: number; term_years?: number }[],
  ) {
    const { data: version } = await account.user
      .from('calc_version')
      .insert({
        account_id: account.accountId,
        deal_id: deal,
        type: 'deal',
        is_primary: isPrimary,
      })
      .select('id')
      .single()
      .throwOnError();
    await account.user
      .from('funding_source')
      .insert(
        sources.map((source) => ({
          ...source,
          account_id: account.accountId,
          calc_version_id: version.id,
        })),
      )
      .throwOnError();
  }

  it('proposes terms from the primary deal calc when nothing is saved', async () => {
    const deal = await newDeal('Prefill deal');
    await addDealCalc(deal, false, [{ type: 'sba_7a', amount: 999_000 }]);
    await addDealCalc(deal, true, [
      { type: 'sba_7a', amount: 800_000, term_years: 10 },
      { type: 'seller_financing', amount: 200_000 },
    ]);

    expect(await loadDealTermsSought(account.user, deal)).toEqual({
      source: 'proposed',
      terms: {
        loan_amount: 800_000,
        loan_type: 'sba_7a',
        term_years: 10,
        rate_type: null,
        seller_note_amount: 200_000,
      },
    });
  });

  it('proposes nothing when the deal has no primary deal calc', async () => {
    const deal = await newDeal('No primary deal');
    await addDealCalc(deal, false, [{ type: 'sba_7a', amount: 800_000 }]);

    expect(await loadDealTermsSought(account.user, deal)).toEqual({
      source: 'proposed',
      terms: {
        loan_amount: null,
        loan_type: null,
        term_years: null,
        rate_type: null,
        seller_note_amount: null,
      },
    });
  });

  it('returns the saved row instead of a proposal once terms exist', async () => {
    const deal = await newDeal('Saved wins');
    await addDealCalc(deal, true, [{ type: 'sba_7a', amount: 800_000 }]);
    await (saveDealTermsSought as unknown as Action)(
      {
        deal_id: deal,
        loan_amount: 1,
        loan_type: null,
        term_years: null,
        rate_type: null,
        seller_note_amount: null,
        notes: null,
      },
      actor,
    );

    expect(await loadDealTermsSought(account.user, deal)).toMatchObject({
      source: 'saved',
      terms: { loan_amount: 1 },
    });
  });
});

describe('refusals (integration)', () => {
  const closeDeadline = {
    must_close_by: '2027-06-01',
    must_close_reason: 'Refused',
  };
  const terms = {
    loan_amount: 1,
    loan_type: null,
    term_years: null,
    rate_type: null,
    seller_note_amount: null,
    notes: null,
  };

  let stranger: IntegrationAccount;
  let teamId: string;
  let teamDealId: string;

  beforeAll(async () => {
    stranger = await provisionAccount();
    const { data: team } = await account.admin
      .rpc('create_team_account', {
        account_name: `Terms ${crypto.randomUUID().slice(0, 8)}`,
        user_id: account.userId,
      })
      .throwOnError();
    teamId = team.id;
    teamDealId = await createDealCore(
      account.user,
      {
        account_id: teamId,
        business_name: 'Locked terms deal',
        industry: 'Accounting',
        description: 'Locked terms deal',
        source: 'manual',
        stage: 'sourcing',
      },
      actor.id,
    );
  });

  afterAll(async () => {
    holder.client = account.user;
    await stranger.cleanup();
  });

  it('tells someone outside the deal team and changes nothing', async () => {
    holder.client = stranger.user;
    const deadline = await (setCloseDeadline as unknown as Action)(
      { deal_id: dealId, ...closeDeadline },
      { id: stranger.userId },
    );
    const saved = await (saveDealTermsSought as unknown as Action)(
      { deal_id: dealId, ...terms },
      { id: stranger.userId },
    );
    holder.client = account.user;

    expect(deadline).toEqual({
      ok: false,
      refusal: 'Only the deal team can do that',
    });
    expect(saved).toEqual({
      ok: false,
      refusal: 'Only the deal team can do that',
    });
    expect(await fetchCloseDeadline(account.user, dealId)).toMatchObject({
      must_close_by: null,
    });
    expect(await fetchDealTermsSought(account.user, dealId)).toMatchObject({
      loan_amount: 750_000,
    });
  });

  it('tells a billing-locked team it is read-only and changes nothing', async () => {
    await account.admin
      .from('accounts')
      .update({
        trial_ends_at: new Date(Date.now() - 86_400_000).toISOString(),
      })
      .eq('id', teamId)
      .throwOnError();

    const deadline = await (setCloseDeadline as unknown as Action)(
      { deal_id: teamDealId, ...closeDeadline },
      actor,
    );
    const saved = await (saveDealTermsSought as unknown as Action)(
      { deal_id: teamDealId, ...terms },
      actor,
    );

    expect(deadline).toEqual({ ok: false, refusal: TEAM_READ_ONLY });
    expect(saved).toEqual({ ok: false, refusal: TEAM_READ_ONLY });
    expect(await fetchCloseDeadline(account.user, teamDealId)).toBeNull();
    expect(await fetchDealTermsSought(account.user, teamDealId)).toBeNull();
  });
});
