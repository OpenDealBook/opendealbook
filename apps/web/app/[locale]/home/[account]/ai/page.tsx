import {
  aiThreadDeal,
  dealName,
  listAiThreads,
  listAskableDeals,
  loadDealAsk,
  teamAiConnected,
} from '../../_lib/deal-ask-data';
import { loadTeamWorkspace } from '../layout';
import { AiHome } from './ai-home';

export default async function TeamAiPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; account: string }>;
  searchParams: Promise<{ thread?: string; deal?: string }>;
}) {
  const { account } = await params;
  const { thread: threadId, deal } = await searchParams;
  const { user, team, permissions } = await loadTeamWorkspace(account);
  const [firstPage, deals, aiConnected, threadDeal] = await Promise.all([
    listAiThreads(team.id),
    permissions.includes('deals.work') ? listAskableDeals(team.id) : [],
    teamAiConnected(user.id, team.id),
    threadId ? aiThreadDeal(threadId, team.id) : null,
  ]);
  async function openOn(dealId: string, threadId: string | null) {
    const ask = await loadDealAsk(dealId, team.id);
    return (
      ask && {
        dealId,
        threadId,
        ask: { ...ask, questions: threadId ? ask.questions : [] },
      }
    );
  }

  const newest = firstPage.threads[0];
  const open =
    (threadDeal && (await openOn(threadDeal, threadId!))) ||
    (deal && (await openOn(deal, null))) ||
    (newest && (await openOn(newest.dealId, newest.id))) ||
    null;
  const opened = open && {
    ...open,
    dealName: await dealName(open.dealId),
    dealHref: `/home/${account}/deals/${open.dealId}`,
  };

  return (
    <AiHome
      basePath={`/home/${account}/ai`}
      teamId={team.id}
      firstPage={firstPage}
      deals={deals}
      aiConnected={aiConnected}
      settingsHref={`/home/${account}/settings`}
      open={opened}
      viewerId={user.id}
      now={Date.now()}
    />
  );
}
