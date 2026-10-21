import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  admin,
  cleanUp,
  provisionPerson,
  provisionTeam,
} from '../../../features/seller-rooms/src/test-support/world.ts';
import type { ContractStorage } from '../storage';
import {
  type DocumensoClient,
  SigningNotReady,
  requestContractSignature,
} from './documenso';

type Person = Awaited<ReturnType<typeof provisionPerson>>;

let owner: Person;
let teamId: string;
let dealId: string;
let contractId: string;
let nextVersion = 1;

const storage: ContractStorage = {
  uploadVersion: async () => undefined,
  downloadVersion: async () => new Uint8Array([1]),
};

const documenso = {
  createDraft: async () => ({ documentId: crypto.randomUUID() }),
  editorUrl: async (documentId: string) => `https://sign.test/${documentId}`,
} as unknown as DocumensoClient;

async function newVersion() {
  const version = nextVersion++;
  const { data } = await admin
    .from('contract_version')
    .insert({
      contract_id: contractId,
      account_id: teamId,
      version,
      source: 'upload',
      party: 'buyer',
      pdf_path: `gate/v${version}.pdf`,
      pdf_bucket: 'contracts',
      shared_at: new Date().toISOString(),
    })
    .select('id')
    .single()
    .throwOnError();

  return { id: data.id, version };
}

async function decide(
  versionId: string,
  side: 'buyer' | 'seller',
  decision: 'approved' | 'changes_needed',
) {
  await admin
    .from('contract_review_decision')
    .insert({
      account_id: teamId,
      contract_version_id: versionId,
      side,
      decision,
      decided_by: owner.userId,
      without_counsel: side === 'buyer',
    })
    .throwOnError();
}

function send(versionId: string) {
  return requestContractSignature(
    { contractVersionId: versionId, dealId, signers: [] },
    { client: owner.client, storage, documenso },
  );
}

async function refusalOf(sending: Promise<unknown>) {
  const failure = await sending.then(
    () => null,
    (error: unknown) => error,
  );

  expect(failure).toBeInstanceOf(SigningNotReady);

  return (failure as Error).message;
}

async function signingDocumentOf(versionId: string) {
  const { data } = await admin
    .from('contract_version')
    .select('signing_document_id')
    .eq('id', versionId)
    .single()
    .throwOnError();

  return data.signing_document_id;
}

beforeAll(async () => {
  owner = await provisionPerson();
  const sellerCounsel = await provisionPerson();
  teamId = await provisionTeam(owner, 'Gate Partners');
  const { data: firm } = await admin
    .from('firm')
    .insert({ account_id: teamId, name: 'Gate Tooling' })
    .select('id')
    .single()
    .throwOnError();
  dealId = crypto.randomUUID();
  await admin
    .rpc('append_deal_event', {
      p_deal_id: dealId,
      p_aggregate_type: 'deal',
      p_aggregate_id: dealId,
      p_event_type: 'deal.created',
      p_payload: {
        account_id: teamId,
        owner_user_id: owner.userId,
        firm_id: firm.id,
      },
      p_actor_kind: 'service',
    })
    .throwOnError();

  await admin
    .from('deal_counsel')
    .insert({
      account_id: teamId,
      deal_id: dealId,
      side: 'seller',
      user_id: sellerCounsel.userId,
      email: sellerCounsel.email,
    })
    .throwOnError();

  contractId = crypto.randomUUID();
  await admin
    .rpc('append_deal_event', {
      p_deal_id: dealId,
      p_aggregate_type: 'contract',
      p_aggregate_id: contractId,
      p_event_type: 'contract.created',
      p_payload: { type: 'apa', status: 'draft', current_version: 0 },
      p_actor_kind: 'service',
    })
    .throwOnError();
});

afterAll(async () => {
  await cleanUp([teamId]);
});

describe('sending an APA for signature before sign-off', () => {
  it('refuses, naming every side still to approve the version', async () => {
    const { id, version } = await newVersion();

    expect(await refusalOf(send(id))).toBe(
      `Waiting on the buyer and seller's counsel to approve version ${version}.`,
    );
    expect(await signingDocumentOf(id)).toBeNull();
  });

  it("refuses while seller's counsel's latest answer asks for changes", async () => {
    const { id, version } = await newVersion();
    await decide(id, 'buyer', 'approved');
    await decide(id, 'seller', 'approved');
    await decide(id, 'seller', 'changes_needed');

    expect(await refusalOf(send(id))).toBe(
      `Waiting on seller's counsel to approve version ${version}.`,
    );
    expect(await signingDocumentOf(id)).toBeNull();
  });

  it('drafts the signature request once both sides approve', async () => {
    const { id } = await newVersion();
    await decide(id, 'buyer', 'approved');
    await decide(id, 'seller', 'approved');

    const editorUrl = await send(id);

    expect(editorUrl).toBe(`https://sign.test/${await signingDocumentOf(id)}`);
  });
});
