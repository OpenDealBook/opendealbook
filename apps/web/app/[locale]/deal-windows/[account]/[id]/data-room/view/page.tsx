import { dealDisplayName } from '@odb/deals/shared';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { loadTeamWorkspace } from '../../../../../home/[account]/layout';
import { DataRoomWindow } from '../../../../../home/_components/data-room-window';
import { initialPage } from './initial-page';
import { loadWindowDeal } from './window-deal';
import { loadWindowFolders } from './window-folders';

export default async function DataRoomWindowPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; account: string; id: string }>;
  searchParams: Promise<{ doc?: string; page?: string; sheet?: string }>;
}) {
  const [{ account, id }, { doc, page, sheet }] = await Promise.all([
    params,
    searchParams,
  ]);
  const { team } = await loadTeamWorkspace(account);
  const client = getSupabaseServerClient();
  const [folders, deal] = await Promise.all([
    loadWindowFolders(client, id),
    loadWindowDeal(client, team.id, id),
  ]);
  const windowHref = `/deal-windows/${account}/${id}/data-room`;

  return (
    <DataRoomWindow
      dealName={dealDisplayName(deal)}
      dealHref={`/home/${account}/deals/${id}`}
      viewHref={`${windowHref}/view`}
      filesHref={`${windowHref}/files`}
      folders={folders}
      selectedId={doc ?? null}
      initialPage={initialPage(page)}
      initialSheet={sheet}
    />
  );
}
