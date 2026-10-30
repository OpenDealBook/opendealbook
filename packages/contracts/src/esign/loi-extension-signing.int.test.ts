import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Json } from '@odb/supabase';

import {
  ANON_KEY,
  SERVICE_ROLE_KEY,
  SUPABASE_URL,
} from '../../../features/seller-rooms/src/test-support/world.ts';

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON_KEY);
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY);

const { admin, cleanUp, newDeal, provisionPerson, provisionTeam } =
  await import('../../../features/seller-rooms/src/test-support/world.ts');
const { createSupabaseContractStorage } = await import('../storage');
const { recordExternalSignature } = await import('./external-signature');
const {
  deterministicUuid,
  handleContractSignatureEvent,
  recordExtensionAgreed,
  requestContractSignature,
} = await import('./documenso');

type DocumensoClient = import('./documenso').DocumensoClient;
type Person = Awaited<ReturnType<typeof provisionPerson>>;

const LOI_SIGNED_ON = '2026-10-02';
const EXCLUSIVITY_ENDS_ON = '2026-11-01';
const EXTENDED_TO = '2026-12-01';
const EXTENSION_SIGNED_ON = '2026-10-20';
const LOI_PDF = new TextEncoder().encode('%PDF-1.7 LOI signed on paper');
const EXTENSION_PDF = new TextEncoder().encode('%PDF-1.7 extension signed');

let owner: Person;
let teamId: string;

beforeAll(async () => {
  owner = await provisionPerson();
  teamId = await provisionTeam(owner, 'Extension Signers');
});

afterAll(async () => {
  await cleanUp([teamId]);
});

const documenso = {
  signatureState: async () => ({
    state: 'completed' as const,
    completedOn: EXTENSION_SIGNED_ON,
  }),
  downloadSignedPdf: async () => EXTENSION_PDF,
  deleteDraft: async () => undefined,
  cancelSent: async () => undefined,
} as unknown as DocumensoClient;

function append(
  dealId: string,
  aggregateType: string,
  aggregateId: string,
  eventType: string,
  payload: Json,
) {
  return admin
    .rpc('append_deal_event', {
      p_deal_id: dealId,
      p_aggregate_type: aggregateType,
      p_aggregate_id: aggregateId,
      p_event_type: eventType,
      p_payload: payload,
      p_actor_kind: 'service',
    })
    .throwOnError();
}

function recordSignedCopy(
  dealId: string,
  type: 'loi' | 'loi_extension',
  contractId: string | null,
  signedOn: string,
  bytes: Uint8Array,
  loisSigned: unknown[] = [],
) {
  return recordExternalSignature(
    {
      dealId,
      type,
      contractId,
      party: 'buyer',
      signedOn,
      copy: { bytes, kind: 'pdf' },
    },
    {
      client: owner.client,
      admin,
      documenso,
      storage: createSupabaseContractStorage(owner.client),
      authorUserId: owner.userId,
      onLoiSigned: async (loi) => {
        loisSigned.push(loi);
      },
    },
  );
}

async function dealWithSignedLoi(
  exclusivityEndsOn: string | null = EXCLUSIVITY_ENDS_ON,
) {
  const dealId = await newDeal(teamId, owner);
  await append(dealId, 'deal', dealId, 'deal.stage_changed', {
    stage: 'loi_submitted',
  });
  const loiVersionId = await recordSignedCopy(
    dealId,
    'loi',
    null,
    LOI_SIGNED_ON,
    LOI_PDF,
  );
  const { data: loi } = await admin
    .from('contract_version')
    .select('contract_id')
    .eq('id', loiVersionId)
    .single()
    .throwOnError();
  if (exclusivityEndsOn !== null) {
    await append(
      dealId,
      'deal_milestone',
      crypto.randomUUID(),
      'deal_milestone.set',
      {
        kind: 'exclusivity_end',
        target_on: exclusivityEndsOn,
        actual_on: null,
      },
    );
  }
  await append(dealId, 'deal', dealId, 'deal.stage_changed', {
    stage: 'loi_submitted',
  });

  return { dealId, loiId: loi.contract_id };
}

async function extensionOf(dealId: string, loiId: string, extendsTo: string) {
  const extensionId = crypto.randomUUID();
  await append(dealId, 'contract', extensionId, 'contract.created', {
    type: 'loi_extension',
    status: 'draft',
    current_version: 0,
    parent_contract_id: loiId,
    extends_to: extendsTo,
  });

  return extensionId;
}

async function sentForSignature(dealId: string, extensionId: string) {
  const { data: version } = await admin
    .from('contract_version')
    .insert({
      contract_id: extensionId,
      account_id: teamId,
      version: 1,
      source: 'generated',
      party: 'buyer',
    })
    .select('id')
    .single()
    .throwOnError();
  const documentId = `envelope_${version.id}`;
  await append(
    dealId,
    'contract',
    extensionId,
    'contract.signature_requested',
    {
      version_id: version.id,
      signing_document_id: documentId,
    },
  );

  return { versionId: version.id, documentId };
}

function completedInDocumenso(documentId: string, loisSigned: unknown[] = []) {
  return handleContractSignatureEvent(documentId, {
    client: admin,
    admin,
    documenso,
    onLoiSigned: async (loi) => {
      loisSigned.push(loi);
    },
  });
}

async function exclusivityEnd(dealId: string) {
  const { data } = await admin
    .from('deal_milestone')
    .select('target_on, actual_on, shared')
    .eq('deal_id', dealId)
    .eq('kind', 'exclusivity_end')
    .single()
    .throwOnError();

  return data;
}

async function deal(dealId: string) {
  const [{ data: stage }, { data: loiSigned }] = await Promise.all([
    admin.from('deal').select('stage').eq('id', dealId).single().throwOnError(),
    admin
      .from('deal_milestone')
      .select('actual_on')
      .eq('deal_id', dealId)
      .eq('kind', 'loi_signed')
      .single()
      .throwOnError(),
  ]);

  return { stage: stage.stage, loiSignedOn: loiSigned.actual_on };
}

async function timelineRows(dealId: string) {
  const { data } = await admin
    .from('deal_milestone')
    .select('label, actual_on, shared')
    .eq('deal_id', dealId)
    .eq('kind', 'custom')
    .order('label')
    .throwOnError();

  return data;
}

async function filedCopies(dealId: string) {
  const { data } = await admin
    .from('dr_document')
    .select('id, name, folder:folder_id (name)')
    .eq('deal_id', dealId)
    .order('name')
    .throwOnError();

  return data;
}

const LOI_ROW = {
  label: 'LOI v1 signed',
  actual_on: LOI_SIGNED_ON,
  shared: false,
};
const EXTENSION_ROW = {
  label: 'LOI extension to Dec 1, 2026',
  actual_on: EXTENSION_SIGNED_ON,
  shared: true,
};

async function extensionRowEvents(dealId: string) {
  const { data } = await admin
    .from('deal_event')
    .select('payload')
    .eq('deal_id', dealId)
    .eq('event_type', 'deal_milestone.set')
    .eq('payload->>kind', 'custom')
    .like('payload->>label', 'LOI extension%')
    .throwOnError();

  return data.map(({ payload }) => payload);
}

async function editExclusivityEnd(dealId: string, targetOn: string) {
  const { data: end } = await admin
    .from('deal_milestone')
    .select('id')
    .eq('deal_id', dealId)
    .eq('kind', 'exclusivity_end')
    .single()
    .throwOnError();
  await append(dealId, 'deal_milestone', end.id, 'deal_milestone.set', {
    kind: 'exclusivity_end',
    target_on: targetOn,
    actual_on: null,
  });
}

describe('signing an LOI extension', () => {
  it('in Documenso moves the end of exclusivity, adds its timeline row and files the signed PDF', async () => {
    const { dealId, loiId } = await dealWithSignedLoi();
    const extensionId = await extensionOf(dealId, loiId, EXTENDED_TO);
    const { versionId, documentId } = await sentForSignature(
      dealId,
      extensionId,
    );

    await completedInDocumenso(documentId);

    expect(await exclusivityEnd(dealId)).toEqual({
      target_on: EXTENDED_TO,
      actual_on: null,
      shared: true,
    });
    expect(await timelineRows(dealId)).toEqual([EXTENSION_ROW, LOI_ROW]);
    expect(await filedCopies(dealId)).toEqual([
      expect.objectContaining({ name: 'LOI (signed).pdf' }),
      {
        id: versionId,
        name: 'LOI extension to 2026-12-01 (signed).pdf',
        folder: { name: 'Signed contracts' },
      },
    ]);
  });

  it('in Documenso leaves the stage and the LOI signed date alone and sets up no diligence', async () => {
    const { dealId, loiId } = await dealWithSignedLoi();
    const extensionId = await extensionOf(dealId, loiId, EXTENDED_TO);
    const { documentId } = await sentForSignature(dealId, extensionId);
    const loisSigned: unknown[] = [];

    await completedInDocumenso(documentId, loisSigned);

    expect(await deal(dealId)).toEqual({
      stage: 'loi_submitted',
      loiSignedOn: LOI_SIGNED_ON,
    });
    expect(loisSigned).toEqual([]);
  });

  it('recorded as signed on paper has the same effects and none of the LOI ones', async () => {
    const { dealId, loiId } = await dealWithSignedLoi();
    const extensionId = await extensionOf(dealId, loiId, EXTENDED_TO);
    const loisSigned: unknown[] = [];

    const versionId = await recordSignedCopy(
      dealId,
      'loi_extension',
      extensionId,
      EXTENSION_SIGNED_ON,
      EXTENSION_PDF,
      loisSigned,
    );

    expect((await exclusivityEnd(dealId)).target_on).toBe(EXTENDED_TO);
    expect(await timelineRows(dealId)).toEqual([EXTENSION_ROW, LOI_ROW]);
    expect(await filedCopies(dealId)).toContainEqual({
      id: versionId,
      name: 'LOI extension to 2026-12-01 (signed).pdf',
      folder: { name: 'Signed contracts' },
    });
    expect(await deal(dealId)).toEqual({
      stage: 'loi_submitted',
      loiSignedOn: LOI_SIGNED_ON,
    });
    expect(loisSigned).toEqual([]);
  });

  it('logs its timeline row with the extension and the end of exclusivity it replaced', async () => {
    const { dealId, loiId } = await dealWithSignedLoi();
    const extensionId = await extensionOf(dealId, loiId, EXTENDED_TO);
    const { documentId } = await sentForSignature(dealId, extensionId);

    await completedInDocumenso(documentId);
    await completedInDocumenso(documentId);

    expect(await extensionRowEvents(dealId)).toEqual([
      expect.objectContaining({
        extension_id: extensionId,
        exclusivity_end_before: EXCLUSIVITY_ENDS_ON,
      }),
    ]);
  });

  it('logs no earlier end of exclusivity when the LOI left it unset', async () => {
    const { dealId, loiId } = await dealWithSignedLoi(null);
    const extensionId = await extensionOf(dealId, loiId, EXTENDED_TO);

    await completedInDocumenso(
      (await sentForSignature(dealId, extensionId)).documentId,
    );

    expect(await extensionRowEvents(dealId)).toEqual([
      expect.objectContaining({
        extension_id: extensionId,
        exclusivity_end_before: null,
      }),
    ]);
  });

  it('sets the end of exclusivity, shared with the seller side, when the LOI left it unset', async () => {
    const { dealId, loiId } = await dealWithSignedLoi(null);
    const extensionId = await extensionOf(dealId, loiId, EXTENDED_TO);
    const { documentId } = await sentForSignature(dealId, extensionId);

    await completedInDocumenso(documentId);

    expect(await exclusivityEnd(dealId)).toEqual({
      target_on: EXTENDED_TO,
      actual_on: null,
      shared: true,
    });
  });

  it('when Documenso repeats the completion leaves one timeline row and one filed copy', async () => {
    const { dealId, loiId } = await dealWithSignedLoi();
    const extensionId = await extensionOf(dealId, loiId, EXTENDED_TO);
    const { documentId } = await sentForSignature(dealId, extensionId);

    await completedInDocumenso(documentId);
    await completedInDocumenso(documentId);

    expect((await exclusivityEnd(dealId)).target_on).toBe(EXTENDED_TO);
    expect(await timelineRows(dealId)).toEqual([EXTENSION_ROW, LOI_ROW]);
    expect(await filedCopies(dealId)).toHaveLength(2);
  });

  it('when an earlier extension completes again after a later one does not pull the end back', async () => {
    const { dealId, loiId } = await dealWithSignedLoi();
    const earlier = await extensionOf(dealId, loiId, EXTENDED_TO);
    const later = await extensionOf(dealId, loiId, '2026-12-20');
    const { documentId: earlierDocument } = await sentForSignature(
      dealId,
      earlier,
    );
    const { documentId: laterDocument } = await sentForSignature(dealId, later);

    await completedInDocumenso(laterDocument);
    await completedInDocumenso(earlierDocument);

    expect((await exclusivityEnd(dealId)).target_on).toBe('2026-12-20');
  });

  it('moves the end on a retry after a run that logged the row and died before moving it', async () => {
    const { dealId, loiId } = await dealWithSignedLoi();
    const extensionId = await extensionOf(dealId, loiId, EXTENDED_TO);
    const { documentId } = await sentForSignature(dealId, extensionId);
    await append(
      dealId,
      'deal_milestone',
      deterministicUuid(`extension milestone:${extensionId}`),
      'deal_milestone.set',
      {
        kind: 'custom',
        label: 'LOI extension to Dec 1, 2026',
        target_on: null,
        actual_on: EXTENSION_SIGNED_ON,
        shared: true,
        extension_id: extensionId,
        exclusivity_end_before: EXCLUSIVITY_ENDS_ON,
      },
    );

    await completedInDocumenso(documentId);

    expect((await exclusivityEnd(dealId)).target_on).toBe(EXTENDED_TO);
  });

  it("keeps the team's edit of the end when Documenso repeats the completion", async () => {
    const { dealId, loiId } = await dealWithSignedLoi();
    const extensionId = await extensionOf(dealId, loiId, EXTENDED_TO);
    const { documentId } = await sentForSignature(dealId, extensionId);
    await completedInDocumenso(documentId);
    await editExclusivityEnd(dealId, '2026-11-20');

    await completedInDocumenso(documentId);

    expect((await exclusivityEnd(dealId)).target_on).toBe('2026-11-20');
  });

  it("keeps the team's edit of the end when an extension that moved nothing completes again", async () => {
    const { dealId, loiId } = await dealWithSignedLoi();
    const earlier = await extensionOf(dealId, loiId, EXTENDED_TO);
    const later = await extensionOf(dealId, loiId, '2026-12-20');
    const { documentId: earlierDocument } = await sentForSignature(
      dealId,
      earlier,
    );
    await completedInDocumenso(
      (await sentForSignature(dealId, later)).documentId,
    );
    await completedInDocumenso(earlierDocument);
    await editExclusivityEnd(dealId, '2026-11-20');

    await completedInDocumenso(earlierDocument);

    expect((await exclusivityEnd(dealId)).target_on).toBe('2026-11-20');
  });

  it("keeps the team's edit of the end when a noted extension's signed copy arrives", async () => {
    const { dealId, loiId } = await dealWithSignedLoi();
    const extensionId = await extensionOf(dealId, loiId, EXTENDED_TO);
    await append(dealId, 'contract', extensionId, 'contract.extension_noted', {
      note: 'Seller agreed by email',
      noted_on: '2026-10-10',
    });
    await recordExtensionAgreed(
      owner.client,
      dealId,
      extensionId,
      '2026-10-10',
    );
    await editExclusivityEnd(dealId, '2026-11-20');

    await recordSignedCopy(
      dealId,
      'loi_extension',
      extensionId,
      EXTENSION_SIGNED_ON,
      EXTENSION_PDF,
    );

    expect((await exclusivityEnd(dealId)).target_on).toBe('2026-11-20');
  });

  it('attaches a signed copy arriving later to the noted extension, keeping its one timeline row', async () => {
    const { dealId, loiId } = await dealWithSignedLoi();
    const extensionId = await extensionOf(dealId, loiId, EXTENDED_TO);
    await append(dealId, 'contract', extensionId, 'contract.extension_noted', {
      note: 'Seller agreed by email',
      noted_on: '2026-10-10',
    });
    await recordExtensionAgreed(
      owner.client,
      dealId,
      extensionId,
      '2026-10-10',
    );

    const versionId = await recordSignedCopy(
      dealId,
      'loi_extension',
      extensionId,
      EXTENSION_SIGNED_ON,
      EXTENSION_PDF,
    );

    const { data: extensions } = await admin
      .from('contract')
      .select('id, note, versions:contract_version (id, is_signed)')
      .eq('deal_id', dealId)
      .eq('type', 'loi_extension')
      .throwOnError();
    expect(extensions).toEqual([
      {
        id: extensionId,
        note: 'Seller agreed by email',
        versions: [{ id: versionId, is_signed: true }],
      },
    ]);
    expect((await exclusivityEnd(dealId)).target_on).toBe(EXTENDED_TO);
    expect(await timelineRows(dealId)).toEqual([
      { ...EXTENSION_ROW, actual_on: '2026-10-10' },
      LOI_ROW,
    ]);
  });

  it('files each extension as its own signed copy, named by the day exclusivity now ends', async () => {
    const { dealId, loiId } = await dealWithSignedLoi();
    const first = await extensionOf(dealId, loiId, EXTENDED_TO);
    const second = await extensionOf(dealId, loiId, '2026-12-20');

    await completedInDocumenso(
      (await sentForSignature(dealId, first)).documentId,
    );
    await completedInDocumenso(
      (await sentForSignature(dealId, second)).documentId,
    );

    const { data: filed } = await admin
      .from('dr_document')
      .select('name, version')
      .eq('deal_id', dealId)
      .like('name', 'LOI extension%')
      .order('name')
      .throwOnError();
    expect(filed).toEqual([
      { name: 'LOI extension to 2026-12-01 (signed).pdf', version: 1 },
      { name: 'LOI extension to 2026-12-20 (signed).pdf', version: 1 },
    ]);
  });

  it('is sent to Documenso titled with the firm and the day exclusivity now ends', async () => {
    const { dealId, loiId } = await dealWithSignedLoi();
    const extensionId = await extensionOf(dealId, loiId, EXTENDED_TO);
    const { data: version } = await admin
      .from('contract_version')
      .insert({
        contract_id: extensionId,
        account_id: teamId,
        version: 1,
        source: 'generated',
        party: 'buyer',
        pdf_path: `extension/${extensionId}.pdf`,
        pdf_bucket: 'contracts',
      })
      .select('id')
      .single()
      .throwOnError();
    const titles: string[] = [];

    await requestContractSignature(
      { contractVersionId: version.id, dealId, signers: [] },
      {
        client: owner.client,
        storage: {
          uploadVersion: async () => undefined,
          downloadVersion: async () => EXTENSION_PDF,
        },
        documenso: {
          createDraft: async ({ title }: { title: string }) => {
            titles.push(title);

            return { documentId: crypto.randomUUID() };
          },
          editorUrl: async () => 'https://sign.test/edit',
        } as unknown as DocumensoClient,
      },
    );

    expect(titles).toEqual(['Seller room deal LOI extension to Dec 1, 2026']);
  });
});
