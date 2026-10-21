import type { SupabaseClient } from '@supabase/supabase-js';

import { type EventType, appendDealEvent } from '@odb/events';
import type { Database, Json } from '@odb/supabase';

import {
  type ContractStorage,
  DOCX_CONTENT_TYPE,
  PDF_CONTENT_TYPE,
  contractDocxPath,
  contractPdfPath,
} from '../storage';
import type { ContractParty, ContractType } from '../types';
import { announceNewVersion } from '../versioning/versioning';
import {
  type DocumensoClient,
  type LoiSignedHook,
  type SignatureState,
  type SignedCopy,
  deterministicUuid,
  fileSignedContract,
  isStaleAggregate,
  recordSigning,
} from './documenso';

import { createHash } from 'node:crypto';

export class AlreadySignedInDocumenso extends Error {}

export interface ExternalSignature {
  dealId: string;
  type: ContractType;
  contractId: string | null;
  party: ContractParty;
  signedOn: string;
  copy: SignedCopy;
}

export interface ExternalSignatureDeps {
  client: SupabaseClient<Database>;
  admin: SupabaseClient<Database>;
  documenso: Pick<
    DocumensoClient,
    'signatureState' | 'deleteDraft' | 'cancelSent'
  >;
  storage: ContractStorage;
  authorUserId: string;
  onLoiSigned?: LoiSignedHook | undefined;
}


type AppendContractEvent = (
  contractId: string,
  eventType: EventType,
  payload: Json,
) => Promise<unknown>;

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

const STORED_AS = {
  pdf: {
    path: contractPdfPath,
    contentType: PDF_CONTENT_TYPE,
    columns: (path: string) => ({ pdf_path: path, pdf_bucket: 'contracts' }),
  },
  docx: {
    path: contractDocxPath,
    contentType: DOCX_CONTENT_TYPE,
    columns: (path: string) => ({ docx_path: path, docx_bucket: 'contracts' }),
  },
};

export async function recordExternalSignature(
  signature: ExternalSignature,
  deps: ExternalSignatureDeps,
): Promise<string> {
  const { client } = deps;
  const { data: deal } = await client
    .from('deal')
    .select('account_id')
    .eq('id', signature.dealId)
    .single()
    .throwOnError();
  const contract = {
    type: signature.type,
    deal_id: signature.dealId,
    account_id: deal.account_id,
  };
  const appendContractEvent: AppendContractEvent = (
    contractId,
    eventType,
    payload,
  ) =>
    appendDealEvent(client, {
      dealId: signature.dealId,
      aggregateType: 'contract',
      aggregateId: contractId,
      eventType,
      payload,
    });

  const sameSubmission = `signed elsewhere:${sha256(signature.copy.bytes)}:${signature.signedOn}`;
  const contractId =
    signature.contractId ??
    deterministicUuid(
      `${signature.dealId}:${signature.type}:${sameSubmission}`,
    );
  const versionId = deterministicUuid(`${contractId}:${sameSubmission}`);

  const { data: recorded } = await client
    .from('contract_version')
    .select('id, is_signed')
    .eq('id', versionId)
    .maybeSingle()
    .throwOnError();

  if (recorded) {
    if (recorded.is_signed && signature.type === 'loi') {
      await deps.onLoiSigned?.({
        dealId: signature.dealId,
        signedOn: signature.signedOn,
      });
    }

    return versionId;
  }

  if (signature.contractId === null) {
    try {
      await appendDealEvent(client, {
        dealId: signature.dealId,
        aggregateType: 'contract',
        aggregateId: contractId,
        eventType: 'contract.created',
        expectedAggregateSeq: 0,
        payload: { type: signature.type, status: 'draft', current_version: 0 },
      });
    } catch (failure) {
      // The same copy submitted at once: the submission that created the
      // contract records it.
      if (isStaleAggregate(failure)) {
        return versionId;
      }

      throw failure;
    }
  }

  await cancelOpenRequests(contractId, appendContractEvent, deps);

  const { data: latest } = await client
    .from('contract_version')
    .select('version')
    .eq('contract_id', contractId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
    .throwOnError();
  const version = (latest?.version ?? 0) + 1;
  const { kind, bytes } = signature.copy;
  const storedAs = STORED_AS[kind];
  const path = storedAs.path(deal.account_id, contractId, version);

  await deps.storage.uploadVersion(path, bytes, storedAs.contentType);

  const { data: signed } = await client
    .from('contract_version')
    .insert({
      id: versionId,
      contract_id: contractId,
      account_id: deal.account_id,
      version,
      source: 'upload',
      party: signature.party,
      author_user_id: deps.authorUserId,
      ...storedAs.columns(path),
    })
    .select('id')
    .single()
    .throwOnError();

  await announceNewVersion(client, signature.dealId, contractId, signed.id);
  await appendContractEvent(contractId, 'contract.version_set', {
    current_version: version,
  });
  await recordSigning(client, signed.id, contract, signature.signedOn);
  await appendContractEvent(contractId, 'contract.signature_status_changed', {
    version_id: signed.id,
    status: 'completed',
  });
  await fileSignedContract(
    deps.admin,
    signed.id,
    contract,
    async () => signature.copy,
  );

  if (signature.type === 'loi') {
    await deps.onLoiSigned?.({
      dealId: signature.dealId,
      signedOn: signature.signedOn,
    });
  }

  return signed.id;
}

// Read from Documenso rather than our record, so a retry after a cancel
// that went through does not cancel again.
const CANCEL_IN_STATE: Record<
  SignatureState,
  'deleteDraft' | 'cancelSent' | null
> = {
  draft: 'deleteDraft',
  sent: 'cancelSent',
  expired: 'cancelSent',
  rejected: null,
  cancelled: null,
  missing: null,
  completed: null,
};

async function cancelOpenRequests(
  contractId: string,
  appendContractEvent: AppendContractEvent,
  { client, documenso }: ExternalSignatureDeps,
): Promise<void> {
  const { data: open } = await client
    .from('contract_version')
    .select('id, signing_document_id')
    .eq('contract_id', contractId)
    .in('signing_status', ['draft', 'sent', 'expired'])
    .throwOnError();

  const requests = await Promise.all(
    open.map(async (version) => {
      const documentId = version.signing_document_id!;
      const { state } = await documenso.signatureState(documentId);

      return { versionId: version.id, documentId, state };
    }),
  );

  if (requests.some(({ state }) => state === 'completed')) {
    throw new AlreadySignedInDocumenso();
  }

  for (const { versionId, documentId, state } of requests) {
    const cancel = CANCEL_IN_STATE[state];

    if (cancel) {
      await documenso[cancel](documentId);
    }

    await appendContractEvent(contractId, 'contract.signature_status_changed', {
      version_id: versionId,
      status: 'declined',
    });
  }
}
