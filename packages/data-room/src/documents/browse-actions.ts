'use server';
import { enhanceAction } from '@odb/next/actions';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { assertDealPermission } from '../permission';
import { dataRoomSignedUrl } from '../storage';
import { documentSignedUrlSchema } from './schema';

export const createDocumentSignedUrl = enhanceAction(
  async (input) => {
    const client = getSupabaseServerClient();

    await assertDealPermission(client, input.dealId);

    const { data, error } = await client
      .from('dr_document')
      .select('storage_path')
      .eq('id', input.documentId)
      .eq('deal_id', input.dealId)
      .single();

    if (error) {
      throw error;
    }

    return dataRoomSignedUrl(client, data.storage_path);
  },
  { auth: true, schema: documentSignedUrlSchema },
);
