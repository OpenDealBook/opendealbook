import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';

export interface SellerRoomPerson {
  id: string;
  name: string;
  email: string | null;
  created_at: string;
}

export async function loadSellerRoomPeople(
  client: SupabaseClient<Database>,
  dealId: string,
): Promise<SellerRoomPerson[]> {
  const { data: manages } = await client
    .rpc('has_deal_permission', { deal_id: dealId, permission: 'deals.manage' })
    .throwOnError();

  if (!manages) {
    const { data: names } = await client
      .rpc('seller_room_names', { deal_id: dealId })
      .throwOnError();

    return names.map((person) => ({ ...person, email: null })).toSorted(byName);
  }

  const { data: people } = await client
    .from('seller_room_member')
    .select('id, name, email, created_at, seller_room!inner(deal_id)')
    .eq('seller_room.deal_id', dealId)
    .throwOnError();

  return people
    .map(({ seller_room: _room, ...person }) => person)
    .toSorted(byName);
}

function byName(a: SellerRoomPerson, b: SellerRoomPerson): number {
  return a.name.localeCompare(b.name);
}

export async function managersOnlyRefusal(
  client: SupabaseClient<Database>,
  admin: SupabaseClient<Database>,
  dealId: string,
  what: string,
): Promise<string | null> {
  const { data: manages } = await client
    .rpc('has_deal_permission', { deal_id: dealId, permission: 'deals.manage' })
    .throwOnError();

  return manages
    ? null
    : `Only deal managers can ${what}. Ask ${await dealOwnerName(admin, dealId)}.`;
}

export async function countDealTeam(
  admin: SupabaseClient<Database>,
  roomId: string,
): Promise<number> {
  const { data: room } = await admin
    .from('seller_room')
    .select('account_id')
    .eq('id', roomId)
    .single()
    .throwOnError();

  const { count } = await admin
    .from('accounts_memberships')
    .select('*', { count: 'exact', head: true })
    .eq('account_id', room.account_id)
    .throwOnError();

  return count!;
}

export async function dealOwnerName(
  admin: SupabaseClient<Database>,
  dealId: string,
): Promise<string> {
  const { data: deal } = await admin
    .from('deal')
    .select('owner_user_id')
    .eq('id', dealId)
    .single()
    .throwOnError();

  const { data: owner } = await admin
    .from('accounts')
    .select('name')
    .eq('primary_owner_user_id', deal.owner_user_id!)
    .eq('is_personal_account', true)
    .single()
    .throwOnError();

  return owner.name;
}
