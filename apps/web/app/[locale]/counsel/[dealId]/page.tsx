import { enterCounselPortal } from '@odb/deal-counsel/portal-gate.ts';
import { loadCounselThread } from '@odb/deal-counsel/thread.ts';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { unreadTeamMessages } from '../../home/_lib/counsel-deals';
import { MainContacts } from '../../lender/[roomId]/main-contacts';
import { SharedTimeline } from '../../lender/[roomId]/shared-timeline';
import { SharedUpdates } from '../../lender/[roomId]/shared-updates';
import { lastCounselVisits } from './counsel-visit';
import { NeedsYou, upcomingDates } from './needs-you';
import { counselOpenReviews } from './open-reviews';
import { sellerRoomActivity } from './seller-room-activity';

const SHOWN_PER_GROUP = 5;

export default async function CounselPortalPage(props: {
  params: Promise<{ dealId: string }>;
}) {
  const { dealId } = await props.params;

  const sides = await enterCounselPortal(dealId);

  const client = getSupabaseServerClient();
  const [
    { data: contacts },
    { data: milestones },
    { data: updates },
    reviews,
    threads,
    roomActivity,
    messageVisits,
  ] = await Promise.all([
    client.rpc('counsel_main_contacts', { deal_id: dealId }).throwOnError(),
    client.rpc('counsel_timeline', { deal_id: dealId }).throwOnError(),
    client.rpc('counsel_updates', { deal_id: dealId }).throwOnError(),
    counselOpenReviews(
      client,
      getSupabaseServerAdminClient(),
      dealId,
      sides.includes('buyer') ? 'buyer' : 'seller',
    ),
    Promise.all(sides.map((side) => loadCounselThread(dealId, side))),
    sides.includes('seller')
      ? sellerRoomActivity(client, dealId, SHOWN_PER_GROUP)
      : [],
    lastCounselVisits(client, 'messages'),
  ]);

  return (
    <main className={'flex flex-col gap-8'}>
      <NeedsYou
        dealId={dealId}
        reviews={reviews}
        messages={unreadTeamMessages(
          threads.flat(),
          messageVisits.get(dealId) ?? null,
        ).slice(0, SHOWN_PER_GROUP)}
        roomActivity={roomActivity}
        dates={upcomingDates(milestones, new Date().toISOString().slice(0, 10))}
      />
      <MainContacts contacts={contacts} />
      <SharedTimeline milestones={milestones} />
      <SharedUpdates updates={updates} />
    </main>
  );
}
