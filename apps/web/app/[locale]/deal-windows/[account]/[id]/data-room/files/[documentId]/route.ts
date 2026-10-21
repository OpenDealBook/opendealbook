import {
  dispositionSchema,
  signedDocumentUrl,
} from '@odb/lender-rooms/activity/signed-document-url.ts';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { loadTeamWorkspace } from '../../../../../../home/[account]/layout';
import { loadWindowDeal } from '../../view/window-deal';

export async function GET(
  request: Request,
  {
    params,
  }: { params: Promise<{ account: string; id: string; documentId: string }> },
) {
  const { account, id, documentId } = await params;
  const { team } = await loadTeamWorkspace(account);
  const client = getSupabaseServerClient();
  await loadWindowDeal(client, team.id, id);
  const { data: document } = await client
    .from('dr_document')
    .select('name, deal_id, storage_path')
    .eq('id', documentId)
    .eq('deal_id', id)
    .maybeSingle()
    .throwOnError();

  if (!document) {
    return new Response(null, { status: 404 });
  }

  const url = await signedDocumentUrl(
    getSupabaseServerAdminClient(),
    document,
    dispositionSchema.parse(
      new URL(request.url).searchParams.get('disposition'),
    ),
  );

  return Response.redirect(url!, 307);
}
