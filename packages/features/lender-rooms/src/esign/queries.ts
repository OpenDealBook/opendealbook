import type { SupabaseClient } from '@supabase/supabase-js';

import { signersSchema } from '@odb/contracts/esign';
import type { Database } from '@odb/supabase';

export async function listFormSignatures(
  client: SupabaseClient<Database>,
  formId: string,
) {
  const { data: signatures } = await client
    .rpc('lender_form_signature_status', { ask_id: formId })
    .throwOnError();

  const { data: teamOnly } = await client
    .from('lender_form_signature')
    .select('id, signers, editor_url')
    .eq('ask_id', formId)
    .throwOnError();

  const teamDetails = new Map(teamOnly.map((detail) => [detail.id, detail]));

  return signatures.map((signature) => {
    const detail = teamDetails.get(signature.id);

    return {
      ...signature,
      signer_names: detail
        ? signersSchema.parse(detail.signers).map((signer) => signer.name)
        : null,
      editor_url:
        detail && signature.status === 'draft' ? detail.editor_url : null,
    };
  });
}
