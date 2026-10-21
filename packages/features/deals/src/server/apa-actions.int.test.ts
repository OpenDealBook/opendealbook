import type { SupabaseClient } from '@supabase/supabase-js';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  type SignatureState,
  handleContractSignatureEvent,
} from '@odb/contracts/esign';
import {
  newVersionFromEditorSave,
  newVersionFromUpload,
} from '@odb/contracts/server';
import type { Database } from '@odb/supabase';

import {
  type IntegrationAccount,
  provisionAccount,
} from '../../test-support/integration-harness';
import { createContract } from './create-contract-action';

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
      cancelSent: async (documentId: string) => {
        states.set(documentId, 'cancelled');
      },
      editorUrl: async (documentId: string) => {
        editorLookup.calls += 1;

        if (editorLookup.fails) {
          throw editorLookup.fails;
        }

        return editorUrlOf(documentId);
      },
      signatureState: async (documentId: string) => {
        const state = (states.get(documentId) ?? 'missing') as SignatureState;

        return state === 'completed'
          ? { state, completedOn: new Date().toISOString().slice(0, 10) }
          : { state };
      },
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
  checkTemplateFields: vi.fn(async () => undefined),
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

import { generateApa } from './apa-actions';
import {
  adoptCalcVersion,
  createCalcVersion,
  saveDealCalc,
} from './calc-actions';
import { sendContractForSignature } from './contract-signature-actions';
import { loadOfferSignatures } from './contract-signature-loader';
import { createDealCore, updateDealStage } from './deal-actions';
import { acceptOffer, createOffer, submitOffer } from './offer-actions';

type Action = (
  data: Record<string, unknown>,
  user?: { id: string },
) => Promise<unknown>;

const SIGNERS = [
  { name: 'Bea Buyer', email: 'buyer@example.com' },
  { name: 'Sol Seller', email: 'seller@example.com' },
];

const APA_NEEDS_COUNSEL =
  "An APA needs buyer's counsel and seller's counsel on the deal";

let account: IntegrationAccount;
let actor: { id: string };
let counselUserIds: Record<'buyer' | 'seller', string>;

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

const funding = () => [
  {
    id: crypto.randomUUID(),
    type: 'sba_7a',
    amount: 612_152,
    rate: 0.115,
    term_years: 10,
  },
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
  const dealId = await createDealCore(
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
  await seedCounsel(dealId, 'buyer');
  await seedCounsel(dealId, 'seller');
  return dealId;
}

async function seedCounsel(
  dealId: string,
  side: 'buyer' | 'seller',
): Promise<void> {
  await account.admin
    .from('deal_counsel')
    .insert({
      account_id: account.accountId,
      deal_id: dealId,
      side,
      user_id: counselUserIds[side],
      email: `${side}-counsel@odb.test`,
    })
    .throwOnError();
}

async function removeCounsel(
  dealId: string,
  side: 'buyer' | 'seller',
): Promise<void> {
  await account.admin
    .from('deal_counsel')
    .delete()
    .eq('deal_id', dealId)
    .eq('side', side)
    .throwOnError();
}

async function createCounselUser(): Promise<string> {
  const { data, error } = await account.admin.auth.admin.createUser({
    email: `counsel-${crypto.randomUUID().slice(0, 8)}@odb.test`,
    email_confirm: true,
  });

  if (error) {
    throw error;
  }

  return data.user.id;
}

async function apaVersions(dealId: string): Promise<string[]> {
  const { data } = await account.admin
    .from('contract_version')
    .select('id, contract!inner(deal_id, type)')
    .eq('contract.deal_id', dealId)
    .eq('contract.type', 'apa')
    .throwOnError();

  return data.map((version) => version.id);
}

async function acceptedOffer(dealId: string, price: number): Promise<string> {
  const offerId = (
    (await (createOffer as unknown as Action)(
      { deal_id: dealId, first_version: firstVersion(price) },
      actor,
    )) as { value: string }
  ).value;
  await (submitOffer as unknown as Action)({ offer_id: offerId }, actor);
  await (acceptOffer as unknown as Action)({ offer_id: offerId }, actor);
  return offerId;
}

async function adoptFinancials(dealId: string): Promise<void> {
  const created = await (createCalcVersion as unknown as Action)(
    { deal_id: dealId, type: 'deal' },
    actor,
  );
  expect(created).toMatchObject({ ok: true });
  const calcVersionId = (created as { value: string }).value;
  expect(
    await (saveDealCalc as unknown as Action)(
      {
        calc_version_id: calcVersionId,
        inputs: dealInputs,
        funding_sources: funding(),
      },
      actor,
    ),
  ).toMatchObject({ ok: true });
  expect(
    await (adoptCalcVersion as unknown as Action)(
      { deal_id: dealId, calc_version_id: calcVersionId },
      actor,
    ),
  ).toMatchObject({ ok: true });
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

async function send(dealId: string) {
  const { id } = await signing(dealId);

  return (sendContractForSignature as unknown as Action)(
    { contract_version_id: id, signers: SIGNERS },
    actor,
  );
}

async function sendApproved(dealId: string) {
  const { id } = await signing(dealId);

  for (const side of ['buyer', 'seller'] as const) {
    await account.admin
      .from('contract_review_decision')
      .insert({
        account_id: account.accountId,
        contract_version_id: id,
        side,
        decision: 'approved',
        decided_by: counselUserIds[side],
        without_counsel: false,
      })
      .throwOnError();
  }

  return send(dealId);
}

beforeAll(async () => {
  account = await provisionAccount();
  holder.client = account.user;
  holder.admin = account.admin;
  holder.userId = account.userId;
  actor = { id: account.userId };
  counselUserIds = {
    buyer: await createCounselUser(),
    seller: await createCounselUser(),
  };
  process.env.DOCUMENSO_URL = 'https://sign.test';
  process.env.DOCUMENSO_API_KEY = 'api_test';
  await seedApaTemplate();
});

afterAll(async () => {
  await account.admin
    .from('accounts')
    .delete()
    .eq('id', account.accountId)
    .throwOnError();
  await account.cleanup();
  await account.admin.auth.admin.deleteUser(counselUserIds.buyer);
  await account.admin.auth.admin.deleteUser(counselUserIds.seller);
});

describe('generateApa (integration)', () => {
  it('renders the apa as a new version without drafting a signature request, leaving the deal at loi_accepted', async () => {
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
    const draftsBefore = documenso.states.size;

    const generated = await (generateApa as unknown as Action)(
      { offer_id: offerId },
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

    expect(generated).toEqual({
      ok: true,
      value: { contractVersionId: versions?.[0]?.id },
    });
    expect(await signing(dealId)).toMatchObject({
      signing_document_id: null,
      signing_status: null,
      stage: 'loi_accepted',
    });
    expect(documenso.states.size).toBe(draftsBefore);
  });

  it('refuses to send the apa for signature until counsel on both sides approve, drafting nothing', async () => {
    const dealId = await newDeal('Unapproved APA deal');
    const offerId = await acceptedOffer(dealId, 1_190_000);
    await adoptFinancials(dealId);
    await (updateDealStage as unknown as Action)(
      { deal_id: dealId, stage: 'loi_accepted' },
      actor,
    );
    await (generateApa as unknown as Action)({ offer_id: offerId }, actor);
    const draftsBefore = documenso.states.size;

    expect(await send(dealId)).toEqual({
      ok: false,
      refusal:
        "Waiting on buyer's counsel and seller's counsel to approve version 1.",
    });
    expect((await signing(dealId)).signing_document_id).toBeNull();
    expect(documenso.states.size).toBe(draftsBefore);
  });

  it('drafts the signature request in Documenso once counsel on both sides approve, and says where to place fields', async () => {
    const dealId = await newDeal('Approved APA deal');
    const offerId = await acceptedOffer(dealId, 1_180_000);
    await adoptFinancials(dealId);
    await (updateDealStage as unknown as Action)(
      { deal_id: dealId, stage: 'loi_accepted' },
      actor,
    );
    await (generateApa as unknown as Action)({ offer_id: offerId }, actor);

    const sent = await sendApproved(dealId);

    const requested = await signing(dealId);
    expect(requested.signing_document_id).toMatch(/^envelope_[0-9a-f]{16}$/);
    expect(documenso.states.get(requested.signing_document_id!)).toBe('draft');
    expect(sent).toEqual({
      ok: true,
      value: {
        editorUrl: documenso.editorUrlOf(requested.signing_document_id!),
      },
    });
    expect(requested.stage).toBe('loi_accepted');
  });

  it('drafts the signature request when sign-off was overridden', async () => {
    const dealId = await newDeal('Overridden APA deal');
    const offerId = await acceptedOffer(dealId, 1_170_000);
    await adoptFinancials(dealId);
    await (updateDealStage as unknown as Action)(
      { deal_id: dealId, stage: 'loi_accepted' },
      actor,
    );
    await (generateApa as unknown as Action)({ offer_id: offerId }, actor);
    await account.admin
      .from('contract_signing_override')
      .insert({
        account_id: account.accountId,
        contract_version_id: (await signing(dealId)).id,
        reason: 'Counsel approved by phone',
        overridden_by: account.userId,
      })
      .throwOnError();

    expect(await send(dealId)).toMatchObject({ ok: true });
    expect((await signing(dealId)).signing_status).toBe('draft');
  });

  it('adds a new version to the same contract when generated again before sending, and review starts over on it', async () => {
    const dealId = await newDeal('Regenerated APA deal');
    const offerId = await acceptedOffer(dealId, 1_150_000);
    await adoptFinancials(dealId);
    await (updateDealStage as unknown as Action)(
      { deal_id: dealId, stage: 'loi_accepted' },
      actor,
    );
    await (generateApa as unknown as Action)({ offer_id: offerId }, actor);
    const [first] = await apaVersions(dealId);
    for (const side of ['buyer', 'seller'] as const) {
      await account.admin
        .from('contract_review_decision')
        .insert({
          account_id: account.accountId,
          contract_version_id: first!,
          side,
          decision: 'approved',
          decided_by: counselUserIds[side],
          without_counsel: false,
        })
        .throwOnError();
    }

    const regenerated = await (generateApa as unknown as Action)(
      { offer_id: offerId },
      actor,
    );

    const { data: versions } = await account.admin
      .from('contract_version')
      .select('id, version, contract_id, contract!inner(deal_id)')
      .eq('contract.deal_id', dealId)
      .order('version')
      .throwOnError();
    expect(versions.map((version) => version.version)).toEqual([1, 2]);
    expect(new Set(versions.map((version) => version.contract_id)).size).toBe(
      1,
    );
    expect(regenerated).toEqual({
      ok: true,
      value: { contractVersionId: versions[1]!.id },
    });
    expect(
      await (sendContractForSignature as unknown as Action)(
        { contract_version_id: versions[1]!.id, signers: SIGNERS },
        actor,
      ),
    ).toEqual({
      ok: false,
      refusal:
        "Waiting on buyer's counsel and seller's counsel to approve version 2.",
    });
  });

  it('refuses to send a version again while its signature request is in progress', async () => {
    const dealId = await newDeal('Resent APA deal');
    const offerId = await acceptedOffer(dealId, 1_160_000);
    await adoptFinancials(dealId);
    await (updateDealStage as unknown as Action)(
      { deal_id: dealId, stage: 'loi_accepted' },
      actor,
    );
    await (generateApa as unknown as Action)({ offer_id: offerId }, actor);
    await sendApproved(dealId);
    const draftsBefore = documenso.states.size;

    expect(await send(dealId)).toEqual({
      ok: false,
      refusal: 'A signature request for this APA is already in progress',
    });
    expect(documenso.states.size).toBe(draftsBefore);
  });

  it('advances the deal to pa_submitted when Documenso reports the envelope sent, then to pa_accepted and signed when it completes', async () => {
    const dealId = await newDeal('Signed APA deal');
    const offerId = await acceptedOffer(dealId, 1_100_000);
    await adoptFinancials(dealId);
    await (updateDealStage as unknown as Action)(
      { deal_id: dealId, stage: 'loi_accepted' },
      actor,
    );
    await (generateApa as unknown as Action)({ offer_id: offerId }, actor);
    await sendApproved(dealId);
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
      await (generateApa as unknown as Action)({ offer_id: offerId }, actor);
      await sendApproved(dealId);
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

      await (generateApa as unknown as Action)({ offer_id: offerId }, actor);
      await sendApproved(dealId);
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
    await (generateApa as unknown as Action)({ offer_id: offerId }, actor);
    await sendApproved(dealId);
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
    await (generateApa as unknown as Action)({ offer_id: offerId }, actor);
    await sendApproved(dealId);
    const first = await signing(dealId);
    await documensoReports(first.signing_document_id!, 'rejected');
    await (generateApa as unknown as Action)({ offer_id: offerId }, actor);
    await sendApproved(dealId);
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

    await (generateApa as unknown as Action)({ offer_id: offerId }, actor);
    await sendApproved(dealId);
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
      await (generateApa as unknown as Action)({ offer_id: offerId }),
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
      await (generateApa as unknown as Action)({ offer_id: offerId }),
    ).toEqual({
      ok: false,
      refusal: 'A signature request for this APA is already in progress',
    });

    await documensoReports(requested.signing_document_id!, 'completed');

    expect(
      await (generateApa as unknown as Action)({ offer_id: offerId }),
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
      await (generateApa as unknown as Action)({ offer_id: offerId }, actor);
      await sendApproved(dealId);
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
      await (generateApa as unknown as Action)({ offer_id: offerId }),
    ).toEqual({
      ok: false,
      refusal: 'An APA can be generated once the LOI is accepted',
    });
  });
  it.each(['buyer', 'seller'] as const)(
    'refuses to generate an APA, and so to send it for signature, without %s counsel',
    async (side) => {
      const dealId = await newDeal(`APA without ${side} counsel deal`);
      const offerId = await acceptedOffer(dealId, 940_000);
      await adoptFinancials(dealId);
      await (updateDealStage as unknown as Action)(
        { deal_id: dealId, stage: 'loi_accepted' },
        actor,
      );
      await removeCounsel(dealId, side);
      const draftsBefore = documenso.states.size;

      expect(
        await (generateApa as unknown as Action)({ offer_id: offerId }),
      ).toEqual({ ok: false, refusal: APA_NEEDS_COUNSEL });
      expect(await apaVersions(dealId)).toEqual([]);
      expect(documenso.states.size).toBe(draftsBefore);
    },
  );

  it('keeps an existing APA when counsel is removed, and refuses a new one until that side has counsel again', async () => {
    const dealId = await newDeal('Counsel removed mid-APA deal');
    const offerId = await acceptedOffer(dealId, 930_000);
    await adoptFinancials(dealId);
    await (updateDealStage as unknown as Action)(
      { deal_id: dealId, stage: 'loi_accepted' },
      actor,
    );
    await (generateApa as unknown as Action)({ offer_id: offerId }, actor);
    await sendApproved(dealId);
    const first = await signing(dealId);
    await documensoReports(first.signing_document_id!, 'rejected');

    await removeCounsel(dealId, 'seller');

    expect(await apaVersions(dealId)).toEqual([first.id]);
    expect(
      await (generateApa as unknown as Action)({ offer_id: offerId }),
    ).toEqual({ ok: false, refusal: APA_NEEDS_COUNSEL });

    await seedCounsel(dealId, 'seller');

    expect(
      await (generateApa as unknown as Action)({ offer_id: offerId }),
    ).toMatchObject({ ok: true });
    expect(await apaVersions(dealId)).toHaveLength(2);
  });
});

describe('createContract (integration)', () => {
  it('refuses to create an APA without counsel on both sides, and creates one once both are on the deal', async () => {
    const dealId = await newDeal('Create APA counsel deal');
    await removeCounsel(dealId, 'buyer');

    expect(
      await (createContract as unknown as Action)({ dealId, type: 'apa' }, actor),
    ).toEqual({ ok: false, refusal: APA_NEEDS_COUNSEL });

    const { data: refused } = await account.admin
      .from('contract')
      .select('id')
      .eq('deal_id', dealId)
      .throwOnError();
    expect(refused).toEqual([]);

    await seedCounsel(dealId, 'buyer');
    const contractId = ((await (createContract as unknown as Action)(
      { dealId, type: 'apa' },
      actor,
    )) as { value: string }).value;

    const { data: created } = await account.admin
      .from('contract')
      .select('id, type')
      .eq('deal_id', dealId)
      .throwOnError();
    expect(created).toEqual([{ id: contractId, type: 'apa' }]);
  });

  it('creates an LOI with no counsel on the deal', async () => {
    const dealId = await newDeal('Create LOI no counsel deal');
    await removeCounsel(dealId, 'buyer');
    await removeCounsel(dealId, 'seller');

    const contractId = ((await (createContract as unknown as Action)(
      { dealId, type: 'loi' },
      actor,
    )) as { value: string }).value;

    const { data: created } = await account.admin
      .from('contract')
      .select('id, type')
      .eq('deal_id', dealId)
      .throwOnError();
    expect(created).toEqual([{ id: contractId, type: 'loi' }]);
  });
});

describe('APA counsel gate after the APA has started', () => {
  it('completes an APA sent while counsel were on the deal even after counsel are removed: signed, filed, and the deal at pa_accepted', async () => {
    const dealId = await newDeal('Signed after counsel left deal');
    const offerId = await acceptedOffer(dealId, 920_000);
    await adoptFinancials(dealId);
    await (updateDealStage as unknown as Action)(
      { deal_id: dealId, stage: 'loi_accepted' },
      actor,
    );
    await (generateApa as unknown as Action)({ offer_id: offerId }, actor);
    await sendApproved(dealId);
    const requested = await signing(dealId);
    await documensoReports(requested.signing_document_id!, 'sent');
    await removeCounsel(dealId, 'seller');

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

  it.each([
    ['uploaded', newVersionFromUpload],
    ['saved from the editor', newVersionFromEditorSave],
  ])(
    'refuses a new APA version %s while a side has no counsel, keeping the existing versions',
    async (_label, action) => {
      const dealId = await newDeal('APA version without counsel deal');
      const offerId = await acceptedOffer(dealId, 910_000);
      await adoptFinancials(dealId);
      await (updateDealStage as unknown as Action)(
        { deal_id: dealId, stage: 'loi_accepted' },
        actor,
      );
      await (generateApa as unknown as Action)({ offer_id: offerId }, actor);
      await sendApproved(dealId);
      const first = await signing(dealId);
      const { data: version } = await account.admin
        .from('contract_version')
        .select('contract_id')
        .eq('id', first.id)
        .single()
        .throwOnError();
      await removeCounsel(dealId, 'buyer');

      await expect(
        (action as unknown as Action)(
          {
            contractId: version.contract_id,
            docxBytes: new Uint8Array([80, 75, 3, 4]),
            party: 'buyer',
          },
          actor,
        ),
      ).rejects.toThrow(APA_NEEDS_COUNSEL);
      expect(await apaVersions(dealId)).toEqual([first.id]);
    },
  );

  it('adds a new LOI version with no counsel on the deal', async () => {
    const dealId = await newDeal('LOI version no counsel deal');
    await removeCounsel(dealId, 'buyer');
    await removeCounsel(dealId, 'seller');
    const contractId = ((await (createContract as unknown as Action)(
      { dealId, type: 'loi' },
      actor,
    )) as { value: string }).value;

    await (newVersionFromUpload as unknown as Action)(
      {
        contractId,
        docxBytes: new Uint8Array([80, 75, 3, 4]),
        party: 'seller',
      },
      actor,
    );

    const { data: versions } = await account.admin
      .from('contract_version')
      .select('version, party')
      .eq('contract_id', contractId)
      .throwOnError();
    expect(versions).toEqual([{ version: 1, party: 'seller' }]);
  });
});
