import { notFound } from 'next/navigation';

import { DealAskPanel } from '../../../../_components/deal-ask-panel';
import { loadDealAsk } from '../../../../_lib/deal-ask-data';
import { loadTeamWorkspace } from '../../../layout';

export default async function TeamDealAskPage({
  params,
}: {
  params: Promise<{ locale: string; account: string; id: string }>;
}) {
  const { account, id } = await params;
  const { user, team } = await loadTeamWorkspace(account);
  const ask = await loadDealAsk(id, team.id);

  if (!ask) {
    notFound();
  }

  return (
    <main className={'flex min-w-0 flex-col gap-6 p-4 md:p-8'}>
      <DealAskPanel
        {...ask}
        dealId={id}
        viewerId={user.id}
        now={Date.now()}
        settingsHref={`/home/${account}/settings`}
      />
    </main>
  );
}
