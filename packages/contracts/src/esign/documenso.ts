import type { SupabaseClient } from '@supabase/supabase-js';

import { z } from 'zod';

import { appendDealEvent } from '@odb/events';
import type { Database, Tables } from '@odb/supabase';

import type { ContractStorage } from '../storage';
import { assertSignedPdf } from './signed-pdf';
import type { Signer } from './signers';

import { createHash } from 'node:crypto';

interface DocumensoEnv {
  url: string;
  apiKey: string;
}

interface CreateDocumensoDraftInput {
  title: string;
  externalId: string;
  pdf: Uint8Array;
  signers: Signer[];
}

interface DocumensoDocument {
  documentId: string;
}

export type SignatureState =
  | 'draft'
  | 'sent'
  | 'completed'
  | 'rejected'
  | 'cancelled'
  | 'expired'
  | 'missing';

export interface DocumensoClient {
  createDraft(input: CreateDocumensoDraftInput): Promise<DocumensoDocument>;
  deleteDraft(documentId: string): Promise<void>;
  editorUrl(documentId: string): Promise<string>;
  signatureState(documentId: string): Promise<SignatureState>;
  downloadSignedPdf(documentId: string): Promise<Uint8Array>;
}

export class DocumensoRejected extends Error {}

export class ContractNotFound extends Error {}

export const DOCUMENSO_NOT_CONFIGURED =
  'E-signature is not set up yet: Documenso is not configured';

export function isDocumensoConfigured(): boolean {
  return Boolean(process.env.DOCUMENSO_URL && process.env.DOCUMENSO_API_KEY);
}

function documensoEnv(): DocumensoEnv {
  return {
    url: process.env.DOCUMENSO_URL as string,
    apiKey: process.env.DOCUMENSO_API_KEY as string,
  };
}

const REQUEST_TIMEOUT_MS = 8_000;
const FILE_TRANSFER_TIMEOUT_MS = 60_000;

const createdEnvelopeSchema = z.object({ id: z.string() });

const envelopeFilesSchema = z.object({
  envelopeItems: z
    .array(z.object({ id: z.string(), order: z.number() }))
    .nonempty(),
});

const envelopeTeamSchema = z.object({
  team: z.object({ url: z.string() }),
});

const envelopeStateSchema = z.object({
  status: z.enum(['DRAFT', 'PENDING', 'COMPLETED', 'REJECTED', 'CANCELLED']),
  recipients: z.array(
    z.object({ expirationNotifiedAt: z.string().nullable() }),
  ),
});

const STATE_OF_STATUS = {
  DRAFT: 'draft',
  PENDING: 'sent',
  COMPLETED: 'completed',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
} as const satisfies Record<string, SignatureState>;

export function createDocumensoClient(
  env: DocumensoEnv = documensoEnv(),
): DocumensoClient {
  function request(
    path: string,
    {
      timeoutMs = REQUEST_TIMEOUT_MS,
      ...init
    }: RequestInit & {
      timeoutMs?: number;
    } = {},
  ) {
    return fetch(`${env.url}/api/v2${path}`, {
      ...init,
      headers: { ...init.headers, Authorization: env.apiKey },
      signal: AbortSignal.timeout(timeoutMs),
    });
  }

  function accepted(response: Response) {
    if (response.status === 400) {
      throw new DocumensoRejected(
        `Documenso responded with ${response.status}`,
      );
    }

    if (!response.ok) {
      throw new Error(`Documenso responded with ${response.status}`);
    }

    return response;
  }

  async function call(...args: Parameters<typeof request>) {
    return accepted(await request(...args));
  }

  return {
    async createDraft(input) {
      const form = new FormData();
      form.append(
        'payload',
        JSON.stringify({
          type: 'DOCUMENT',
          title: input.title,
          externalId: input.externalId,
          recipients: input.signers.map((signer) => ({
            email: signer.email,
            name: signer.name,
            role: 'SIGNER',
          })),
        }),
      );
      form.append(
        'files',
        new Blob([Uint8Array.from(input.pdf)], { type: 'application/pdf' }),
        `${input.title}.pdf`,
      );

      const created = await call('/envelope/create', {
        method: 'POST',
        body: form,
        timeoutMs: FILE_TRANSFER_TIMEOUT_MS,
      });
      const { id } = createdEnvelopeSchema.parse(await created.json());

      return { documentId: id };
    },

    async deleteDraft(documentId) {
      await call('/envelope/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ envelopeId: documentId }),
      });
    },

    async editorUrl(documentId) {
      const envelope = await call(`/envelope/${documentId}`);
      const { team } = envelopeTeamSchema.parse(await envelope.json());

      return `${env.url}/t/${team.url}/documents/${documentId}/edit`;
    },

    async signatureState(documentId) {
      const response = await request(`/envelope/${documentId}`);

      if (response.status === 404) {
        return 'missing';
      }

      const { status, recipients } = envelopeStateSchema.parse(
        await accepted(response).json(),
      );
      const hasExpired = recipients.some(
        (recipient) => recipient.expirationNotifiedAt !== null,
      );

      return status === 'PENDING' && hasExpired
        ? 'expired'
        : STATE_OF_STATUS[status];
    },

    async downloadSignedPdf(documentId) {
      const envelope = await call(`/envelope/${documentId}`);
      const { envelopeItems } = envelopeFilesSchema.parse(
        await envelope.json(),
      );
      const uploaded = envelopeItems.reduce((first, item) =>
        item.order < first.order ? item : first,
      );

      const signed = await call(
        `/envelope/item/${uploaded.id}/download?version=signed`,
        { timeoutMs: FILE_TRANSFER_TIMEOUT_MS },
      );

      return new Uint8Array(await signed.arrayBuffer());
    },
  };
}

const SIGNATURE_EVENTS = new Set([
  'DOCUMENT_SENT',
  'DOCUMENT_COMPLETED',
  'DOCUMENT_REJECTED',
  'DOCUMENT_CANCELLED',
  'RECIPIENT_EXPIRED',
]);

const webhookEventSchema = z.object({ event: z.string() });

const webhookDocumentSchema = z.object({
  payload: z.object({ envelopeId: z.string() }),
});

export function signatureEventDocumentId(body: unknown): string | null {
  if (!SIGNATURE_EVENTS.has(webhookEventSchema.parse(body).event)) {
    return null;
  }

  return webhookDocumentSchema.parse(body).payload.envelopeId;
}

interface RequestContractSignatureInput {
  contractVersionId: string;
  dealId: string;
  signers: Signer[];
}

interface ContractSignatureDeps {
  client: SupabaseClient<Database>;
  admin: SupabaseClient<Database>;
  documenso: DocumensoClient;
}

type ContractRequestDeps = Omit<ContractSignatureDeps, 'admin'>;

export async function requestContractSignature(
  input: RequestContractSignatureInput,
  deps: ContractRequestDeps & { storage: ContractStorage },
): Promise<string> {
  const { data: version, error } = await deps.client
    .from('contract_version')
    .select('pdf_path, contract_id, version')
    .eq('id', input.contractVersionId)
    .single();

  if (error) {
    throw error;
  }

  const pdf = await deps.storage.downloadVersion(version.pdf_path!);

  const { documentId } = await deps.documenso.createDraft({
    title: `Contract ${version.contract_id} version ${version.version}`,
    externalId: input.contractVersionId,
    pdf,
    signers: input.signers,
  });

  try {
    const editorUrl = await deps.documenso.editorUrl(documentId);

    await appendDealEvent(deps.client, {
      dealId: input.dealId,
      aggregateType: 'contract',
      aggregateId: version.contract_id,
      eventType: 'contract.signature_requested',
      payload: {
        version_id: input.contractVersionId,
        signing_document_id: documentId,
      },
    });

    return editorUrl;
  } catch (failure) {
    await removeDraft(deps.documenso, documentId);
    throw failure;
  }
}

export async function removeDraft(
  documenso: Pick<DocumensoClient, 'deleteDraft'>,
  documentId: string,
): Promise<void> {
  try {
    await documenso.deleteDraft(documentId);
  } catch (error) {
    console.error('A Documenso draft could not be removed', {
      documentId,
      error,
    });
  }
}

type SigningVersion = Pick<
  Tables<'contract_version'>,
  'id' | 'contract_id' | 'signing_document_id' | 'signing_status'
>;

const SIGNING_VERSION = 'id, contract_id, signing_document_id, signing_status';

export async function contractSignatureEditorUrl(
  contractVersionId: string,
  deps: ContractRequestDeps,
): Promise<string | null> {
  const version = await signingVersion(deps.client, contractVersionId);

  return version.signing_document_id === null
    ? null
    : deps.documenso.editorUrl(version.signing_document_id);
}

export async function handleContractSignatureEvent(
  documentId: string,
  deps: ContractSignatureDeps,
): Promise<void> {
  const { data: version, error } = await deps.client
    .from('contract_version')
    .select(SIGNING_VERSION)
    .eq('signing_document_id', documentId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (version) {
    await applySignatureState(version, documentId, deps, 'service');
  }
}

export async function checkContractSignature(
  contractVersionId: string,
  deps: ContractSignatureDeps,
): Promise<void> {
  const version = await signingVersion(deps.client, contractVersionId);

  if (version.signing_document_id !== null) {
    await applySignatureState(version, version.signing_document_id, deps);
  }
}

type SigningStatus = 'draft' | 'sent' | 'completed' | 'declined' | 'expired';

const STATUS_OF_STATE: Record<SignatureState, SigningStatus> = {
  draft: 'draft',
  sent: 'sent',
  completed: 'completed',
  rejected: 'declined',
  cancelled: 'declined',
  missing: 'declined',
  expired: 'expired',
};

interface StageMove {
  from: readonly string[];
  to: string;
}

const APA_STEPS_BACK: StageMove = {
  from: ['pa_submitted'],
  to: 'loi_accepted',
};

const STAGE_MOVES: Record<string, Partial<Record<SigningStatus, StageMove>>> = {
  loi: { completed: { from: ['loi_submitted'], to: 'loi_accepted' } },
  apa: {
    sent: { from: ['loi_accepted'], to: 'pa_submitted' },
    completed: { from: ['pa_submitted', 'loi_accepted'], to: 'pa_accepted' },
    declined: APA_STEPS_BACK,
    expired: APA_STEPS_BACK,
  },
};

async function applySignatureState(
  version: SigningVersion,
  documentId: string,
  deps: ContractSignatureDeps,
  actorKind?: 'service',
): Promise<void> {
  const { client, documenso } = deps;
  const status = STATUS_OF_STATE[await documenso.signatureState(documentId)];
  const isRecorded = status === version.signing_status;

  if (isRecorded && (status === 'declined' || status === 'expired')) {
    return;
  }

  const { data: contract, error: contractError } = await client
    .from('contract')
    .select('type, deal_id, account_id')
    .eq('id', version.contract_id)
    .single();

  if (contractError) {
    throw contractError;
  }

  const move = STAGE_MOVES[contract.type]?.[status];

  if (move) {
    await moveStage(client, contract.deal_id, move, actorKind);
  }

  if (status === 'completed') {
    const { data: signed, error } = await client
      .from('contract_version')
      .update({ is_signed: true })
      .eq('id', version.id)
      .select('id');

    if (error) {
      throw error;
    }

    if (signed.length === 0) {
      throw new ContractNotFound();
    }

    await fileSignedContract(version.id, documentId, contract, deps);
  }

  if (!isRecorded) {
    await appendDealEvent(client, {
      dealId: contract.deal_id,
      aggregateType: 'contract',
      aggregateId: version.contract_id,
      eventType: 'contract.signature_status_changed',
      payload: { version_id: version.id, status },
      actorKind,
    });
  }
}

const DATA_ROOM_BUCKET = 'data-room';
const SIGNED_CONTRACTS_FOLDER = 'Signed contracts';
const CONTRACT_NAME: Record<string, string> = { loi: 'LOI', apa: 'APA' };

async function fileSignedContract(
  contractVersionId: string,
  documentId: string,
  contract: Pick<Tables<'contract'>, 'type' | 'deal_id' | 'account_id'>,
  { admin, documenso }: ContractSignatureDeps,
): Promise<void> {
  const contractName = CONTRACT_NAME[contract.type];

  if (contractName === undefined) {
    return;
  }

  const { data: filed } = await admin
    .from('dr_document')
    .select('id')
    .eq('id', contractVersionId)
    .maybeSingle()
    .throwOnError();

  if (filed) {
    return;
  }

  const signedPdf = await documenso.downloadSignedPdf(documentId);
  assertSignedPdf(signedPdf);

  const storagePath = `deal/${contract.deal_id}/${contractVersionId}-signed.pdf`;
  const stored = await admin.storage
    .from(DATA_ROOM_BUCKET)
    .upload(storagePath, signedPdf, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (stored.error) {
    throw stored.error;
  }

  const folderId = await signedContractsFolder(admin, contract);
  const name = `${contractName} (signed).pdf`;

  const { data: earlier } = await admin
    .from('dr_document')
    .select('id')
    .eq('folder_id', folderId)
    .eq('name', name)
    .throwOnError();

  try {
    await appendDealEvent(admin, {
      dealId: contract.deal_id,
      aggregateType: 'dr_document',
      aggregateId: contractVersionId,
      eventType: 'dr_document.added',
      actorKind: 'service',
      expectedAggregateSeq: 0,
      payload: {
        folder_id: folderId,
        name,
        storage_path: storagePath,
        version: earlier.length + 1,
      },
    });
  } catch (failure) {
    if (!isStaleAggregate(failure)) {
      throw failure;
    }
  }
}

export function deterministicUuid(seed: string): string {
  const hash = createHash('sha256').update(seed).digest('hex');

  const variant = ((Number.parseInt(hash[16]!, 16) & 0x3) | 0x8).toString(16);

  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `5${hash.slice(13, 16)}`,
    `${variant}${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ].join('-');
}

async function signedContractsFolder(
  admin: SupabaseClient<Database>,
  contract: Pick<Tables<'contract'>, 'deal_id' | 'account_id'>,
): Promise<string> {
  const { data: existing } = await admin
    .from('dr_folder')
    .select('id')
    .eq('deal_id', contract.deal_id)
    .is('parent_id', null)
    .ilike('name', SIGNED_CONTRACTS_FOLDER)
    .order('created_at')
    .limit(1)
    .maybeSingle()
    .throwOnError();

  if (existing) {
    return existing.id;
  }

  const id = deterministicUuid(
    `${SIGNED_CONTRACTS_FOLDER}:${contract.deal_id}`,
  );

  await admin
    .from('dr_folder')
    .upsert(
      {
        id,
        account_id: contract.account_id,
        deal_id: contract.deal_id,
        name: SIGNED_CONTRACTS_FOLDER,
      },
      { onConflict: 'id', ignoreDuplicates: true },
    )
    .throwOnError();

  return id;
}

const staleAggregateSchema = z.object({ code: z.literal('40001') });

export function isStaleAggregate(failure: unknown): boolean {
  return staleAggregateSchema.safeParse(failure).success;
}

async function moveStage(
  client: SupabaseClient<Database>,
  dealId: string,
  move: StageMove,
  actorKind?: 'service',
): Promise<void> {
  for (;;) {
    const { data: head, error: headError } = await client
      .from('deal_event')
      .select('aggregate_seq')
      .eq('aggregate_type', 'deal')
      .eq('aggregate_id', dealId)
      .order('aggregate_seq', { ascending: false })
      .limit(1)
      .single();

    if (headError) {
      throw headError;
    }

    const { data: deal, error: dealError } = await client
      .from('deal')
      .select('stage')
      .eq('id', dealId)
      .single();

    if (dealError) {
      throw dealError;
    }

    if (!move.from.includes(deal.stage)) {
      return;
    }

    try {
      await appendDealEvent(client, {
        dealId,
        aggregateType: 'deal',
        aggregateId: dealId,
        eventType: 'deal.stage_changed',
        payload: { stage: move.to },
        expectedAggregateSeq: head.aggregate_seq,
        actorKind,
      });

      return;
    } catch (failure) {
      if (!isStaleAggregate(failure)) {
        throw failure;
      }
    }
  }
}

async function signingVersion(
  client: SupabaseClient<Database>,
  contractVersionId: string,
): Promise<SigningVersion> {
  const { data, error } = await client
    .from('contract_version')
    .select(SIGNING_VERSION)
    .eq('id', contractVersionId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new ContractNotFound();
  }

  return data;
}
