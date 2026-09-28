import type { SupabaseClient } from '@supabase/supabase-js';

import { appendDealEvent } from '@odb/events';
import type { Database, Tables } from '@odb/supabase';

import { nextVersion } from '../documents/version';
import { basename } from '../storage';

type Client = SupabaseClient<Database>;

export interface ExpandBatchParams {
  dealId: string;
  batchId: string;
  targetFolderId: string;
}

export interface ExpandResult {
  imported: number;
  failed: number;
  items: Tables<'upload_item'>[];
}

export async function expandBatch(
  client: Client,
  params: ExpandBatchParams,
): Promise<ExpandResult> {
  const pending = await client
    .from('upload_item')
    .select('*')
    .eq('batch_id', params.batchId)
    .eq('status', 'pending');

  if (pending.error) {
    throw pending.error;
  }

  const items: Tables<'upload_item'>[] = [];
  let imported = 0;
  let failed = 0;

  for (const item of pending.data) {
    const result = await importItem(client, params, item);
    items.push(result);

    if (result.status === 'imported') {
      imported += 1;
    } else {
      failed += 1;
    }
  }

  const batch = await client
    .from('upload_batch')
    .update({ status: 'imported' })
    .eq('id', params.batchId);

  if (batch.error) {
    throw batch.error;
  }

  return { imported, failed, items };
}

async function importItem(
  client: Client,
  params: ExpandBatchParams,
  item: Tables<'upload_item'>,
): Promise<Tables<'upload_item'>> {
  try {
    const name = basename(item.original_path);

    const existing = await client
      .from('dr_document')
      .select('version')
      .eq('deal_id', params.dealId)
      .eq('folder_id', params.targetFolderId)
      .eq('name', name);

    if (existing.error) {
      throw existing.error;
    }

    const documentId = crypto.randomUUID();

    await appendDealEvent(client, {
      dealId: params.dealId,
      aggregateType: 'dr_document',
      aggregateId: documentId,
      eventType: 'dr_document.added',
      payload: {
        folder_id: params.targetFolderId,
        name,
        storage_path: item.storage_path,
        version: nextVersion(existing.data.map((row) => row.version)),
        checklist_item_id: null,
      },
    });

    return updateItem(client, item.id, {
      status: 'imported',
      dr_document_id: documentId,
      target_folder_id: params.targetFolderId,
    });
  } catch (error) {
    return updateItem(client, item.id, {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function updateItem(
  client: Client,
  itemId: string,
  patch: Database['public']['Tables']['upload_item']['Update'],
): Promise<Tables<'upload_item'>> {
  const updated = await client
    .from('upload_item')
    .update(patch)
    .eq('id', itemId)
    .select('*')
    .single();

  if (updated.error) {
    throw updated.error;
  }

  return updated.data;
}
