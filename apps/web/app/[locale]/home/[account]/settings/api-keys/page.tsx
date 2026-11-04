import { notFound } from 'next/navigation';

import { ApiKeysManager } from '@odb/api/components';
import { listApiKeys } from '@odb/api/server';
import { PageHeader } from '@odb/ui/page-header';

import { loadTeamWorkspace } from '../../layout';

interface TeamApiKeysPageProps {
  params: Promise<{ locale: string; account: string }>;
}

export default async function TeamApiKeysPage({
  params,
}: TeamApiKeysPageProps) {
  const { account } = await params;
  const { team, permissions } = await loadTeamWorkspace(account);

  if (!permissions.includes('api_keys.manage')) {
    notFound();
  }

  const initialKeys = await listApiKeys({ accountId: team.id });

  return (
    <main className={'flex flex-col gap-8 p-8'}>
      <PageHeader title={'API keys'} />
      <ApiKeysManager accountId={team.id} initialKeys={initialKeys} />
    </main>
  );
}
