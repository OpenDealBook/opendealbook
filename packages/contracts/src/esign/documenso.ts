import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Tables } from '@odb/supabase';

import type { ContractStorage } from '../storage';

const COMPLETED_EVENT = 'document.completed';

export interface DocumensoSigner {
  email: string;
  name: string;
}

export interface DocumensoEnv {
  url: string;
  apiKey: string;
}

export interface CreateDocumensoDocumentInput {
  title: string;
  externalId: string;
  pdf: Uint8Array;
  signers: DocumensoSigner[];
}

export interface DocumensoDocument {
  documentId: string;
  status: string;
}

export interface DocumensoClient {
  createDocument(
    input: CreateDocumensoDocumentInput,
  ): Promise<DocumensoDocument>;
}

export function documensoEnv(): DocumensoEnv {
  return {
    url: process.env.DOCUMENSO_URL as string,
    apiKey: process.env.DOCUMENSO_API_KEY as string,
  };
}

export function createDocumensoClient(
  env: DocumensoEnv = documensoEnv(),
): DocumensoClient {
  return {
    async createDocument(input) {
      const response = await fetch(`${env.url}/api/v1/documents`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: input.title,
          externalId: input.externalId,
          documentDataBase64: Buffer.from(input.pdf).toString('base64'),
          recipients: input.signers.map((signer) => ({
            email: signer.email,
            name: signer.name,
            role: 'SIGNER',
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`Documenso responded with ${response.status}`);
      }

      const body = (await response.json()) as {
        documentId: number | string;
        status?: string;
      };

      return {
        documentId: String(body.documentId),
        status: body.status ?? 'PENDING',
      };
    },
  };
}

export interface SendForSignatureInput {
  contractVersionId: string;
  signers: DocumensoSigner[];
}

export interface SendForSignatureDeps {
  client: SupabaseClient<Database>;
  storage: ContractStorage;
  documenso: DocumensoClient;
}

export async function sendForSignature(
  input: SendForSignatureInput,
  deps: SendForSignatureDeps,
): Promise<DocumensoDocument> {
  const version = await loadVersion(deps.client, input.contractVersionId);
  const pdf = await deps.storage.downloadVersion(version.pdf_path!);

  return deps.documenso.createDocument({
    title: `Contract ${version.contract_id} version ${version.version}`,
    externalId: input.contractVersionId,
    pdf,
    signers: input.signers,
  });
}

export interface DocumensoWebhookPayload {
  event: string;
  payload: {
    externalId: string;
    documentHash: string;
  };
}

export interface DocumensoWebhookDeps {
  client: SupabaseClient<Database>;
}

export async function handleDocumensoWebhook(
  payload: DocumensoWebhookPayload,
  deps: DocumensoWebhookDeps,
): Promise<void> {
  if (payload.event !== COMPLETED_EVENT) {
    return;
  }

  const { error } = await deps.client
    .from('contract_version')
    .update({
      is_signed: true,
      content_hash: payload.payload.documentHash,
    })
    .eq('id', payload.payload.externalId);

  if (error) {
    throw error;
  }
}

async function loadVersion(
  client: SupabaseClient<Database>,
  contractVersionId: string,
): Promise<
  Pick<Tables<'contract_version'>, 'pdf_path' | 'contract_id' | 'version'>
> {
  const { data, error } = await client
    .from('contract_version')
    .select('pdf_path, contract_id, version')
    .eq('id', contractVersionId)
    .single();

  if (error) {
    throw error;
  }

  return data;
}
