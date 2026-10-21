import { notFound } from 'next/navigation';

import { groupDocumentsByFolder } from '@odb/data-room';
import { enterCounselPortal } from '@odb/deal-counsel/portal-gate.ts';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { CounselDataRoom } from './counsel-data-room';
import { CounselUploads } from './counsel-uploads';

export default async function CounselDataRoomPage(props: {
  params: Promise<{ dealId: string }>;
}) {
  const { dealId } = await props.params;

  if (!(await enterCounselPortal(dealId)).includes('buyer')) {
    notFound();
  }

  const client = getSupabaseServerClient();
  const [{ data: folders }, { data: documents }, { data: uploadsFolder }] =
    await Promise.all([
      client.rpc('buyer_counsel_folders', { deal_id: dealId }).throwOnError(),
      client.rpc('buyer_counsel_documents', { deal_id: dealId }).throwOnError(),
      // Service role: the uploads folder record is the server's alone, and
      // enterCounselPortal proved the caller is buyer's counsel on this deal.
      getSupabaseServerAdminClient()
        .from('counsel_uploads_folder')
        .select('folder_id')
        .eq('deal_id', dealId)
        .maybeSingle()
        .throwOnError(),
    ]);

  const groups = groupDocumentsByFolder(folders, documents);
  const parentOf = new Map(
    folders.map((folder) => [folder.id, folder.parent_id]),
  );
  const isCounselFolder = (folderId: string | null): boolean =>
    folderId !== null &&
    (folderId === uploadsFolder?.folder_id ||
      isCounselFolder(parentOf.get(folderId) ?? null));

  return (
    <main className={'flex flex-col gap-6'}>
      <h2 className={'font-serif text-2xl font-medium'}>Data room</h2>
      <CounselUploads
        dealId={dealId}
        folders={groups
          .filter((group) => isCounselFolder(group.folderId))
          .map((group) => ({ id: group.folderId, path: group.path }))}
      />
      <CounselDataRoom dealId={dealId} groups={groups} />
    </main>
  );
}
