import { Context } from '@temporalio/activity';

import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import { download } from '../leadImports/discover';
import { CSL_URL } from './csl';
import { loadScreeningList } from './load';

export async function startScreeningImport({
  importId,
}: {
  importId: string;
}): Promise<void> {
  await getSupabaseServerAdminClient()
    .from('screening_import')
    .upsert(
      { id: importId, url: CSL_URL },
      { onConflict: 'id', ignoreDuplicates: true },
    )
    .throwOnError();
}

export async function failScreeningImport({
  importId,
  reason,
}: {
  importId: string;
  reason: string;
}): Promise<void> {
  console.error(`sanctions list import ${importId} failed: ${reason}`);
  await getSupabaseServerAdminClient()
    .from('screening_import')
    .update({ status: 'failed', error: reason })
    .eq('id', importId)
    .throwOnError();
}

export async function loadLatestScreeningList({
  importId,
}: {
  importId: string;
}): Promise<void> {
  await loadScreeningList(importId, await (await download(CSL_URL)).text(), () =>
    Context.current().heartbeat(),
  );
}
