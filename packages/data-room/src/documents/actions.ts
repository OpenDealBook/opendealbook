import 'server-only';
import { appendDealEvent, appendDealEvents } from '@odb/events';
import { enhanceAction } from '@odb/next/actions';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { assertDealPermission } from '../permission';
import { uploadToDataRoom } from '../storage';
import {
  bulkDownloadSchema,
  moveDocumentSchema,
  uploadDocumentSchema,
} from './schema';
import { nextVersion } from './version';

export const uploadDocument = enhanceAction(
  async (input) => {
    const client = getSupabaseServerClient();

    await assertDealPermission(client, input.dealId);

    const storagePath = await uploadToDataRoom(
      client,
      input.dealId,
      input.name,
      input.body,
    );

    const existing = await client
      .from('dr_document')
      .select('version')
      .eq('deal_id', input.dealId)
      .eq('folder_id', input.folderId)
      .eq('name', input.name);

    if (existing.error) {
      throw existing.error;
    }

    const documentId = crypto.randomUUID();
    const added = {
      aggregateType: 'dr_document' as const,
      aggregateId: documentId,
      eventType: 'dr_document.added' as const,
      payload: {
        folder_id: input.folderId,
        name: input.name,
        storage_path: storagePath,
        version: nextVersion(existing.data.map((row) => row.version)),
        checklist_item_id: input.checklistItemId ?? null,
      },
    };

    if (input.checklistItemId) {
      return appendDealEvents(client, input.dealId, [
        added,
        {
          aggregateType: 'checklist_item',
          aggregateId: input.checklistItemId,
          eventType: 'checklist_item.status_changed',
          payload: {
            status: 'received',
            received_at: new Date().toISOString(),
          },
        },
      ]);
    }

    return appendDealEvent(client, { dealId: input.dealId, ...added });
  },
  { auth: true, schema: uploadDocumentSchema },
);

export const moveDocument = enhanceAction(
  async (input) => {
    const client = getSupabaseServerClient();

    await assertDealPermission(client, input.dealId);

    return appendDealEvent(client, {
      dealId: input.dealId,
      aggregateType: 'dr_document',
      aggregateId: input.documentId,
      eventType: 'dr_document.moved',
      payload: { folder_id: input.folderId },
    });
  },
  { auth: true, schema: moveDocumentSchema },
);

export const bulkDownloadZip = enhanceAction(
  async () => {
    throw new Error('data-room bulk zip download is not implemented yet');
  },
  { auth: true, schema: bulkDownloadSchema },
);
