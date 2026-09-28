import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@tuckin/supabase';

export const CONTRACTS_BUCKET = 'contracts';

export const DOCX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const PDF_CONTENT_TYPE = 'application/pdf';

export function contractDocxPath(
  accountId: string,
  contractId: string,
  version: number,
): string {
  return `${accountId}/${contractId}/v${version}.docx`;
}

export function contractPdfPath(
  accountId: string,
  contractId: string,
  version: number,
): string {
  return `${accountId}/${contractId}/v${version}.pdf`;
}

export interface ContractStorage {
  uploadVersion(
    path: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<void>;
  downloadVersion(path: string): Promise<Uint8Array>;
}

export function createSupabaseContractStorage(
  client: SupabaseClient<Database>,
): ContractStorage {
  return {
    async uploadVersion(path, bytes, contentType) {
      const { error } = await client.storage
        .from(CONTRACTS_BUCKET)
        .upload(path, bytes, { contentType, upsert: false });

      if (error) {
        throw error;
      }
    },
    async downloadVersion(path) {
      const { data, error } = await client.storage
        .from(CONTRACTS_BUCKET)
        .download(path);

      if (error) {
        throw error;
      }

      return new Uint8Array(await data.arrayBuffer());
    },
  };
}
