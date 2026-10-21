import { enterCounselPortal } from '@odb/deal-counsel/portal-gate.ts';
import { loadCounselThread } from '@odb/deal-counsel/thread.ts';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { soleSellerName } from '../../../home/_components/counsel-thread-section';
import { recordCounselVisit } from '../counsel-visit';
import { CounselThread } from './counsel-thread';

const SIDE_LABEL = { buyer: "Buyer's counsel", seller: "Seller's counsel" };

export default async function CounselMessagesPage(props: {
  params: Promise<{ dealId: string }>;
}) {
  const { dealId } = await props.params;

  const sides = await enterCounselPortal(dealId);
  // Service role: counsel are not deal members and cannot read the deal row
  // or the seller room. enterCounselPortal proved the caller is counsel on
  // this open deal.
  const admin = getSupabaseServerAdminClient();
  const [threads, { data: deal }, sellerName] = await Promise.all([
    Promise.all(sides.map((side) => loadCounselThread(dealId, side))),
    admin
      .from('deal')
      .select('accounts!deal_account_id_fkey(name)')
      .eq('id', dealId)
      .single()
      .throwOnError(),
    soleSellerName(admin, dealId),
    recordCounselVisit(getSupabaseServerClient(), dealId, 'messages'),
  ]);
  const teamName = deal.accounts.name;

  return (
    <main className={'flex flex-col gap-6'}>
      <h2 className={'font-serif text-2xl font-medium'}>Messages</h2>
      {sides.map((side, index) => (
        <CounselThread
          key={side}
          dealId={dealId}
          side={side}
          title={`${SIDE_LABEL[side]} and the buyer's deal team at ${teamName}`}
          messages={threads[index]!}
          audience={{ kind: 'counsel', teamName, sellerName }}
        />
      ))}
    </main>
  );
}
