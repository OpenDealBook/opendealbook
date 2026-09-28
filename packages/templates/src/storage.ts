import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';

export const TEMPLATES_BUCKET = 'templates';
export const GENERATED_BUCKET = 'generated';

export function templateDocxPath(
  accountId: string,
  templateId: string,
  version: number,
): string {
  return `${accountId}/${templateId}/v${version}.docx`;
}

export function generatedDocxPath(
  accountId: string,
  dealId: string,
  documentKey: string,
): string {
  return `${accountId}/${dealId}/${documentKey}.docx`;
}

export function generatedPdfPath(
  accountId: string,
  dealId: string,
  documentKey: string,
): string {
  return `${accountId}/${dealId}/${documentKey}.pdf`;
}

export interface TemplateStorage {
  downloadTemplate(path: string): Promise<Uint8Array>;
  uploadGenerated(
    path: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<void>;
}

export function createSupabaseTemplateStorage(
  client: SupabaseClient<Database>,
): TemplateStorage {
  return {
    async downloadTemplate(path) {
      const { data, error } = await client.storage
        .from(TEMPLATES_BUCKET)
        .download(path);

      if (error) {
        throw error;
      }

      return new Uint8Array(await data.arrayBuffer());
    },
    async uploadGenerated(path, bytes, contentType) {
      const { error } = await client.storage
        .from(GENERATED_BUCKET)
        .upload(path, bytes, { contentType, upsert: true });

      if (error) {
        throw error;
      }
    },
  };
}
