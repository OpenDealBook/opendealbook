import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';

export async function currentBlankForm(
  client: SupabaseClient<Database>,
  formId: string,
) {
  const { data: blankFormFile } = await client
    .from('lender_ask_file')
    .select('dr_document_id')
    .eq('ask_id', formId)
    .eq('role', 'blank_form')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
    .throwOnError();

  const { data: blankForm } = await client
    .from('dr_document')
    .select('name, storage_path')
    .eq('id', blankFormFile.dr_document_id)
    .single()
    .throwOnError();

  return blankForm;
}
