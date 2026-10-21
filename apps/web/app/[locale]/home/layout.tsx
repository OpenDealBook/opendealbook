import type { ReactNode } from 'react';

import { redirect } from 'next/navigation';

import { counselHomeDestination } from '@odb/deal-counsel/entry-rules.ts';
import { notOnboardedDestination } from '@odb/lender-rooms/members/entry-rules.ts';
import { sellerHomeDestination } from '@odb/seller-rooms/members/entry-rules.ts';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { TimezoneDetection } from '../_components/timezone-detection';
import { openCounselDealIds } from './_lib/counsel-deals';

export const dynamic = 'force-dynamic';

export default async function HomeLayout({
  children,
}: {
  children: ReactNode;
}) {
  const client = getSupabaseServerClient();

  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    redirect('/auth/sign-in');
  }

  const { data: account, error } = await client
    .from('accounts')
    .select('onboarded')
    .eq('primary_owner_user_id', user.id)
    .eq('is_personal_account', true)
    .single();

  if (error) {
    throw error;
  }

  if (!account.onboarded) {
    const [{ data: rooms }, { data: sellerRooms }, counselDealIds] =
      await Promise.all([
        client.rpc('my_lender_rooms').throwOnError(),
        client.rpc('my_seller_rooms').throwOnError(),
        openCounselDealIds(client, user.id),
      ]);

    redirect(
      sellerHomeDestination(sellerRooms, rooms) ??
        counselHomeDestination(counselDealIds) ??
        notOnboardedDestination(rooms),
    );
  }

  return (
    <>
      <TimezoneDetection />
      {children}
    </>
  );
}
