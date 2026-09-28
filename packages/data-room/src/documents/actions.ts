import 'server-only';
import { enhanceAction } from '@odb/next/actions';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { assertDealPermission, resolveDealAccountId } from '../permission';
import { uploadToDataRoom } from '../storage';
import {
  bulkDownloadSchema,
  moveDocumentSchema,
  uploadDocumentSchema,
} from './schema';
import { nextVersion } from './version';

export const uploadDocument = enhanceAction(
  async (input, user) => {
    const client = getSupabaseServerClient();

    await assertDealPermission(client, input.dealId);
    const accountId = await resolveDealAccountId(client, input.dealId);

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

    const version = nextVersion(existing.data.map((row) => row.version));

    const { data, error } = await client
      .from('dr_document')
      .insert({
        account_id: accountId,
        deal_id: input.dealId,
        folder_id: input.folderId,
        name: input.name,
        storage_path: storagePath,
        version,
        uploaded_by: user.id,
        checklist_item_id: input.checklistItemId ?? null,
      })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    if (input.checklistItemId) {
      const flip = await client
        .from('checklist_item')
        .update({ status: 'received', received_at: new Date().toISOString() })
        .eq('id', input.checklistItemId);

      if (flip.error) {
        throw flip.error;
      }
    }

    return data;
  },
  { auth: true, schema: uploadDocumentSchema },
);

export const moveDocument = enhanceAction(
  async (input) => {
    const client = getSupabaseServerClient();

    await assertDealPermission(client, input.dealId);

    const { data, error } = await client
      .from('dr_document')
      .update({ folder_id: input.folderId })
      .eq('deal_id', input.dealId)
      .eq('id', input.documentId)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return data;
  },
  { auth: true, schema: moveDocumentSchema },
);

export const bulkDownloadZip = enhanceAction(
  async () => {
    throw new Error('data-room bulk zip download is not implemented yet');
  },
  { auth: true, schema: bulkDownloadSchema },
);
