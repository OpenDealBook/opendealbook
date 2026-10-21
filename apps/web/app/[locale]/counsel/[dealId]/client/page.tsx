import { notFound } from 'next/navigation';

import { counselPortalPath } from '@odb/deal-counsel/entry-rules.ts';
import { enterCounselPortalToRead } from '@odb/deal-counsel/portal-gate.ts';
import { loadSellerCounselFolder } from '@odb/deal-counsel/seller-counsel-folder.ts';
import { audienceNote } from '@odb/seller-rooms/counsel-thread/audience.ts';
import {
  loadSellerCounselThread,
  loadSellerSide,
} from '@odb/seller-rooms/counsel-thread/queries.ts';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { SellerCounselThread } from '../../../seller/(delivery)/rooms/[roomId]/counsel/seller-counsel-thread';

export default async function CounselClientThreadPage(props: {
  params: Promise<{ dealId: string }>;
}) {
  const { dealId } = await props.params;

  const portal = await enterCounselPortalToRead(dealId);

  if (!portal.sides.includes('seller')) {
    notFound();
  }

  const client = getSupabaseServerClient();
  // Service role: counsel cannot read the seller room's members or the team.
  // enterCounselPortalToRead proved the caller is seller's counsel on this deal.
  const [
    {
      data: { user },
    },
    messages,
    side,
    { data: readOnlyReason },
    folder,
  ] = await Promise.all([
    client.auth.getUser(),
    loadSellerCounselThread(client, dealId),
    loadSellerSide(getSupabaseServerAdminClient(), dealId),
    client
      .rpc('seller_side_read_only_reason', { deal_id: dealId })
      .throwOnError(),
    loadSellerCounselFolder(client, dealId),
  ]);

  return (
    <main className={'flex max-w-3xl flex-col gap-6'}>
      <h2 className={'font-serif text-2xl font-medium'}>
        Messages with your client
      </h2>
      {side.sellers.length === 0 ? (
        <p className={'text-muted-foreground'}>
          Your client is not in the seller room right now.
        </p>
      ) : (
        <SellerCounselThread
          dealId={dealId}
          readOnlyReason={readOnlyReason}
          messages={messages}
          audience={audienceNote(user!.id, side)}
          filesPath={`${counselPortalPath(dealId)}/client/files`}
        />
      )}
      {portal.readOnlyReason ? (
        <section className={'flex flex-col gap-2'}>
          <h3 className={'text-lg font-semibold'}>
            Seller&apos;s counsel folder
          </h3>
          <ul className={'flex flex-col gap-1 text-sm'}>
            {folder!.files.map((file) => (
              <li key={file.documentId}>
                <a
                  className={'underline'}
                  href={`${counselPortalPath(dealId)}/seller-room/files/${file.documentId}?disposition=download`}
                >
                  {file.name}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
