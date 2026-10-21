import { dealOwnerName } from '@odb/seller-rooms/members/people.ts';
import {
  getSupabaseServerAdminClient,
  getSupabaseServerClient,
} from '@odb/supabase/server';

import { PhonePrompt } from '../../_components/phone-prompt';

export async function SellerPhonePrompt() {
  const client = getSupabaseServerClient();

  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return null;
  }

  const [{ data: rooms }, { data: account }] = await Promise.all([
    client.rpc('my_seller_rooms').throwOnError(),
    client
      .from('accounts')
      .select('phone_asked_at')
      .eq('id', user.id)
      .single()
      .throwOnError(),
  ]);

  if (rooms.length === 0 || account.phone_asked_at !== null) {
    return null;
  }

  const texter =
    rooms.length === 1
      ? await dealOwnerName(getSupabaseServerAdminClient(), rooms[0]!.deal_id)
      : "the buyer's team";

  return (
    <section className={'flex flex-col gap-2'}>
      <p className={'text-sm'}>
        {`Add your phone number so ${texter} can text you when something needs you. Only the buyer's team and counsel on the deal see it.`}
      </p>
      <PhonePrompt />
    </section>
  );
}
