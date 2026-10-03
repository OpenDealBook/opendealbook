import type { SupabaseClient } from '@supabase/supabase-js';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Database } from '@odb/supabase';

import {
  type IntegrationAccount,
  provisionAccount,
} from '../../test-support/integration-harness';

const holder = vi.hoisted(() => ({
  client: null as unknown,
  userId: '',
}));

const esign = vi.hoisted(() => ({
  sendForSignature: vi.fn(async () => ({
    documentId: 'doc-1',
    status: 'PENDING',
  })),
}));

vi.mock('@odb/next/actions', () => ({
  enhanceAction: (fn: unknown) => fn,
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => holder.client,
}));

vi.mock('@odb/templates/server', () => ({
  generateFromTemplate: vi.fn(
    async (input: {
      accountId: string;
      dealId: string;
      fieldValues: Record<string, unknown>;
    }) => {
      const client = holder.client as SupabaseClient<Database>;
      const { data, error } = await client
        .from('generated_document')
        .insert({
          account_id: input.accountId,
          deal_id: input.dealId,
          values_json: input.fieldValues as never,
          docx_path: 'mock/apa.docx',
          pdf_path: 'mock/apa.pdf',
          created_by: holder.userId,
        })
        .select('*')
        .single();

      if (error) {
        throw error;
      }

      return data;
    },
  ),
}));

vi.mock('@odb/contracts/esign', () => ({
  sendForSignature: esign.sendForSignature,
  createDocumensoClient: () => ({}),
}));

import {
  adoptCalcVersion,
  createCalcVersion,
  saveDealCalc,
} from './calc-actions';
import { generateApa } from './apa-actions';
import { createDeal, updateDealStage } from './deal-actions';
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
    terms: { schema_version: 1, purchase_price: price },
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

async function seedApaTemplate(): Promise<void> {
  await account.admin
    .from('document_template')
    .insert({
      account_id: account.accountId,
      name: 'Placeholder APA',
      type: 'apa',
      docx_path: 'mock/apa.docx',
      version: 1,
    })
    .throwOnError();
}

beforeAll(async () => {
  account = await provisionAccount();
  holder.client = account.user;
  holder.userId = account.userId;
  actor = { id: account.userId };
  await seedApaTemplate();
});

afterAll(async () => {
  await account.cleanup();
});

describe('generateApa (integration)', () => {
  it('renders the apa, sends it for signature, and advances the deal to pa_submitted once the loi is accepted', async () => {
    const dealId = await newDeal('Generate APA deal');
    const offerId = await acceptedOffer(dealId, 1_200_000);
    await adoptFinancials(dealId);
    await (updateDealStage as unknown as Action)(
      { deal_id: dealId, stage: 'loi_accepted' },
      actor,
    );

    const { data: accepted } = await account.admin
      .from('offer')
      .select('current_version_id')
      .eq('id', offerId)
      .single();

    await (generateApa as unknown as Action)({ offer_id: offerId }, actor);

    const { data: contracts } = await account.admin
      .from('contract')
      .select('id, type, status, source_offer_version_id')
      .eq('deal_id', dealId);

    expect(contracts).toHaveLength(1);
    expect(contracts?.[0]).toMatchObject({
      type: 'apa',
      status: 'draft',
      source_offer_version_id: accepted?.current_version_id,
    });

    const contractId = contracts?.[0]?.id as string;

    const { data: versions } = await account.admin
      .from('contract_version')
      .select('id, version, source, party, pdf_path')
      .eq('contract_id', contractId);

    expect(versions).toHaveLength(1);
    expect(versions?.[0]).toMatchObject({
      version: 1,
      source: 'generated',
      party: 'buyer',
      pdf_path: 'mock/apa.pdf',
    });

    expect(esign.sendForSignature).toHaveBeenCalledWith(
      expect.objectContaining({ contractVersionId: versions?.[0]?.id }),
      expect.objectContaining({ documenso: expect.anything() }),
    );

    const { data: deal } = await account.admin
      .from('deal')
      .select('stage')
      .eq('id', dealId)
      .single();

    expect(deal?.stage).toBe('pa_submitted');
  });

  it('rejects when the deal has not reached loi_accepted', async () => {
    const dealId = await newDeal('Premature APA deal');
    const offerId = await acceptedOffer(dealId, 950_000);

    await expect(
      (generateApa as unknown as Action)({ offer_id: offerId }, actor),
    ).rejects.toThrow('loi_accepted');
  });
});
