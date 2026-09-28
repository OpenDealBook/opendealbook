import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Tables, TablesInsert } from '@odb/supabase';

import {
  type ContractStorage,
  DOCX_CONTENT_TYPE,
  contractDocxPath,
} from '../storage';
import type { ContractParty, ContractSource, ContractType } from '../types';

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
): Promise<Tables<'contract'>> {
  const accountId = await loadDealAccountId(deps.client, input.dealId);

  const { data: contract, error } = await deps.client
    .from('contract')
    .insert({
      deal_id: input.dealId,
      account_id: accountId,
      type: input.type,
      status: 'draft',
      current_version: 0,
      created_by: deps.createdByUserId,
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  if (!input.fromTemplateId) {
    return contract;
  }

  const generated = await deps.generateVersionOne({
    contractId: contract.id,
    accountId,
    dealId: input.dealId,
    templateId: input.fromTemplateId,
  });

  await linkGeneratedDocument(
    deps.client,
    generated.generatedDocumentId,
    contract.id,
  );

  await insertVersion(deps.client, {
    contract_id: contract.id,
    account_id: accountId,
    version: FIRST_VERSION,
    source: 'generated' satisfies ContractSource,
    party: GENERATED_PARTY,
    docx_path: generated.docxPath,
    pdf_path: generated.pdfPath,
    author_user_id: deps.createdByUserId,
  });

  return advanceCurrentVersion(deps.client, contract.id, FIRST_VERSION);
}

export async function appendContractVersion(
  input: AppendVersionInput,
  deps: AppendVersionDeps,
  source: ContractSource,
): Promise<Tables<'contract_version'>> {
  const accountId = await loadContractAccountId(deps.client, input.contractId);
  const nextVersion = (await maxVersion(deps.client, input.contractId)) + 1;
  const docxPath = contractDocxPath(accountId, input.contractId, nextVersion);

  await deps.storage.uploadVersion(
    docxPath,
    input.docxBytes,
    DOCX_CONTENT_TYPE,
  );

  const version = await insertVersion(deps.client, {
    contract_id: input.contractId,
    account_id: accountId,
    version: nextVersion,
    source,
    party: input.party,
    change_summary: input.changeSummary ?? null,
    docx_path: docxPath,
    author_user_id: deps.authorUserId,
  });

  await advanceCurrentVersion(deps.client, input.contractId, nextVersion);

  return version;
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

async function loadContractAccountId(
  client: SupabaseClient<Database>,
  contractId: string,
): Promise<string> {
  const { data, error } = await client
    .from('contract')
    .select('account_id')
    .eq('id', contractId)
    .single();

  if (error) {
    throw error;
  }

  return data.account_id;
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
  contractId: string,
  version: number,
): Promise<Tables<'contract'>> {
  const { data, error } = await client
    .from('contract')
    .update({ current_version: version })
    .eq('id', contractId)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
}
