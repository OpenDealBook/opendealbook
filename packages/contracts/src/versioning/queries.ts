import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';

import { DOCX_CONTENT_TYPE, PDF_CONTENT_TYPE } from '../storage';

type Client = SupabaseClient<Database>;

export interface ContractVersionSummary {
  id: string;
  version: number;
  party: string;
  change_summary: string | null;
  is_signed: boolean;
}

export interface ContractSummary {
  id: string;
  type: string;
  versions: ContractVersionSummary[];
}

const FILES = {
  docx: { contentType: DOCX_CONTENT_TYPE, filename: 'contract.docx' },
  pdf: { contentType: PDF_CONTENT_TYPE, filename: 'contract.pdf' },
};

// For the team and buyer's counsel: row security decides what they see.
export async function visibleContracts(
  client: Client,
  dealId: string,
): Promise<(ContractSummary & { current_version: number | null })[]> {
  const { data } = await client
    .from('contract')
    .select(
      'id, type, current_version, versions:contract_version(id, version, party, change_summary, is_signed)',
    )
    .eq('deal_id', dealId)
    .order('created_at')
    .order('version', { referencedTable: 'contract_version' })
    .throwOnError();

  return data;
}

export async function sellerSideContracts(
  client: Client,
  dealId: string,
): Promise<ContractSummary[]> {
  const [{ data: contracts }, { data: versions }] = await Promise.all([
    client.rpc('seller_side_contracts', { deal_id: dealId }).throwOnError(),
    client
      .rpc('seller_side_contract_versions', { deal_id: dealId })
      .throwOnError(),
  ]);

  return contracts.map((contract) => ({
    id: contract.id,
    type: contract.type,
    versions: versions
      .filter((version) => version.contract_id === contract.id)
      .map(({ id, version, party, change_summary, is_signed }) => ({
        id,
        version,
        party,
        change_summary,
        is_signed,
      })),
  }));
}

// The seller side reads no version rows, so a version they may see comes
// from seller_side_contract_version.
export async function visibleVersion(
  client: Client,
  contractVersionId: string,
): Promise<{ accountId: string; dealId: string } | null> {
  const { data: direct } = await client
    .from('contract_version')
    .select('account_id, contract!inner(deal_id)')
    .eq('id', contractVersionId)
    .maybeSingle()
    .throwOnError();

  if (direct) {
    return { accountId: direct.account_id, dealId: direct.contract.deal_id };
  }

  const { data: sellerSide } = await client
    .rpc('seller_side_contract_version', {
      contract_version_id: contractVersionId,
    })
    .maybeSingle()
    .throwOnError();

  return sellerSide
    ? { accountId: sellerSide.account_id, dealId: sellerSide.deal_id }
    : null;
}

// The file is read with the service role once the viewer's own read has
// proven they may see the version. Its path names the real version number,
// so it never leaves the server.
export async function contractVersionFile(
  client: Client,
  admin: Client,
  contractVersionId: string,
  kind: keyof typeof FILES,
): Promise<{
  bytes: Uint8Array;
  contentType: string;
  filename: string;
} | null> {
  if (!(await visibleVersion(client, contractVersionId))) {
    return null;
  }

  const location = (await versionFiles(admin, [contractVersionId]))[0]![kind];

  return location
    ? { bytes: await downloadFile(admin, location), ...FILES[kind] }
    : null;
}

export interface FileLocation {
  bucket: string;
  path: string;
}

export async function versionFiles(
  admin: Client,
  contractVersionIds: string[],
): Promise<
  { id: string; docx: FileLocation | null; pdf: FileLocation | null }[]
> {
  const { data } = await admin
    .from('contract_version')
    .select('id, docx_path, docx_bucket, pdf_path, pdf_bucket')
    .in('id', contractVersionIds)
    .throwOnError();

  return contractVersionIds.map((id) => {
    const row = data.find((candidate) => candidate.id === id)!;

    return {
      id,
      docx:
        row.docx_path === null
          ? null
          : { bucket: row.docx_bucket!, path: row.docx_path },
      pdf:
        row.pdf_path === null
          ? null
          : { bucket: row.pdf_bucket!, path: row.pdf_path },
    };
  });
}

export async function downloadFile(
  admin: Client,
  { bucket, path }: FileLocation,
): Promise<Uint8Array> {
  const { data, error } = await admin.storage.from(bucket).download(path);

  if (error) {
    throw error;
  }

  return new Uint8Array(await data.arrayBuffer());
}
