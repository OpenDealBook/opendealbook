import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Tables } from '@odb/supabase';

import { basename, DATA_ROOM_BUCKET, dataRoomObjectPath } from '../storage';
import type { ZipEntry } from './entries';

type Client = SupabaseClient<Database>;

export interface StageBatchParams {
  accountId: string;
  dealId: string;
  createdBy: string;
  kind: Database['public']['Enums']['upload_batch_kind'];
  sourceFilename: string | null;
  entries: ZipEntry[];
}

export interface StagedBatch {
  batch: Tables<'upload_batch'>;
  items: Tables<'upload_item'>[];
}

export async function stageBatch(
  client: Client,
  params: StageBatchParams,
): Promise<StagedBatch> {
  const created = await client
    .from('upload_batch')
    .insert({
      account_id: params.accountId,
      deal_id: params.dealId,
      created_by: params.createdBy,
      kind: params.kind,
      source_filename: params.sourceFilename,
      status: 'extracting',
      file_count: params.entries.length,
    })
    .select('*')
    .single();

  if (created.error) {
    throw created.error;
  }

  const rows = [];

  for (const entry of params.entries) {
    const storagePath = dataRoomObjectPath(
      params.dealId,
      basename(entry.originalPath),
    );

    const uploaded = await client.storage
      .from(DATA_ROOM_BUCKET)
      .upload(storagePath, entry.bytes, {
        upsert: false,
        contentType: entry.contentType ?? undefined,
      });

    if (uploaded.error) {
      throw uploaded.error;
    }

    rows.push({
      batch_id: created.data.id,
      storage_path: storagePath,
      original_path: entry.originalPath,
      size_bytes: entry.bytes.length,
      content_type: entry.contentType,
      status: 'pending' as const,
    });
  }

  const items = await client.from('upload_item').insert(rows).select('*');

  if (items.error) {
    throw items.error;
  }

  const ready = await client
    .from('upload_batch')
    .update({ status: 'ready' })
    .eq('id', created.data.id)
    .select('*')
    .single();

  if (ready.error) {
    throw ready.error;
  }

  return { batch: ready.data, items: items.data };
}
