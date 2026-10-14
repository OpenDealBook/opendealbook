import type { SupabaseClient } from '@supabase/supabase-js';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  type SignatureState,
  handleContractSignatureEvent,
} from '@odb/contracts/esign';
import type { Database } from '@odb/supabase';

import {
  type IntegrationAccount,
  provisionAccount,
} from '../../test-support/integration-harness';

const holder = vi.hoisted(() => ({
  client: null as unknown,
  admin: null as unknown,
  userId: '',
}));

const documenso = vi.hoisted(() => {
  const states = new Map<string, string>();
  const signedPdf = { override: null as string | null };
  const editorLookup = { fails: null as Error | null, calls: 0 };
  const editorUrlOf = (documentId: string) =>
    `https://sign.test/t/team/documents/${documentId}/edit`;

  return {
    states,
    signedPdf,
    editorLookup,
    editorUrlOf,
    client: {
      createDraft: async () => {
        const documentId = `envelope_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
        states.set(documentId, 'draft');
        return { documentId };
      },
      deleteDraft: async (documentId: string) => {
        states.delete(documentId);
      },
      editorUrl: async (documentId: string) => {
        editorLookup.calls += 1;

        if (editorLookup.fails) {
          throw editorLookup.fails;
        }

        return editorUrlOf(documentId);
      },
      signatureState: async (documentId: string) =>
        (states.get(documentId) ?? 'missing') as SignatureState,
      downloadSignedPdf: async (documentId: string) =>
        Buffer.from(signedPdf.override ?? `%PDF-1.7 signed ${documentId}`),
    },
  };
});

vi.mock('@odb/next/actions', () => ({
  enhanceAction:
    (fn: (data: unknown, user: { id: string }) => unknown) =>
    (data: unknown, user?: { id: string }) =>
      fn(data, user ?? { id: holder.userId }),
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => holder.client,
  getSupabaseServerAdminClient: () => holder.admin,
}));

vi.mock('@odb/templates/server', () => ({
  generateFromTemplate: vi.fn(
    async (input: {
      accountId: string;
      dealId: string;
      fieldValues: Record<string, unknown>;
    }) => {
      const client = holder.client as SupabaseClient<Database>;
      const docxPath = `${input.accountId}/${input.dealId}/apa.docx`;
      const pdfPath = `${input.accountId}/${input.dealId}/apa.pdf`;

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

vi.mock('@odb/contracts/esign', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@odb/contracts/esign')>()),
  createDocumensoClient: () => documenso.client,
}));

import {
  adoptCalcVersion,
  createCalcVersion,
  saveDealCalc,
} from './calc-actions';
import { generateApa } from './apa-actions';
import { loadOfferSignatures } from './contract-signature-loader';
import { createDeal, updateDealStage } from './deal-actions';
import { acceptOffer, createOffer, submitOffer } from './offer-actions';

type Action = (
  data: Record<string, unknown>,
  user?: { id: string },
) => Promise<unknown>;

const SIGNERS = [
  { name: 'Bea Buyer', email: 'buyer@example.com' },
  { name: 'Sol Seller', email: 'seller@example.com' },
];

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

async function signing(dealId: string) {
  const { data: contract } = await account.admin
    .from('contract')
    .select('id')
    .eq('deal_id', dealId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
    .throwOnError();
  const { data: version } = await account.admin
    .from('contract_version')
    .select('id, is_signed, signing_document_id, signing_status')
    .eq('contract_id', contract.id)
    .single()
    .throwOnError();
  const { data: deal } = await account.admin
    .from('deal')
    .select('stage')
    .eq('id', dealId)
    .single()
    .throwOnError();

  return { ...version, stage: deal.stage };
}

function documensoReports(documentId: string, state: SignatureState) {
  documenso.states.set(documentId, state);
  return handleContractSignatureEvent(documentId, {
    client: account.admin,
    admin: account.admin,
    documenso: documenso.client,
  });
}

beforeAll(async () => {
  account = await provisionAccount();
  holder.client = account.user;
  holder.admin = account.admin;
  holder.userId = account.userId;
  actor = { id: account.userId };
  process.env.DOCUMENSO_URL = 'https://sign.test';
  process.env.DOCUMENSO_API_KEY = 'api_test';
  await seedApaTemplate();
});

afterAll(async () => {
  await account.cleanup();
});

describe('generateApa (integration)', () => {
  it('renders the apa and drafts its signature request in Documenso, leaving the deal at loi_accepted', async () => {
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

    const generated = await (generateApa as unknown as Action)(
      { offer_id: offerId, signers: SIGNERS },
      actor,
    );

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
    });
    expect(versions?.[0]?.pdf_path).toBe(
      `${account.accountId}/${contractId}/v1.pdf`,
    );

    const signable = await account.admin.storage
      .from('contracts')
      .download(versions?.[0]?.pdf_path as string);
    expect(signable.error).toBeNull();

    const requested = await signing(dealId);
    expect(requested.signing_document_id).toMatch(/^envelope_[0-9a-f]{16}$/);
    expect(documenso.states.get(requested.signing_document_id!)).toBe('draft');
    expect(generated).toEqual({
      ok: true,
      value: {
        contractVersionId: requested.id,
        editorUrl: documenso.editorUrlOf(requested.signing_document_id!),
      },
    });

    const { data: deal } = await account.admin
      .from('deal')
      .select('stage')
      .eq('id', dealId)
      .single();

    expect(deal?.stage).toBe('loi_accepted');
  });

  it('advances the deal to pa_submitted when Documenso reports the envelope sent, then to pa_accepted and signed when it completes', async () => {
    const dealId = await newDeal('Signed APA deal');
    const offerId = await acceptedOffer(dealId, 1_100_000);
    await adoptFinancials(dealId);
    await (updateDealStage as unknown as Action)(
      { deal_id: dealId, stage: 'loi_accepted' },
      actor,
    );
    await (generateApa as unknown as Action)(
      { offer_id: offerId, signers: SIGNERS },
      actor,
    );
    const { signing_document_id: documentId } = await signing(dealId);

    await documensoReports(documentId!, 'sent');

    expect(await signing(dealId)).toMatchObject({
      is_signed: false,
      stage: 'pa_submitted',
    });

    await documensoReports(documentId!, 'completed');

    expect(await signing(dealId)).toMatchObject({
      is_signed: true,
      stage: 'pa_accepted',
    });
  });

  it.each([
    ['rejected', 'declined'],
    ['cancelled', 'declined'],
    ['missing', 'declined'],
    ['expired', 'expired'],
  ] as const)(
    'steps the deal back to loi_accepted when a sent APA is %s, records it as %s, and lets a new APA be generated',
    async (state, status) => {
      const dealId = await newDeal(`APA ${state} deal`);
      const offerId = await acceptedOffer(dealId, 1_050_000);
      await adoptFinancials(dealId);
      await (updateDealStage as unknown as Action)(
        { deal_id: dealId, stage: 'loi_accepted' },
        actor,
      );
      await (generateApa as unknown as Action)(
        { offer_id: offerId, signers: SIGNERS },
        actor,
      );
      const first = await signing(dealId);
      expect(first.signing_status).toBe('draft');
      await documensoReports(first.signing_document_id!, 'sent');
      expect(await signing(dealId)).toMatchObject({
        signing_status: 'sent',
        stage: 'pa_submitted',
      });

      await documensoReports(first.signing_document_id!, state);
      await documensoReports(first.signing_document_id!, state);

      expect(await signing(dealId)).toMatchObject({
        id: first.id,
        is_signed: false,
        signing_status: status,
        stage: 'loi_accepted',
      });

      await (generateApa as unknown as Action)(
        { offer_id: offerId, signers: SIGNERS },
        actor,
      );
      const second = await signing(dealId);
      expect(second.id).not.toBe(first.id);
      expect(second.signing_status).toBe('draft');
      await documensoReports(second.signing_document_id!, 'sent');
      await documensoReports(first.signing_document_id!, state);

      expect(await signing(dealId)).toMatchObject({
        id: second.id,
        signing_status: 'sent',
        stage: 'pa_submitted',
      });
    },
  );

  it('moves the deal from loi_accepted straight to pa_accepted when the APA completes and the sent notice was lost, and files the signed APA', async () => {
    const dealId = await newDeal('Lost notice APA deal');
    const offerId = await acceptedOffer(dealId, 1_020_000);
    await adoptFinancials(dealId);
    await (updateDealStage as unknown as Action)(
      { deal_id: dealId, stage: 'loi_accepted' },
      actor,
    );
    await (generateApa as unknown as Action)({
      offer_id: offerId,
      signers: SIGNERS,
    });
    const requested = await signing(dealId);

    await documensoReports(requested.signing_document_id!, 'completed');

    expect(await signing(dealId)).toMatchObject({
      is_signed: true,
      signing_status: 'completed',
      stage: 'pa_accepted',
    });
    const { data: filed } = await account.admin
      .from('dr_document')
      .select('name')
      .eq('id', requested.id)
      .throwOnError();
    expect(filed).toEqual([{ name: 'APA (signed).pdf' }]);
  });

  it('ends with one "Signed contracts" folder holding both files when two contracts of a deal complete at the same moment', async () => {
    const dealId = await newDeal('Two contracts deal');
    const offerId = await acceptedOffer(dealId, 1_030_000);
    await adoptFinancials(dealId);
    await (updateDealStage as unknown as Action)(
      { deal_id: dealId, stage: 'loi_accepted' },
      actor,
    );
    await (generateApa as unknown as Action)({
      offer_id: offerId,
      signers: SIGNERS,
    });
    const first = await signing(dealId);
    await documensoReports(first.signing_document_id!, 'rejected');
    await (generateApa as unknown as Action)({
      offer_id: offerId,
      signers: SIGNERS,
    });
    const second = await signing(dealId);
    documenso.states.set(first.signing_document_id!, 'completed');
    documenso.states.set(second.signing_document_id!, 'completed');

    await Promise.all(
      [first, second].map((version) =>
        handleContractSignatureEvent(version.signing_document_id!, {
          client: account.admin,
          admin: account.admin,
          documenso: documenso.client,
        }),
      ),
    );

    const { data: folders } = await account.admin
      .from('dr_folder')
      .select('id')
      .eq('deal_id', dealId)
      .ilike('name', 'signed contracts')
      .throwOnError();
    expect(folders).toHaveLength(1);
    const { data: filed } = await account.admin
      .from('dr_document')
      .select('id, name')
      .eq('folder_id', folders[0]!.id)
      .throwOnError();
    expect(filed.map((document) => document.id).sort()).toEqual(
      [first.id, second.id].sort(),
    );
    expect(new Set(filed.map((document) => document.name))).toEqual(
      new Set(['APA (signed).pdf']),
    );
  });

  it('loads the signature state of an offer as the signed-in user: version, status, and the editor link only while a draft', async () => {
    const dealId = await newDeal('Loaded APA deal');
    const offerId = await acceptedOffer(dealId, 1_000_000);
    await adoptFinancials(dealId);
    await (updateDealStage as unknown as Action)(
      { deal_id: dealId, stage: 'loi_accepted' },
      actor,
    );

    expect(await loadOfferSignatures(account.user, offerId)).toEqual({
      loi: null,
      apa: null,
      canGenerate: { loi: true, apa: true },
    });

    await (generateApa as unknown as Action)(
      { offer_id: offerId, signers: SIGNERS },
      actor,
    );
    const requested = await signing(dealId);

    expect(await loadOfferSignatures(account.user, offerId)).toEqual({
      loi: null,
      apa: {
        contractVersionId: requested.id,
        signingStatus: 'draft',
        editorUrl: documenso.editorUrlOf(requested.signing_document_id!),
      },
      canGenerate: { loi: true, apa: false },
    });

    expect(
      await (generateApa as unknown as Action)({
        offer_id: offerId,
        signers: SIGNERS,
      }),
    ).toEqual({
      ok: false,
      refusal: 'A signature request for this APA is already in progress',
    });

    await documensoReports(requested.signing_document_id!, 'sent');
    const lookupsBeforeSent = documenso.editorLookup.calls;

    expect(await loadOfferSignatures(account.user, offerId)).toEqual({
      loi: null,
      apa: {
        contractVersionId: requested.id,
        signingStatus: 'sent',
        editorUrl: null,
      },
      canGenerate: { loi: true, apa: false },
    });
    expect(documenso.editorLookup.calls).toBe(lookupsBeforeSent);

    expect(
      await (generateApa as unknown as Action)({
        offer_id: offerId,
        signers: SIGNERS,
      }),
    ).toEqual({
      ok: false,
      refusal: 'A signature request for this APA is already in progress',
    });

    await documensoReports(requested.signing_document_id!, 'completed');

    expect(
      await (generateApa as unknown as Action)({
        offer_id: offerId,
        signers: SIGNERS,
      }),
    ).toEqual({ ok: false, refusal: 'This APA has already been signed' });

    await documensoReports(requested.signing_document_id!, 'completed');
  });

  it.each([
    ['is failing', new Error('Documenso responded with 500')],
    ['no longer has the envelope', new Error('Documenso responded with 404')],
    [
      'does not answer in time',
      new DOMException(
        'The operation was aborted due to timeout',
        'TimeoutError',
      ),
    ],
  ])(
    'still loads the signature state, with no editor link, when Documenso %s',
    async (_label, failure) => {
      const dealId = await newDeal('Unreachable Documenso deal');
      const offerId = await acceptedOffer(dealId, 1_010_000);
      await adoptFinancials(dealId);
      await (updateDealStage as unknown as Action)(
        { deal_id: dealId, stage: 'loi_accepted' },
        actor,
      );
      await (generateApa as unknown as Action)({
        offer_id: offerId,
        signers: SIGNERS,
      });
      const requested = await signing(dealId);
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
      documenso.editorLookup.fails = failure;

      const loaded = await loadOfferSignatures(account.user, offerId);
      documenso.editorLookup.fails = null;

      expect(loaded.apa).toEqual({
        contractVersionId: requested.id,
        signingStatus: 'draft',
        editorUrl: null,
      });
      expect(logged).toHaveBeenCalledTimes(1);
      logged.mockRestore();
    },
  );

  it('rejects when the deal has not reached loi_accepted', async () => {
    const dealId = await newDeal('Premature APA deal');
    const offerId = await acceptedOffer(dealId, 950_000);

    expect(
      await (generateApa as unknown as Action)({
        offer_id: offerId,
        signers: SIGNERS,
      }),
    ).toEqual({
      ok: false,
      refusal: 'An APA can be generated once the LOI is accepted',
    });
  });
});
