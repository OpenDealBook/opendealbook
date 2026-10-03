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
  adoptCalcVersion,
  createCalcVersion,
  saveDealCalc,
} from './calc-actions';
import { createDeal } from './deal-actions';
import { generateLoi } from './loi-actions';
import { acceptOffer, createOffer, submitOffer } from './offer-actions';

type Action = (
  data: Record<string, unknown>,
  user: { id: string },
) => Promise<unknown>;

let account: IntegrationAccount;
let actor: { id: string };

const dealInputs = {
  pl: {
    sales: 163_000,
    cogs: 0,
    opex: 0,
    depreciation_amortization: 0,
    taxes: 0,
    interest: 0,
    owner_benefits: 0,
  },
  purchase_price: 619_150,
  closing_costs: 41_000,
  annual_growth: 0,
  required_personal_cash_flow: 100_000,
  dscr_mode: 'tax_adjusted',
  tax_rate: 0.2564,
};

const funding = [
  { type: 'sba_7a', amount: 612_152, rate: 0.115, term_years: 10 },
];

function firstVersion(price: number) {
  return {
    number: 1,
    author_side: 'buyer',
    purchase_price: price,
    terms: {
      schema_version: 1,
      purchase_price: price,
    },
  };
}

async function newDeal(description: string): Promise<string> {
  return (await (createDeal as unknown as Action)(
    {
      account_id: account.accountId,
      description,
      source: 'manual',
      stage: 'sourcing',
    },
    actor,
  )) as string;
}

async function acceptedOffer(dealId: string, price: number): Promise<string> {
  const offerId = (await (createOffer as unknown as Action)(
    { deal_id: dealId, first_version: firstVersion(price) },
    actor,
  )) as string;
  await (submitOffer as unknown as Action)({ offer_id: offerId }, actor);
  await (acceptOffer as unknown as Action)({ offer_id: offerId }, actor);
  return offerId;
}

async function adoptFinancials(dealId: string): Promise<void> {
  const calcVersionId = (await (createCalcVersion as unknown as Action)(
    { deal_id: dealId, type: 'deal' },
    actor,
  )) as string;
  await (saveDealCalc as unknown as Action)(
    { calc_version_id: calcVersionId, inputs: dealInputs, funding_sources: funding },
    actor,
  );
  await (adoptCalcVersion as unknown as Action)(
    { deal_id: dealId, calc_version_id: calcVersionId },
    actor,
  );
}

beforeAll(async () => {
  account = await provisionAccount();
  holder.client = account.user;
  actor = { id: account.userId };
});

afterAll(async () => {
  await account.cleanup();
});

describe('generateLoi (integration)', () => {
  it('creates a loi contract and generated document from the accepted offer, leaving the deal at loi_submitted', async () => {
    const dealId = await newDeal('Generate LOI deal');
    const offerId = await acceptedOffer(dealId, 900_000);
    await adoptFinancials(dealId);

    const { data: accepted } = await account.admin
      .from('offer')
      .select('current_version_id')
      .eq('id', offerId)
      .single();

    await (generateLoi as unknown as Action)({ offer_id: offerId }, actor);

    const { data: contracts } = await account.admin
      .from('contract')
      .select('id, deal_id, type, status, source_offer_version_id')
      .eq('deal_id', dealId);

    expect(contracts).toHaveLength(1);
    expect(contracts?.[0]).toMatchObject({
      deal_id: dealId,
      type: 'loi',
      status: 'draft',
      source_offer_version_id: accepted?.current_version_id,
    });

    const { data: documents } = await account.admin
      .from('generated_document')
      .select('deal_id, contract_id, values_json')
      .eq('deal_id', dealId);

    expect(documents).toHaveLength(1);
    expect(documents?.[0]?.contract_id).toBe(contracts?.[0]?.id);
    expect(
      (documents?.[0]?.values_json as { purchase_price?: number })
        ?.purchase_price,
    ).toBe(900_000);

    const { data: deal } = await account.admin
      .from('deal')
      .select('stage')
      .eq('id', dealId)
      .single();

    expect(deal?.stage).toBe('loi_submitted');
  });

  it('rejects when the deal has no adopted financials (deal box screen fails)', async () => {
    const dealId = await newDeal('Unscreened deal');
    const offerId = await acceptedOffer(dealId, 800_000);

    await expect(
      (generateLoi as unknown as Action)({ offer_id: offerId }, actor),
    ).rejects.toThrow('deal box screen');
  });

  it('rejects when the offer is not accepted', async () => {
    const dealId = await newDeal('Unaccepted deal');
    const offerId = (await (createOffer as unknown as Action)(
      { deal_id: dealId, first_version: firstVersion(700_000) },
      actor,
    )) as string;
    await (submitOffer as unknown as Action)({ offer_id: offerId }, actor);
    await adoptFinancials(dealId);

    await expect(
      (generateLoi as unknown as Action)({ offer_id: offerId }, actor),
    ).rejects.toThrow('not accepted');
  });
});
