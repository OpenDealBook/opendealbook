import type { SupabaseClient } from '@supabase/supabase-js';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  DocumensoRejected,
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

vi.mock('@odb/contracts/esign', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@odb/contracts/esign')>()),
  createDocumensoClient: () => documenso.client,
}));

import {
  adoptCalcVersion,
  createCalcVersion,
  saveDealCalc,
} from './calc-actions';
import {
  checkContractSignatureStatus,
  sendContractForSignature,
} from './contract-signature-actions';
import { createDealCore } from './deal-actions';
import { generateLoi } from './loi-actions';
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
    terms: {
      schema_version: 1,
      purchase_price: price,
    },
  };
}

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

async function signing(dealId: string) {
  const { data: contract } = await account.admin
    .from('contract')
    .select('id')
    .eq('deal_id', dealId)
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

async function signedContractFolders(dealId: string) {
  const { data } = await account.admin
    .from('dr_folder')
    .select('id, name, parent_id')
    .eq('deal_id', dealId)
    .ilike('name', 'signed contracts')
    .throwOnError();
  return data;
}

function generate(offerId: string) {
  return (generateLoi as unknown as Action)({ offer_id: offerId });
}

async function send(dealId: string) {
  const { id } = await signing(dealId);

  return (sendContractForSignature as unknown as Action)(
    { contract_version_id: id, signers: SIGNERS },
    actor,
  );
}

async function loiReady(description: string) {
  const dealId = await newDeal(description);
  const offerId = await acceptedOffer(dealId, 900_000);
  await adoptFinancials(dealId);

  return { dealId, offerId };
}

async function generatedLoi(description: string) {
  const { dealId, offerId } = await loiReady(description);
  await generate(offerId);
  await send(dealId);

  return dealId;
}

async function contractsOf(dealId: string) {
  const { data } = await account.admin
    .from('contract')
    .select('id, versions:contract_version(id)')
    .eq('deal_id', dealId)
    .throwOnError();
  return data;
}

beforeAll(async () => {
  account = await provisionAccount();
  holder.client = account.user;
  holder.admin = account.admin;
  holder.userId = account.userId;
  actor = { id: account.userId };
  process.env.DOCUMENSO_URL = 'https://sign.test';
  process.env.DOCUMENSO_API_KEY = 'api_test';
  await seedLoiTemplate();
});

afterAll(async () => {
  await account.cleanup();
});

describe('generateLoi (integration)', () => {
  it('renders the loi as a new version, drafting no signature request, while the deal stays at loi_submitted', async () => {
    const dealId = await newDeal('Generate LOI deal');
    const offerId = await acceptedOffer(dealId, 900_000);
    await adoptFinancials(dealId);

    const { data: accepted } = await account.admin
      .from('offer')
      .select('current_version_id')
      .eq('id', offerId)
      .single();

    const draftsBefore = documenso.states.size;
    const generated = await (generateLoi as unknown as Action)(
      { offer_id: offerId },
      actor,
    );

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

    expect(generated).toEqual({
      ok: true,
      value: { contractVersionId: versions?.[0]?.id },
    });
    expect((await signing(dealId)).signing_document_id).toBeNull();
    expect(documenso.states.size).toBe(draftsBefore);

    const { data: deal } = await account.admin
      .from('deal')
      .select('stage')
      .eq('id', dealId)
      .single();

    expect(deal?.stage).toBe('loi_submitted');
  });

  it('drafts the signature request for the loi, which needs no counsel sign-off, and says where to place fields', async () => {
    const { dealId, offerId } = await loiReady('Sent for signature LOI deal');
    await generate(offerId);

    const sent = await send(dealId);

    const requested = await signing(dealId);
    expect(requested.signing_document_id).toMatch(/^envelope_[0-9a-f]{16}$/);
    expect(documenso.states.get(requested.signing_document_id!)).toBe('draft');
    expect(sent).toEqual({
      ok: true,
      value: {
        editorUrl: documenso.editorUrlOf(requested.signing_document_id!),
      },
    });
    expect(requested.stage).toBe('loi_submitted');
  });

  it('says so when Documenso does not accept the signature request, recording no draft', async () => {
    const { dealId, offerId } = await loiReady('Rejected request LOI deal');
    await generate(offerId);
    const { createDraft } = documenso.client;
    documenso.client.createDraft = async () => {
      throw new DocumensoRejected('Documenso responded with 400');
    };

    try {
      expect(await send(dealId)).toEqual({
        ok: false,
        refusal:
          'Documenso did not accept the signature request. Check the signers and try again',
      });
    } finally {
      documenso.client.createDraft = createDraft;
    }
    expect((await signing(dealId)).signing_document_id).toBeNull();
  });

  it('logs the generated LOI as an added version', async () => {
    const dealId = await newDeal('Generated LOI event deal');
    const offerId = await acceptedOffer(dealId, 900_000);
    await adoptFinancials(dealId);

    await (generateLoi as unknown as Action)({ offer_id: offerId }, actor);

    const { data: version } = await account.admin
      .from('contract_version')
      .select('id, contract!inner(deal_id)')
      .eq('contract.deal_id', dealId)
      .single()
      .throwOnError();
    const { data: events } = await account.admin
      .from('deal_event')
      .select('event_type, payload')
      .eq('deal_id', dealId)
      .eq('event_type', 'contract.version_added')
      .throwOnError();
    expect(events).toEqual([
      {
        event_type: 'contract.version_added',
        payload: { version_id: version.id },
      },
    ]);
  });

  it('leaves the deal and the version alone when Documenso reports the envelope sent', async () => {
    const dealId = await generatedLoi('Sent LOI deal');
    const { signing_document_id: documentId } = await signing(dealId);

    await documensoReports(documentId!, 'sent');

    expect(await signing(dealId)).toMatchObject({
      is_signed: false,
      signing_status: 'sent',
      stage: 'loi_submitted',
    });
  });

  it.each([
    ['rejected', 'declined'],
    ['expired', 'expired'],
  ] as const)(
    'records an LOI whose envelope is %s as %s and leaves the deal at loi_submitted',
    async (state, status) => {
      const dealId = await generatedLoi(`LOI ${state} deal`);
      const { signing_document_id: documentId } = await signing(dealId);

      await documensoReports(documentId!, state);

      expect(await signing(dealId)).toMatchObject({
        is_signed: false,
        signing_status: status,
        stage: 'loi_submitted',
      });
    },
  );

  it('marks the version signed and advances the deal to loi_accepted once Documenso reports the envelope completed', async () => {
    const dealId = await generatedLoi('Completed LOI deal');
    const { signing_document_id: documentId } = await signing(dealId);

    await documensoReports(documentId!, 'completed');
    await documensoReports(documentId!, 'completed');

    expect(await signing(dealId)).toMatchObject({
      is_signed: true,
      stage: 'loi_accepted',
    });
    const { data: stageEvents } = await account.admin
      .from('deal_event')
      .select('payload')
      .eq('deal_id', dealId)
      .eq('event_type', 'deal.stage_changed')
      .contains('payload', { stage: 'loi_accepted' })
      .throwOnError();
    expect(stageEvents).toHaveLength(1);
  });

  it('advances the deal once when the completion is delivered twice at the same moment', async () => {
    const dealId = await generatedLoi('Simultaneous LOI deal');
    const { signing_document_id: documentId } = await signing(dealId);
    documenso.states.set(documentId!, 'completed');

    await Promise.all([
      handleContractSignatureEvent(documentId!, {
        client: account.admin,
        admin: account.admin,
        documenso: documenso.client,
      }),
      handleContractSignatureEvent(documentId!, {
        client: account.admin,
        admin: account.admin,
        documenso: documenso.client,
      }),
    ]);

    expect(await signing(dealId)).toMatchObject({
      is_signed: true,
      stage: 'loi_accepted',
    });
    const { data: stageEvents } = await account.admin
      .from('deal_event')
      .select('payload')
      .eq('deal_id', dealId)
      .eq('event_type', 'deal.stage_changed')
      .contains('payload', { stage: 'loi_accepted' })
      .throwOnError();
    expect(stageEvents).toHaveLength(1);
  });

  it('applies what Documenso reports when our team checks the status of the contract version', async () => {
    const dealId = await generatedLoi('Checked LOI deal');
    const requested = await signing(dealId);
    documenso.states.set(requested.signing_document_id!, 'completed');

    await (checkContractSignatureStatus as unknown as Action)({
      contract_version_id: requested.id,
    });

    expect(await signing(dealId)).toMatchObject({
      is_signed: true,
      stage: 'loi_accepted',
    });
  });

  it('refuses to check with a clear message when Documenso is not configured', async () => {
    const dealId = await generatedLoi('Unconfigured check deal');
    const requested = await signing(dealId);
    delete process.env.DOCUMENSO_API_KEY;

    expect(
      await (checkContractSignatureStatus as unknown as Action)({
        contract_version_id: requested.id,
      }),
    ).toEqual({
      ok: false,
      refusal: 'E-signature is not set up yet: Documenso is not configured',
    });

    process.env.DOCUMENSO_API_KEY = 'api_test';
  });

  it('tells someone who cannot see the contract version that it was not found', async () => {
    expect(
      await (checkContractSignatureStatus as unknown as Action)({
        contract_version_id: crypto.randomUUID(),
      }),
    ).toEqual({ ok: false, refusal: 'That contract was not found' });
  });

  it('files the signed LOI once in a "Signed contracts" folder at the top of the data room', async () => {
    const dealId = await generatedLoi('Filed LOI deal');
    const requested = await signing(dealId);

    await documensoReports(requested.signing_document_id!, 'completed');
    await documensoReports(requested.signing_document_id!, 'completed');

    const folders = await signedContractFolders(dealId);
    expect(folders).toEqual([
      { id: expect.any(String), name: 'Signed contracts', parent_id: null },
    ]);
    const { data: filed } = await account.admin
      .from('dr_document')
      .select('id, name, version, storage_path')
      .eq('folder_id', folders[0]!.id)
      .throwOnError();
    expect(filed).toEqual([
      {
        id: requested.id,
        name: 'LOI (signed).pdf',
        version: 1,
        storage_path: `deal/${dealId}/${requested.id}-signed.pdf`,
      },
    ]);
    const stored = await account.admin.storage
      .from('data-room')
      .download(filed[0]!.storage_path);
    expect(await stored.data?.text()).toBe(
      `%PDF-1.7 signed ${requested.signing_document_id}`,
    );
    const { data: documentEvents } = await account.admin
      .from('deal_event')
      .select('actor_kind')
      .eq('aggregate_id', requested.id)
      .eq('event_type', 'dr_document.added')
      .throwOnError();
    expect(documentEvents).toEqual([{ actor_kind: 'service' }]);
  });

  it('uses a top-level folder already named "signed contracts" in any letter case', async () => {
    const dealId = await generatedLoi('Existing folder LOI deal');
    const requested = await signing(dealId);
    const { data: existing } = await account.admin
      .from('dr_folder')
      .insert({
        account_id: account.accountId,
        deal_id: dealId,
        name: 'SIGNED contracts',
      })
      .select('id')
      .single()
      .throwOnError();

    await documensoReports(requested.signing_document_id!, 'completed');

    expect((await signedContractFolders(dealId)).map((f) => f.id)).toEqual([
      existing.id,
    ]);
    const { data: filed } = await account.admin
      .from('dr_document')
      .select('folder_id')
      .eq('id', requested.id)
      .single()
      .throwOnError();
    expect(filed.folder_id).toBe(existing.id);
  });

  it('files nothing and leaves the completion to be retried when what Documenso returns is not a PDF', async () => {
    const dealId = await generatedLoi('Bad PDF LOI deal');
    const requested = await signing(dealId);
    documenso.signedPdf.override = '<html>Sign in</html>';

    await expect(
      documensoReports(requested.signing_document_id!, 'completed'),
    ).rejects.toThrow('Documenso returned a signed file that is not a PDF');
    documenso.signedPdf.override = null;

    expect(await signedContractFolders(dealId)).toEqual([]);
    expect((await signing(dealId)).signing_status).toBe('draft');

    await documensoReports(requested.signing_document_id!, 'completed');

    expect(await signedContractFolders(dealId)).toHaveLength(1);
    expect((await signing(dealId)).signing_status).toBe('completed');
  });

  it('files the signed copy when our team checks the status, though the check runs as that person', async () => {
    const dealId = await generatedLoi('Checked and filed LOI deal');
    const requested = await signing(dealId);
    documenso.states.set(requested.signing_document_id!, 'completed');

    expect(
      await (checkContractSignatureStatus as unknown as Action)({
        contract_version_id: requested.id,
      }),
    ).toEqual({ ok: true, value: undefined });

    const { data: filed } = await account.admin
      .from('dr_document')
      .select('name')
      .eq('id', requested.id)
      .throwOnError();
    expect(filed).toEqual([{ name: 'LOI (signed).pdf' }]);
  });

  describe('generating again for the same offer', () => {
    it('adds a new version to the same contract while the earlier one was never sent', async () => {
      const { dealId, offerId } = await loiReady('Regenerated unsent LOI');
      await generate(offerId);

      const regenerated = await generate(offerId);

      const contracts = await contractsOf(dealId);
      expect(contracts).toHaveLength(1);
      const { data: versions } = await account.admin
        .from('contract_version')
        .select('id, version, pdf_path')
        .eq('contract_id', contracts[0]!.id)
        .order('version')
        .throwOnError();
      expect(versions.map((version) => version.version)).toEqual([1, 2]);
      expect(versions[1]!.pdf_path).toBe(
        `${account.accountId}/${contracts[0]!.id}/v2.pdf`,
      );
      expect(regenerated).toEqual({
        ok: true,
        value: { contractVersionId: versions[1]!.id },
      });
    });

    it('refuses the loser politely when two people generate a new version at the same moment, adding it once', async () => {
      const { dealId, offerId } = await loiReady('Raced regenerate LOI');
      await generate(offerId);

      const outcomes = await Promise.all([generate(offerId), generate(offerId)]);

      expect(outcomes).toContainEqual({
        ok: false,
        refusal: 'Someone just generated a new version. Refresh to see it.',
      });
      expect(outcomes).toContainEqual({
        ok: true,
        value: { contractVersionId: expect.any(String) },
      });
      const contracts = await contractsOf(dealId);
      expect(contracts).toHaveLength(1);
      expect(contracts[0]!.versions).toHaveLength(2);
      const { data: added } = await account.admin
        .from('deal_event')
        .select('id')
        .eq('deal_id', dealId)
        .eq('event_type', 'contract.version_added')
        .throwOnError();
      expect(added).toHaveLength(2);
    });

    const IN_PROGRESS = {
      ok: false,
      refusal: 'A signature request for this LOI is already in progress',
    };

    it.each(['draft', 'sent'] as const)(
      'is refused, writing nothing, while the request is %s in Documenso',
      async (state) => {
        const { dealId, offerId } = await loiReady(`Repeat ${state} LOI`);
        await generate(offerId);
        await send(dealId);
        const requested = await signing(dealId);
        documenso.states.set(requested.signing_document_id!, state);

        expect(await generate(offerId)).toEqual(IN_PROGRESS);

        expect(await contractsOf(dealId)).toHaveLength(1);
        expect(documenso.states.size).toBeGreaterThan(0);
      },
    );

    it('is refused once the LOI has been signed', async () => {
      const { dealId, offerId } = await loiReady('Repeat signed LOI');
      await generate(offerId);
      await send(dealId);
      const requested = await signing(dealId);
      await documensoReports(requested.signing_document_id!, 'completed');

      expect(await generate(offerId)).toEqual({
        ok: false,
        refusal: 'This LOI has already been signed',
      });

      expect(await contractsOf(dealId)).toHaveLength(1);
    });

    it.each(['rejected', 'expired'] as const)(
      'is allowed after the earlier request was %s',
      async (state) => {
        const { dealId, offerId } = await loiReady(`Repeat ${state} LOI`);
        await generate(offerId);
        await send(dealId);
        const requested = await signing(dealId);
        await documensoReports(requested.signing_document_id!, state);

        expect(await generate(offerId)).toMatchObject({ ok: true });

        expect(await contractsOf(dealId)).toHaveLength(2);
      },
    );

    it('is allowed when our record still says draft but the draft is gone from Documenso', async () => {
      const { dealId, offerId } = await loiReady('Repeat deleted LOI');
      await generate(offerId);
      await send(dealId);
      const requested = await signing(dealId);
      documenso.states.delete(requested.signing_document_id!);

      expect(await generate(offerId)).toMatchObject({ ok: true });

      const { data: first } = await account.admin
        .from('contract_version')
        .select('signing_status')
        .eq('id', requested.id)
        .single()
        .throwOnError();
      expect(first.signing_status).toBe('declined');
      expect(await contractsOf(dealId)).toHaveLength(2);
    });

    it('ends with one contract version and no draft when two requests arrive at the same moment', async () => {
      const { dealId, offerId } = await loiReady('Simultaneous generate LOI');
      const draftsBefore = documenso.states.size;

      const outcomes = await Promise.all([
        generate(offerId),
        generate(offerId),
      ]);

      expect(
        outcomes.map((outcome) => (outcome as { ok: boolean }).ok).sort(),
      ).toEqual([false, true]);
      expect(outcomes).toContainEqual(IN_PROGRESS);
      expect(await contractsOf(dealId)).toEqual([
        { id: expect.any(String), versions: [{ id: expect.any(String) }] },
      ]);
      expect(documenso.states.size).toBe(draftsBefore);
    });
  });

  it('rejects when the deal has no adopted financials (deal box screen fails)', async () => {
    const dealId = await newDeal('Unscreened deal');
    const offerId = await acceptedOffer(dealId, 800_000);

    expect(
      await (generateLoi as unknown as Action)({ offer_id: offerId }),
    ).toEqual({
      ok: false,
      refusal: 'This deal has not passed the deal box screen',
    });
  });

  it('rejects when the offer is not accepted', async () => {
    const dealId = await newDeal('Unaccepted deal');
    const offerId = ((await (createOffer as unknown as Action)(
      { deal_id: dealId, first_version: firstVersion(700_000) },
      actor,
    )) as { value: string }).value;
    await (submitOffer as unknown as Action)({ offer_id: offerId }, actor);
    await adoptFinancials(dealId);

    expect(
      await (generateLoi as unknown as Action)({ offer_id: offerId }),
    ).toEqual({ ok: false, refusal: 'This offer has not been accepted yet' });
  });
});
