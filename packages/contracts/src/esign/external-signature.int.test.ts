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
const { AlreadySignedInDocumenso, recordExternalSignature } =
  await import('./external-signature');
const { recordSigning } = await import('./documenso');

type SignatureState = import('./documenso').SignatureState;
type ExternalSignatureDeps = import('./external-signature').ExternalSignatureDeps;

type Person = Awaited<ReturnType<typeof provisionPerson>>;

const SIGNED_ON = '2026-10-02';
const PDF = new TextEncoder().encode('%PDF-1.7 signed on paper');
const DOCX = new TextEncoder().encode('PK docx signed on paper');

let owner: Person;
let teamId: string;
const deletedDrafts: string[] = [];
const cancelledSent: string[] = [];
const envelopes = new Map<string, SignatureState>();
const documenso = {
  signatureState: async (documentId: string) => {
    const state = envelopes.get(documentId) ?? 'missing';

    return state === 'completed'
      ? { state, completedOn: SIGNED_ON }
      : { state };
  },
  deleteDraft: async (documentId: string) => {
    deletedDrafts.push(documentId);
  },
  cancelSent: async (documentId: string) => {
    cancelledSent.push(documentId);
  },
};

beforeAll(async () => {
  owner = await provisionPerson();
  teamId = await provisionTeam(owner, 'Paper Signers');
});

afterAll(async () => {
  await cleanUp([teamId]);
});

async function dealAt(stage: string) {
  const dealId = await newDeal(teamId, owner);

  await admin
    .rpc('append_deal_event', {
      p_deal_id: dealId,
      p_aggregate_type: 'deal',
      p_aggregate_id: dealId,
      p_event_type: 'deal.stage_changed',
      p_payload: { stage },
      p_actor_kind: 'service',
    })
    .throwOnError();

  return dealId;
}

async function contractWithOpenRequest(
  dealId: string,
  type: 'loi' | 'apa',
  status: 'draft' | 'sent' | 'expired' = 'draft',
  inDocumenso: SignatureState = status,
) {
  const contractId = crypto.randomUUID();
  const append = (eventType: string, payload: Json) =>
    admin
      .rpc('append_deal_event', {
        p_deal_id: dealId,
        p_aggregate_type: 'contract',
        p_aggregate_id: contractId,
        p_event_type: eventType,
        p_payload: payload,
        p_actor_kind: 'service',
      })
      .throwOnError();

  await append('contract.created', {
    type,
    status: 'draft',
    current_version: 0,
  });
  const { data: version } = await admin
    .from('contract_version')
    .insert({
      contract_id: contractId,
      account_id: teamId,
      version: 1,
      source: 'generated',
      party: 'buyer',
    })
    .select('id')
    .single()
    .throwOnError();
  await append('contract.signature_requested', {
    version_id: version.id,
    signing_document_id: `envelope_${version.id}`,
  });

  envelopes.set(`envelope_${version.id}`, inDocumenso);

  if (status !== 'draft') {
    await append('contract.signature_status_changed', {
      version_id: version.id,
      status,
    });
  }

  return { contractId, openVersionId: version.id };
}

function record(
  dealId: string,
  type: 'loi' | 'apa',
  contractId: string | null,
  copy: { bytes: Uint8Array; kind: 'pdf' | 'docx' },
  onLoiSigned?: ExternalSignatureDeps['onLoiSigned'],
) {
  return recordExternalSignature(
    { dealId, type, contractId, party: 'buyer', signedOn: SIGNED_ON, copy },
    {
      client: owner.client,
      admin,
      documenso,
      storage: createSupabaseContractStorage(owner.client),
      authorUserId: owner.userId,
      onLoiSigned,
    },
  );
}

async function signedVersion(versionId: string) {
  const { data } = await admin
    .from('contract_version')
    .select(
      'version, source, is_signed, signing_status, pdf_path, pdf_bucket, docx_path, docx_bucket, contract:contract_id (type, deal_id, current_version)',
    )
    .eq('id', versionId)
    .single()
    .throwOnError();

  return data;
}

async function stageOf(dealId: string) {
  const { data } = await admin
    .from('deal')
    .select('stage')
    .eq('id', dealId)
    .single()
    .throwOnError();

  return data.stage;
}

async function actualOf(dealId: string, kind: 'loi_signed' | 'apa_signing') {
  const { data } = await admin
    .from('deal_milestone')
    .select('actual_on')
    .eq('deal_id', dealId)
    .eq('kind', kind)
    .single()
    .throwOnError();

  return data.actual_on;
}

async function customMilestones(dealId: string) {
  const { data } = await admin
    .from('deal_milestone')
    .select('label, actual_on, shared')
    .eq('deal_id', dealId)
    .eq('kind', 'custom')
    .throwOnError();

  return data;
}

async function filedCopy(versionId: string) {
  const { data } = await admin
    .from('dr_document')
    .select('name, folder:folder_id (name)')
    .eq('id', versionId)
    .single()
    .throwOnError();

  return data;
}

async function stored(bucket: string, path: string) {
  const { data, error } = await admin.storage.from(bucket).download(path);

  if (error) {
    throw error;
  }

  return new TextDecoder().decode(await data.arrayBuffer());
}

describe('recording a contract signed outside the platform', () => {
  it('creates the LOI when the deal has none and gives it every effect of a Documenso completion', async () => {
    const dealId = await dealAt('loi_submitted');

    const versionId = await record(dealId, 'loi', null, {
      bytes: PDF,
      kind: 'pdf',
    });

    const version = await signedVersion(versionId);
    expect(version).toMatchObject({
      version: 1,
      source: 'upload',
      is_signed: true,
      signing_status: 'completed',
      pdf_bucket: 'contracts',
      docx_path: null,
      contract: { type: 'loi', deal_id: dealId, current_version: 1 },
    });
    expect(await stored('contracts', version.pdf_path!)).toBe(
      '%PDF-1.7 signed on paper',
    );
    expect(await stageOf(dealId)).toBe('loi_accepted');
    expect(await actualOf(dealId, 'loi_signed')).toBe(SIGNED_ON);
    expect(await customMilestones(dealId)).toEqual([
      { label: 'LOI v1 signed', actual_on: SIGNED_ON, shared: false },
    ]);
    expect(await filedCopy(versionId)).toEqual({
      name: 'LOI (signed).pdf',
      folder: { name: 'Signed contracts' },
    });
  });

  it('hands a LOI signed on paper to the diligence setup with its deal and signed day', async () => {
    const dealId = await dealAt('loi_submitted');
    const signed: unknown[] = [];

    await record(dealId, 'loi', null, { bytes: PDF, kind: 'pdf' }, async (loi) => {
      signed.push(loi);
    });

    expect(signed).toEqual([{ dealId, signedOn: SIGNED_ON }]);
  });

  it('hands nothing to the diligence setup when an APA is signed on paper', async () => {
    const dealId = await dealAt('pa_submitted');
    const signed: unknown[] = [];

    await record(dealId, 'apa', null, { bytes: PDF, kind: 'pdf' }, async (apa) => {
      signed.push(apa);
    });

    expect(signed).toEqual([]);
  });

  it('completes the diligence setup when the same LOI is submitted again after it failed', async () => {
    const dealId = await dealAt('loi_submitted');
    const copy = { bytes: PDF, kind: 'pdf' } as const;
    const signed: unknown[] = [];

    await expect(
      record(dealId, 'loi', null, copy, async () => {
        throw new Error('setup crashed');
      }),
    ).rejects.toThrow('setup crashed');
    await record(dealId, 'loi', null, copy, async (loi) => {
      signed.push(loi);
    });

    expect(signed).toEqual([{ dealId, signedOn: SIGNED_ON }]);
  });

  it('adds a signed .docx APA as a new version that carries a deal with no counsel past the counsel gate', async () => {
    const dealId = await dealAt('pa_submitted');
    const { contractId } = await contractWithOpenRequest(dealId, 'apa');

    const versionId = await record(dealId, 'apa', contractId, {
      bytes: DOCX,
      kind: 'docx',
    });

    const version = await signedVersion(versionId);
    expect(version).toMatchObject({
      version: 2,
      is_signed: true,
      signing_status: 'completed',
      docx_bucket: 'contracts',
      pdf_path: null,
      contract: { current_version: 2 },
    });
    expect(await stored('contracts', version.docx_path!)).toBe(
      'PK docx signed on paper',
    );
    expect(await stageOf(dealId)).toBe('pa_accepted');
    expect(await actualOf(dealId, 'apa_signing')).toBe(SIGNED_ON);
    expect(await customMilestones(dealId)).toEqual([
      { label: 'APA v1 signed', actual_on: SIGNED_ON, shared: false },
    ]);
    expect(await filedCopy(versionId)).toMatchObject({
      name: 'APA (signed).docx',
    });
  });

  it('logs the signed copy as added and, being signed, as shown to the seller side', async () => {
    const dealId = await dealAt('pa_submitted');
    const { contractId } = await contractWithOpenRequest(dealId, 'apa');

    const versionId = await record(dealId, 'apa', contractId, {
      bytes: DOCX,
      kind: 'docx',
    });

    const { data: events } = await admin
      .from('deal_event')
      .select('event_type, payload')
      .eq('aggregate_id', contractId)
      .in('event_type', [
        'contract.version_added',
        'contract.version_shown_to_seller_side',
      ])
      .order('global_seq')
      .throwOnError();
    expect(events).toEqual([
      {
        event_type: 'contract.version_added',
        payload: { version_id: versionId },
      },
      {
        event_type: 'contract.version_shown_to_seller_side',
        payload: { version_id: versionId },
      },
    ]);
  });

  it('cancels the open Documenso draft of that contract', async () => {
    const dealId = await dealAt('loi_submitted');
    const { contractId, openVersionId } = await contractWithOpenRequest(
      dealId,
      'loi',
    );

    await record(dealId, 'loi', contractId, { bytes: PDF, kind: 'pdf' });

    expect(deletedDrafts).toContain(`envelope_${openVersionId}`);
    expect((await signedVersion(openVersionId)).signing_status).toBe(
      'declined',
    );
  });

  async function lois(dealId: string) {
    const { data } = await admin
      .from('contract')
      .select('id, versions:contract_version (id)')
      .eq('deal_id', dealId)
      .eq('type', 'loi')
      .throwOnError();

    return data;
  }

  it('records one contract and version when the same copy and date are submitted twice', async () => {
    const dealId = await dealAt('loi_submitted');
    const copy = { bytes: PDF, kind: 'pdf' } as const;

    const first = await record(dealId, 'loi', null, copy);
    const again = await record(dealId, 'loi', null, copy);

    expect(again).toBe(first);
    expect(await lois(dealId)).toEqual([
      { id: expect.any(String), versions: [{ id: first }] },
    ]);
  });

  it('records one contract and version when the same copy and date are submitted at once', async () => {
    const dealId = await dealAt('loi_submitted');
    const copy = { bytes: PDF, kind: 'pdf' } as const;

    const [first, second] = await Promise.all([
      record(dealId, 'loi', null, copy),
      record(dealId, 'loi', null, copy),
    ]);

    expect(second).toBe(first);
    expect(await lois(dealId)).toEqual([
      { id: expect.any(String), versions: [{ id: first }] },
    ]);
  });

  it('logs a version shown to the seller side once when it is signed twice at once', async () => {
    const dealId = await dealAt('loi_submitted');
    const { contractId, openVersionId } = await contractWithOpenRequest(
      dealId,
      'loi',
    );
    const contract = { type: 'loi', deal_id: dealId };
    const webhook = { actorKind: 'service', actorVia: 'documenso' } as const;

    await Promise.all([
      recordSigning(admin, openVersionId, contract, SIGNED_ON, webhook),
      recordSigning(admin, openVersionId, contract, SIGNED_ON, webhook),
    ]);

    const { data: events } = await admin
      .from('deal_event')
      .select('payload')
      .eq('aggregate_id', contractId)
      .eq('event_type', 'contract.version_shown_to_seller_side')
      .throwOnError();
    expect(events).toEqual([{ payload: { version_id: openVersionId } }]);
  });

  it('records a second version when the same copy comes with a different date', async () => {
    const dealId = await dealAt('loi_submitted');
    const { contractId } = await contractWithOpenRequest(dealId, 'loi');
    const copy = { bytes: PDF, kind: 'pdf' } as const;

    const first = await record(dealId, 'loi', contractId, copy);
    const corrected = await recordExternalSignature(
      {
        dealId,
        type: 'loi',
        contractId,
        party: 'buyer',
        signedOn: '2026-10-03',
        copy,
      },
      {
        client: owner.client,
        admin,
        documenso,
        storage: createSupabaseContractStorage(owner.client),
        authorUserId: owner.userId,
      },
    );

    expect(corrected).not.toBe(first);
  });

  it('cancels a request Documenso has already sent, so its signers are told', async () => {
    const dealId = await dealAt('loi_submitted');
    const { contractId, openVersionId } = await contractWithOpenRequest(
      dealId,
      'loi',
      'sent',
    );

    await record(dealId, 'loi', contractId, { bytes: PDF, kind: 'pdf' });

    expect(cancelledSent).toContain(`envelope_${openVersionId}`);
    expect(deletedDrafts).not.toContain(`envelope_${openVersionId}`);
    expect((await signedVersion(openVersionId)).signing_status).toBe(
      'declined',
    );
  });

  it('cancels a request whose signing deadline passed, so its signers are told', async () => {
    const dealId = await dealAt('loi_submitted');
    const { contractId, openVersionId } = await contractWithOpenRequest(
      dealId,
      'loi',
      'expired',
    );

    await record(dealId, 'loi', contractId, { bytes: PDF, kind: 'pdf' });

    expect(cancelledSent).toContain(`envelope_${openVersionId}`);
    expect((await signedVersion(openVersionId)).signing_status).toBe(
      'declined',
    );
  });

  it.each([
    ['a sent request Documenso already cancelled', 'sent', 'cancelled'],
    ['a draft Documenso already deleted', 'draft', 'missing'],
  ] as const)(
    'treats %s as cancelled when recording again',
    async (_label, recordedStatus, inDocumenso) => {
      const dealId = await dealAt('loi_submitted');
      const { contractId, openVersionId } = await contractWithOpenRequest(
        dealId,
        'loi',
        recordedStatus,
        inDocumenso,
      );

      const versionId = await record(dealId, 'loi', contractId, {
        bytes: PDF,
        kind: 'pdf',
      });

      expect([...cancelledSent, ...deletedDrafts]).not.toContain(
        `envelope_${openVersionId}`,
      );
      expect((await signedVersion(openVersionId)).signing_status).toBe(
        'declined',
      );
      expect((await signedVersion(versionId)).is_signed).toBe(true);
    },
  );

  it('refuses and records nothing when Documenso shows the open request was already signed', async () => {
    const dealId = await dealAt('loi_submitted');
    const { contractId, openVersionId } = await contractWithOpenRequest(
      dealId,
      'loi',
      'sent',
      'completed',
    );

    await expect(
      record(dealId, 'loi', contractId, { bytes: PDF, kind: 'pdf' }),
    ).rejects.toBeInstanceOf(AlreadySignedInDocumenso);

    expect(await lois(dealId)).toEqual([
      { id: contractId, versions: [{ id: openVersionId }] },
    ]);
    expect([...cancelledSent, ...deletedDrafts]).not.toContain(
      `envelope_${openVersionId}`,
    );
    expect((await signedVersion(openVersionId)).signing_status).toBe('sent');
    expect(await stageOf(dealId)).toBe('loi_submitted');
  });
});
