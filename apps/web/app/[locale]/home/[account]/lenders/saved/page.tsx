import { listLenderHistory } from '@odb/lender-rooms/crm/history/lender-history.ts';
import {
  fetchQuietDays,
  listLendersToNudge,
} from '@odb/lender-rooms/crm/nudges/nudges.ts';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { LenderDirectory } from '../../../_components/lender-crm/lender-directory';
import { LendersToNudge } from '../../../_components/lender-crm/lenders-to-nudge';
import { SAVED_LENDER_COLUMNS } from '../../../_components/lender-crm/saved-lender';
import { loadTeamWorkspace } from '../../layout';

export default async function TeamSavedLendersPage(props: {
  params: Promise<{ account: string }>;
}) {
  const { account } = await props.params;
  const { team } = await loadTeamWorkspace(account);
  const client = getSupabaseServerClient();
  const teamPath = `/home/${account}`;

  const [{ data: lenders }, toNudge, quietDays] = await Promise.all([
    client
      .from('lender')
      .select(SAVED_LENDER_COLUMNS)
      .eq('account_id', team.id)
      .order('name')
      .throwOnError(),
    listLendersToNudge(client, team.id),
    fetchQuietDays(client, team.id),
  ]);
  const histories = await Promise.all(
    lenders.map(
      async (lender) =>
        [lender.id, await listLenderHistory(client, lender.id)] as const,
    ),
  ).then(Object.fromEntries);

  return (
    <div className={'flex flex-col gap-10'}>
      <LendersToNudge
        accountId={team.id}
        teamPath={teamPath}
        quietDays={quietDays}
        lenders={toNudge}
      />
      <LenderDirectory
        accountId={team.id}
        teamPath={teamPath}
        lenders={lenders}
        histories={histories}
      />
    </div>
  );
}
