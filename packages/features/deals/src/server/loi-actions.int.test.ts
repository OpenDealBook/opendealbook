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
      const docxPath = `${input.accountId}/${input.dealId}/loi.docx`;
      const pdfPath = `${input.accountId}/${input.dealId}/loi.pdf`;

      const upload = await client.storage
        .from('generated')
        .upload(pdfPath, new Uint8Array([37, 80, 68, 70]), {
          contentType: 'application/pdf',
          upsert: true,
        });

      if (upload.error) {
        throw upload.error;
      }

      const { data, error } = await client
        .from('generated_document')
        .insert({
          account_id: input.accountId,
          deal_id: input.dealId,
          values_json: input.fieldValues as never,
          docx_path: docxPath,
          pdf_path: pdfPath,
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
  GENERATED_BUCKET: 'generated',
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

async function seedLoiTemplate(): Promise<void> {
  await account.admin
    .from('document_template')
    .insert({
      account_id: account.accountId,
      name: 'Placeholder LOI',
      type: 'loi',
      docx_path: 'mock/loi.docx',
      version: 1,
    })
    .throwOnError();
}

beforeAll(async () => {
  account = await provisionAccount();
  holder.client = account.user;
  holder.userId = account.userId;
  actor = { id: account.userId };
  await seedLoiTemplate();
});

afterAll(async () => {
  await account.cleanup();
});

describe('generateLoi (integration)', () => {
  it('renders the loi, creates a signed-ready contract version, and sends it for signature while the deal stays at loi_submitted', async () => {
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

    const contractId = contracts?.[0]?.id as string;

    const { data: documents } = await account.admin
      .from('generated_document')
      .select('deal_id, contract_id, values_json')
      .eq('deal_id', dealId);

    expect(documents).toHaveLength(1);
    expect(documents?.[0]?.contract_id).toBe(contractId);
    expect(
      (documents?.[0]?.values_json as { purchase_price?: number })
        ?.purchase_price,
    ).toBe(900_000);

    const { data: versions } = await account.admin
      .from('contract_version')
      .select('id, version, source, party, pdf_path')
      .eq('contract_id', contractId);

    expect(versions).toHaveLength(1);
    expect(versions?.[0]).toMatchObject({
      version: 1,
      source: 'generated',
      party: 'buyer',
    });
    expect(versions?.[0]?.pdf_path).toBe(
      `${account.accountId}/${contractId}/v1.pdf`,
    );

    const signable = await account.admin.storage
      .from('contracts')
      .download(versions?.[0]?.pdf_path as string);
    expect(signable.error).toBeNull();

    expect(esign.sendForSignature).toHaveBeenCalledWith(
      expect.objectContaining({ contractVersionId: versions?.[0]?.id }),
      expect.objectContaining({ documenso: expect.anything() }),
    );

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
