import { DeleteTeamDialog, UpdateTeamForm } from '@tuckin/team-accounts';

import { loadTeamWorkspace } from '../layout';

interface TeamSettingsPageProps {
  params: Promise<{ locale: string; account: string }>;
}

export default async function TeamSettingsPage({
  params,
}: TeamSettingsPageProps) {
  const { account } = await params;
  const { team, permissions, isOwner } = await loadTeamWorkspace(account);

  return (
    <main className={'flex flex-col gap-8 p-8'}>
      <UpdateTeamForm
        accountId={team.id}
        name={team.name}
        slug={account}
        permissions={permissions}
      />
      <DeleteTeamDialog accountId={team.id} isOwner={isOwner} />
    </main>
  );
}
