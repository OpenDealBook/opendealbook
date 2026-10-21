import type { SupabaseClient } from '@supabase/supabase-js';

import {
  loadCounselThread,
  teamPostingBlock,
} from '@odb/deal-counsel/thread.ts';
import type { Database } from '@odb/supabase';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { CounselThread } from '../../counsel/[dealId]/messages/counsel-thread';

export async function soleSellerName(
  client: SupabaseClient<Database>,
  dealId: string,
): Promise<string | null> {
  const { data: sellers } = await client
    .rpc('seller_room_names', { deal_id: dealId })
    .throwOnError();

  return sellers.length === 1 ? sellers[0]!.name : null;
}

export async function CounselThreadSection({ dealId }: { dealId: string }) {
  const [buyer, seller, readOnlyReason, sellerName] = await Promise.all([
    loadCounselThread(dealId, 'buyer'),
    loadCounselThread(dealId, 'seller'),
    teamPostingBlock(dealId),
    soleSellerName(getSupabaseServerClient(), dealId),
  ]);

  return (
    <section className={'flex flex-col gap-4'}>
      <h2 className={'text-lg font-semibold'}>Counsel messages</h2>
      <CounselThread
        dealId={dealId}
        side={'buyer'}
        title={"Buyer's counsel"}
        messages={buyer}
        audience={{ kind: 'team', sellerName }}
        readOnlyReason={readOnlyReason}
      />
      <CounselThread
        dealId={dealId}
        side={'seller'}
        title={"Seller's counsel"}
        messages={seller}
        audience={{ kind: 'team', sellerName }}
        readOnlyReason={readOnlyReason}
      />
    </section>
  );
}
