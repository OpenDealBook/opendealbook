import type { SupabaseClient } from '@supabase/supabase-js';

import { appendDealEvent } from '@odb/events';
import type { Database, Tables, TablesInsert } from '@odb/supabase';

import { convertDocxToPdf } from '../docx-to-pdf';
import {
  type ContractStorage,
  DOCX_CONTENT_TYPE,
  PDF_CONTENT_TYPE,
  contractDocxPath,
  contractPdfPath,
} from '../storage';
import type {
  ContractBucket,
  ContractParty,
  ContractSource,
  ContractType,
} from '../types';

const GENERATED_PARTY: ContractParty = 'buyer';
const FIRST_VERSION = 1;

export interface CreateContractInput {
  dealId: string;
  type: ContractType;
  fromTemplateId?: string;
}

export interface GeneratedVersionOne {
  generatedDocumentId: string;
  docxPath: string | null;
  pdfPath: string | null;
}

export interface CreateContractDeps {
  client: SupabaseClient<Database>;
  createdByUserId: string;
  generateVersionOne(args: {
    contractId: string;
    accountId: string;
    dealId: string;
    templateId: string;
  }): Promise<GeneratedVersionOne>;
}

export interface AppendVersionInput {
  contractId: string;
  docxBytes: Uint8Array;
  party: ContractParty;
  changeSummary?: string;
}

export interface AppendVersionDeps {
  client: SupabaseClient<Database>;
  storage: ContractStorage;
  authorUserId: string | null;
}

export async function createContractRecord(
  input: CreateContractInput,
  deps: CreateContractDeps,
): Promise<string> {
  const accountId = await loadDealAccountId(deps.client, input.dealId);
  const contractId = crypto.randomUUID();

  await appendDealEvent(deps.client, {
    dealId: input.dealId,
    aggregateType: 'contract',
    aggregateId: contractId,
    eventType: 'contract.created',
    payload: { type: input.type, status: 'draft', current_version: 0 },
  });

  if (!input.fromTemplateId) {
    return contractId;
  }

  const generated = await deps.generateVersionOne({
    contractId,
    accountId,
    dealId: input.dealId,
    templateId: input.fromTemplateId,
  });

  await linkGeneratedDocument(
    deps.client,
    generated.generatedDocumentId,
    contractId,
  );

  const first = await insertVersion(deps.client, {
    contract_id: contractId,
    account_id: accountId,
    version: FIRST_VERSION,
    source: 'generated' satisfies ContractSource,
    party: GENERATED_PARTY,
    docx_path: generated.docxPath,
    docx_bucket: bucketOf(generated.docxPath, 'generated'),
    pdf_path: generated.pdfPath,
    pdf_bucket: bucketOf(generated.pdfPath, 'generated'),
    author_user_id: deps.createdByUserId,
  });

  await announceNewVersion(deps.client, input.dealId, contractId, first.id);

  await advanceCurrentVersion(
    deps.client,
    input.dealId,
    contractId,
    FIRST_VERSION,
  );

  return contractId;
}

export async function appendContractVersion(
  input: AppendVersionInput,
  deps: AppendVersionDeps,
  source: ContractSource,
): Promise<Tables<'contract_version'>> {
  const { version, dealId } = await addContractVersion(input, deps, source);

  await announceNewVersion(deps.client, dealId, input.contractId, version.id);

  await advanceCurrentVersion(
    deps.client,
    dealId,
    input.contractId,
    version.version,
  );

  return version;
}

export async function addContractVersion(
  input: AppendVersionInput,
  deps: AppendVersionDeps,
  source: ContractSource,
): Promise<{ version: Tables<'contract_version'>; dealId: string }> {
  const { accountId, dealId } = await loadContractContext(
    deps.client,
    input.contractId,
  );
  const nextVersion = (await maxVersion(deps.client, input.contractId)) + 1;
  const docxPath = contractDocxPath(accountId, input.contractId, nextVersion);
  const pdf = await convertDocxToPdf(input.docxBytes);
  const pdfPath = contractPdfPath(accountId, input.contractId, nextVersion);

  await deps.storage.uploadVersion(
    docxPath,
    input.docxBytes,
    DOCX_CONTENT_TYPE,
  );

  if (pdf) {
    await deps.storage.uploadVersion(pdfPath, pdf, PDF_CONTENT_TYPE);
  }

  const version = await insertVersion(deps.client, {
    contract_id: input.contractId,
    account_id: accountId,
    version: nextVersion,
    source,
    party: input.party,
    change_summary: input.changeSummary ?? null,
    docx_path: docxPath,
    docx_bucket: 'contracts',
    pdf_path: pdf && pdfPath,
    pdf_bucket: bucketOf(pdf && pdfPath, 'contracts'),
    author_user_id: deps.authorUserId,
  });

  return { version, dealId };
}

export async function announceNewVersion(
  client: SupabaseClient<Database>,
  dealId: string,
  contractId: string,
  versionId: string,
  actorKind?: 'service',
): Promise<void> {
  await appendDealEvent(client, {
    dealId,
    aggregateType: 'contract',
    aggregateId: contractId,
    eventType: 'contract.version_added',
    payload: { version_id: versionId },
    actorKind,
  });
}

function bucketOf(
  path: string | null,
  bucket: ContractBucket,
): ContractBucket | null {
  return path === null ? null : bucket;
}

async function loadDealAccountId(
  client: SupabaseClient<Database>,
  dealId: string,
): Promise<string> {
  const { data, error } = await client
    .from('deal')
    .select('account_id')
    .eq('id', dealId)
    .single();

  if (error) {
    throw error;
  }

  return data.account_id;
}

async function loadContractContext(
  client: SupabaseClient<Database>,
  contractId: string,
): Promise<{ accountId: string; dealId: string }> {
  const { data, error } = await client
    .from('contract')
    .select('account_id, deal_id')
    .eq('id', contractId)
    .single();

  if (error) {
    throw error;
  }

  return { accountId: data.account_id, dealId: data.deal_id };
}

async function maxVersion(
  client: SupabaseClient<Database>,
  contractId: string,
): Promise<number> {
  const { data, error } = await client
    .from('contract_version')
    .select('version')
    .eq('contract_id', contractId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.version ?? 0;
}

async function insertVersion(
  client: SupabaseClient<Database>,
  row: TablesInsert<'contract_version'>,
): Promise<Tables<'contract_version'>> {
  const { data, error } = await client
    .from('contract_version')
    .insert(row)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function linkGeneratedDocument(
  client: SupabaseClient<Database>,
  generatedDocumentId: string,
  contractId: string,
): Promise<void> {
  const { error } = await client
    .from('generated_document')
    .update({ contract_id: contractId })
    .eq('id', generatedDocumentId);

  if (error) {
    throw error;
  }
}

async function advanceCurrentVersion(
  client: SupabaseClient<Database>,
  dealId: string,
  contractId: string,
  version: number,
): Promise<void> {
  await appendDealEvent(client, {
    dealId,
    aggregateType: 'contract',
    aggregateId: contractId,
    eventType: 'contract.version_set',
    payload: { current_version: version },
  });
}
