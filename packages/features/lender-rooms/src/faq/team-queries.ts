import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Enums } from '@odb/supabase';

export interface TeamFaqEntry {
  id: string;
  question: string;
  answer: string;
  status: Enums<'lender_faq_status'>;
  pinned: boolean;
  version: number;
  files: { id: string; name: string }[];
  hiddenRoomIds: string[];
}

export async function fetchDealFaq(
  client: SupabaseClient<Database>,
  dealId: string,
): Promise<TeamFaqEntry[]> {
  const { data } = await client
    .from('lender_faq_entry')
    .select(
      'id, question, answer, status, pinned, version, files:lender_faq_file(id, name), hidden:lender_faq_hidden(room_id)',
    )
    .eq('deal_id', dealId)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .throwOnError();

  return data.map(({ hidden, ...entry }) => ({
    ...entry,
    hiddenRoomIds: hidden.map((room) => room.room_id),
  }));
}

export async function searchDealFaq(
  client: SupabaseClient<Database>,
  dealId: string,
  query: string,
): Promise<{ id: string; question: string }[]> {
  const { data } = await client
    .rpc('lender_deal_faq_search', { deal_id: dealId, query })
    .throwOnError();

  return data;
}

export async function fencedFolderIds(
  client: SupabaseClient<Database>,
  dealId: string,
): Promise<Set<string>> {
  const [{ data: lenderRooms }, { data: sellerRooms }, { data: folders }] =
    await Promise.all([
      client
        .from('lender_room')
        .select('private_folder_id')
        .eq('deal_id', dealId)
        .throwOnError(),
      client
        .from('seller_room')
        .select('uploads_folder_id')
        .eq('deal_id', dealId)
        .throwOnError(),
      client
        .from('dr_folder')
        .select('id, parent_id')
        .eq('deal_id', dealId)
        .throwOnError(),
    ]);
  const roots = new Set([
    ...lenderRooms.map((room) => room.private_folder_id),
    ...sellerRooms.map((room) => room.uploads_folder_id),
  ]);
  const parentOf = new Map(
    folders.map((folder) => [folder.id, folder.parent_id]),
  );
  const isFenced = (id: string | null | undefined): boolean =>
    !!id && (roots.has(id) || isFenced(parentOf.get(id)));

  return new Set(
    folders.filter((folder) => isFenced(folder.id)).map((folder) => folder.id),
  );
}

export async function listDealDocuments(
  client: SupabaseClient<Database>,
  dealId: string,
): Promise<{ id: string; name: string }[]> {
  const [fenced, { data }] = await Promise.all([
    fencedFolderIds(client, dealId),
    client
      .from('dr_document')
      .select('id, name, folder_id')
      .eq('deal_id', dealId)
      .order('name')
      .throwOnError(),
  ]);

  return data
    .filter((document) => !fenced.has(document.folder_id))
    .map(({ id, name }) => ({ id, name }));
}
