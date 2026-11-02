import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

export async function purgeRemovedDocumentText(): Promise<void> {
  await getSupabaseServerAdminClient()
    .rpc('purge_removed_document_text')
    .throwOnError();
}
