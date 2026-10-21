import 'server-only';
import { appendDealEvent, appendDealEvents } from '@odb/events';
import { enhanceAction } from '@odb/next/actions';
import { refusableAction } from '@odb/next/actions/refusable-action';
import {
  getSupabaseServerAdminClient,
  getSupabaseServerClient,
} from '@odb/supabase/server';

import { assertDealPermission } from '../permission';
import { DATA_ROOM_BUCKET, uploadToDataRoom } from '../storage';
import {
  bulkDownloadSchema,
  moveDocumentSchema,
  uploadDocumentSchema,
} from './schema';
import { nextVersion } from './version';

async function removeStoredFile(storagePath: string): Promise<void> {
  const { data, error } = await getSupabaseServerAdminClient()
    .storage.from(DATA_ROOM_BUCKET)
    .remove([storagePath]);

  if (error) {
    throw error;
  }

  if (data.length === 0) {
    throw new Error(`stored file ${storagePath} was not removed`);
  }
}

export const uploadDocument = refusableAction(
  async (input) => {
    const client = getSupabaseServerClient();

    await assertDealPermission(client, input.dealId, 'deals.work');

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
      },
    };

    const appended = input.checklistItemId
      ? appendDealEvents(client, input.dealId, [
          added,
          {
            aggregateType: 'checklist_item',
            aggregateId: input.checklistItemId,
            eventType: 'checklist_item.document_linked',
            payload: { document_id: documentId },
          },
          {
            aggregateType: 'checklist_item',
            aggregateId: input.checklistItemId,
            eventType: 'checklist_item.status_changed',
            payload: {
              status: 'received',
              received_at: new Date().toISOString(),
            },
          },
        ])
      : appendDealEvent(client, { dealId: input.dealId, ...added });

    return appended.catch(async (error: unknown) => {
      await removeStoredFile(storagePath);
      throw error;
    });
  },
  uploadDocumentSchema,
  {
    what: 'upload documents',
    needs: 'deals.work',
    dealId: (input) => input.dealId,
  },
);

export const moveDocument = refusableAction(
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
  moveDocumentSchema,
  {
    what: 'move documents',
    needs: 'deals.manage',
    dealId: (input) => input.dealId,
  },
);

export const bulkDownloadZip = enhanceAction(
  async () => {
    throw new Error('data-room bulk zip download is not implemented yet');
  },
  { auth: true, schema: bulkDownloadSchema },
);
