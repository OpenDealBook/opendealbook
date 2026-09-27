import { ApiKeysManager } from '@tuckin/api/components';
import { listApiKeys } from '@tuckin/api/server';

import { loadTeamWorkspace } from '../../layout';

interface TeamApiKeysPageProps {
  params: Promise<{ locale: string; account: string }>;
}

export default async function TeamApiKeysPage({
  params,
}: TeamApiKeysPageProps) {
  const { account } = await params;
  const { team } = await loadTeamWorkspace(account);

  const initialKeys = await listApiKeys({ accountId: team.id });

  return (
    <main className={'flex flex-col gap-8 p-8'}>
      <h1 className={'text-2xl font-semibold'}>API keys</h1>
      <ApiKeysManager accountId={team.id} initialKeys={initialKeys} />
    </main>
  );
}
