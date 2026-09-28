import 'server-only';
import { enhanceAction } from '@odb/next/actions';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { assertDealPermission, resolveDealAccountId } from '../permission';
import {
  createFolderSchema,
  moveFolderSchema,
  renameFolderSchema,
  reorderFoldersSchema,
} from './schema';

export const createFolder = enhanceAction(
  async (input) => {
    const client = getSupabaseServerClient();

    await assertDealPermission(client, input.dealId);
    const accountId = await resolveDealAccountId(client, input.dealId);

    const { data, error } = await client
      .from('dr_folder')
      .insert({
        account_id: accountId,
        deal_id: input.dealId,
        parent_id: input.parentId ?? null,
        name: input.name,
      })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return data;
  },
  { auth: true, schema: createFolderSchema },
);

export const renameFolder = enhanceAction(
  async (input) => {
    const client = getSupabaseServerClient();

    await assertDealPermission(client, input.dealId);

    const { data, error } = await client
      .from('dr_folder')
      .update({ name: input.name })
      .eq('deal_id', input.dealId)
      .eq('id', input.folderId)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return data;
  },
  { auth: true, schema: renameFolderSchema },
);

export const moveFolder = enhanceAction(
  async (input) => {
    const client = getSupabaseServerClient();

    await assertDealPermission(client, input.dealId);

    const { data, error } = await client
      .from('dr_folder')
      .update({ parent_id: input.parentId ?? null })
      .eq('deal_id', input.dealId)
      .eq('id', input.folderId)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return data;
  },
  { auth: true, schema: moveFolderSchema },
);

// dr_folder.sort_order has no unique constraint, so positions are assigned
// directly by index; no temp-slot shuffle is needed to avoid a collision.
export const reorderFolders = enhanceAction(
  async (input) => {
    const client = getSupabaseServerClient();

    await assertDealPermission(client, input.dealId);

    const results = await Promise.all(
      input.orderedIds.map((id, index) =>
        client
          .from('dr_folder')
          .update({ sort_order: index })
          .eq('deal_id', input.dealId)
          .eq('id', id),
      ),
    );

    const failed = results.find((result) => result.error);

    if (failed?.error) {
      throw failed.error;
    }

    return input.orderedIds;
  },
  { auth: true, schema: reorderFoldersSchema },
);
