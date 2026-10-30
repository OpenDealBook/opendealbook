import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { z } from 'zod';

import {
  contractVersionViews,
  sellerConfirmContractReview,
  sellerSideContracts,
  versionComments,
} from '@odb/contracts';
import { isSignedIn } from '@odb/lender-rooms/members/room-gate.ts';
import {
  sellerRoomPath,
  sellerSignInPath,
} from '@odb/seller-rooms/members/entry-rules.ts';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { ContractList } from '../../../../../counsel/[dealId]/contracts/contract-list';
import { versionReviews } from '../../../../../counsel/[dealId]/contracts/version-reviews';
import { nestLoiExtensions } from '../../../../../home/_lib/loi-extensions';

export default async function SellerRoomContractsPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;

  if (!z.uuid().safeParse(roomId).success) {
    notFound();
  }

  const client = getSupabaseServerClient();

  if (!(await isSignedIn(client))) {
    redirect(sellerSignInPath(`${sellerRoomPath(roomId)}/contracts`));
  }

  const { data: room } = await client
    .rpc('my_seller_rooms')
    .eq('id', roomId)
    .maybeSingle()
    .throwOnError();

  if (!room) {
    notFound();
  }

  const admin = getSupabaseServerAdminClient();
  const summaries = await sellerSideContracts(client, room.deal_id);
  const versionIds = summaries.flatMap((contract) =>
    contract.versions.map(({ id }) => id),
  );
  const [
    comments,
    reviews,
    { data: isCounsel },
    { data: deal },
    { data: sellerCounsel },
    { data: readOnlyReason },
  ] = await Promise.all([
    versionComments(client, versionIds),
    versionReviews(admin, versionIds, 'seller'),
    client
      .rpc('is_deal_counsel', { deal_id: room.deal_id, side: 'seller' })
      .throwOnError(),
    admin
      .from('deal')
      .select('account_id')
      .eq('id', room.deal_id)
      .single()
      .throwOnError(),
    admin
      .from('deal_counsel')
      .select('id')
      .eq('deal_id', room.deal_id)
      .eq('side', 'seller')
      .throwOnError(),
    client
      .rpc('seller_side_read_only_reason', { deal_id: room.deal_id })
      .throwOnError(),
  ]);
  const { data: locked } = await admin
    .rpc('is_account_locked', { target_account_id: deal.account_id })
    .throwOnError();
  const contracts = await nestLoiExtensions(
    admin,
    await Promise.all(
      summaries.map(async (contract) => ({
        ...contract,
        versions: (await contractVersionViews(admin, contract.versions)).map(
          (version) => ({
            ...version,
            comments: comments[version.id]!,
            review: reviews[version.id]!,
          }),
        ),
      })),
    ),
    'seller',
  );

  return (
    <main className={'flex flex-col gap-6'}>
      <Link className={'text-sm underline'} href={sellerRoomPath(roomId)}>
        Back to the room
      </Link>
      <h1 className={'text-2xl font-semibold'}>Contracts</h1>
      {readOnlyReason ? (
        <p className={'text-muted-foreground'}>{readOnlyReason}</p>
      ) : null}
      <ContractList
        dealId={room.deal_id}
        filesPath={`${sellerRoomPath(roomId)}/contracts/files`}
        redlineUpload={false}
        contracts={contracts}
        viewer={
          readOnlyReason || (isCounsel && locked) ? null : { side: 'seller' }
        }
        decide={
          readOnlyReason || sellerCounsel.length > 0
            ? null
            : sellerConfirmContractReview
        }
      />
    </main>
  );
}
