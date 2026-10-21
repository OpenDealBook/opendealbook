import { getSupabaseServerClient } from '@odb/supabase/server';
import { DeleteTeamDialog, UpdateTeamForm } from '@odb/team-accounts';

import { zoneChoices } from '../../_components/time-zones';
import { loadTeamWorkspace } from '../layout';
import { AiProviderSetting } from './ai-provider';
import { ReloadSampleDeals } from './reload-sample-deals';
import { TeamTimezoneSetting } from './team-timezone';

interface TeamSettingsPageProps {
  params: Promise<{ locale: string; account: string }>;
}

export default async function TeamSettingsPage({
  params,
}: TeamSettingsPageProps) {
  const { locale, account } = await params;
  const { team, permissions, isOwner } = await loadTeamWorkspace(account);
  const renameAllowedAt = await loadRenameAllowedAt(team.id);
  const [{ legalEntityName, teamPhone, timezone }, aiEndpoint] =
    await Promise.all([loadTeamDetails(team.id), loadAiEndpoint(team.id)]);

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
      <TeamTimezoneSetting
        accountId={team.id}
        current={timezone}
        zones={zoneChoices(timezone)}
        canManage={permissions.includes('settings.manage')}
      />
      <AiProviderSetting
        accountId={team.id}
        current={aiEndpoint}
        canManage={permissions.includes('settings.manage')}
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
    .select('legal_entity_name, team_phone, timezone')
    .eq('id', accountId)
    .single()
    .throwOnError();

  return {
    legalEntityName: account.legal_entity_name ?? '',
    teamPhone: account.team_phone ?? '',
    timezone: account.timezone!,
  };
}

async function loadAiEndpoint(accountId: string) {
  const { data: endpoint } = await getSupabaseServerClient()
    .from('llm_endpoint')
    .select('provider, chat_model, base_url')
    .eq('account_id', accountId)
    .maybeSingle()
    .throwOnError();

  return (
    endpoint && {
      provider: endpoint.provider,
      model: endpoint.chat_model!,
      baseUrl: endpoint.base_url!,
    }
  );
}
