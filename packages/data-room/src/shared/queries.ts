import type { Tables } from '@odb/supabase';
import type { getSupabaseBrowserClient } from '@odb/supabase/client';

type Client = ReturnType<typeof getSupabaseBrowserClient>;

export async function fetchFolders(
  client: Client,
  dealId: string,
): Promise<Tables<'dr_folder'>[]> {
  const { data, error } = await client
    .from('dr_folder')
    .select('*')
    .eq('deal_id', dealId);

  if (error) {
    throw error;
  }

  return data;
}

export async function fetchDocuments(
  client: Client,
  dealId: string,
): Promise<Tables<'dr_document'>[]> {
  const { data, error } = await client
    .from('dr_document')
    .select('*')
    .eq('deal_id', dealId);

  if (error) {
    throw error;
  }

  return data;
}

export async function listByFolder(
  client: Client,
  folderId: string,
): Promise<Tables<'dr_document'>[]> {
  const { data, error } = await client
    .from('dr_document')
    .select('*')
    .eq('folder_id', folderId)
    .order('name', { ascending: true })
    .order('version', { ascending: false });

  if (error) {
    throw error;
  }

  return data;
}
