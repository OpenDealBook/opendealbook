import { getSupabaseServerClient } from '@odb/supabase/server';
import { DeleteTeamDialog, UpdateTeamForm } from '@odb/team-accounts';

import { loadTeamWorkspace } from '../layout';
import { ReloadSampleDeals } from './reload-sample-deals';

interface TeamSettingsPageProps {
  params: Promise<{ locale: string; account: string }>;
}

export default async function TeamSettingsPage({
  params,
}: TeamSettingsPageProps) {
  const { locale, account } = await params;
  const { team, permissions, isOwner } = await loadTeamWorkspace(account);
  const renameAllowedAt = await loadRenameAllowedAt(team.id);
  const { legalEntityName, teamPhone } = await loadTeamDetails(team.id);

  return (
    <main className={'flex flex-col gap-8 p-8'}>
      <UpdateTeamForm
        accountId={team.id}
        name={team.name}
        legalEntityName={legalEntityName}
        teamPhone={teamPhone}
        slug={account}
        permissions={permissions}
        locale={locale}
        renameAllowedAt={renameAllowedAt}
      />
      {isOwner ? <ReloadSampleDeals accountId={team.id} /> : null}
      <DeleteTeamDialog accountId={team.id} isOwner={isOwner} />
    </main>
  );
}

async function loadRenameAllowedAt(accountId: string) {
  const client = getSupabaseServerClient();
  const { data: account } = await client
    .from('accounts')
    .select('renamed_at')
    .eq('id', accountId)
    .single()
    .throwOnError();

  if (!account.renamed_at) {
    return undefined;
  }

  const { data: allowedAt } = await client
    .rpc('team_rename_allowed_at', { last_renamed_at: account.renamed_at })
    .throwOnError();

  return allowedAt ?? undefined;
}

async function loadTeamDetails(accountId: string) {
  const { data: account } = await getSupabaseServerClient()
    .from('accounts')
    .select('legal_entity_name, team_phone')
    .eq('id', accountId)
    .single()
    .throwOnError();

  return {
    legalEntityName: account.legal_entity_name ?? '',
    teamPhone: account.team_phone ?? '',
  };
}
