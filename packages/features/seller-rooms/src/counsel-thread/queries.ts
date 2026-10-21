import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

import { withDownloadName } from '@odb/lender-rooms/activity/download-name.ts';
import type { Database } from '@odb/supabase';

import type { SellerSide } from './audience';
import { SELLER_COUNSEL_THREAD_BUCKET } from './files';

type Client = SupabaseClient<Database>;

export async function loadSellerCounselThread(client: Client, dealId: string) {
  const { data } = await client
    .from('seller_counsel_message')
    .select(
      'id, author_user_id, author_side, author_name, body, created_at, files:seller_counsel_message_file(id, name)',
    )
    .eq('deal_id', dealId)
    .order('created_at')
    .throwOnError();

  return data;
}

export async function sellerCounselThreadFileUrl(
  client: Client,
  fileId: string,
): Promise<string | null> {
  const { data: file } = await client
    .from('seller_counsel_message_file')
    .select('name, storage_path')
    .eq('id', fileId)
    .maybeSingle()
    .throwOnError();

  if (!file) {
    return null;
  }

  const signed = await client.storage
    .from(SELLER_COUNSEL_THREAD_BUCKET)
    .createSignedUrl(file.storage_path, 60, { download: true });

  if (signed.error) {
    throw signed.error;
  }

  return withDownloadName(signed.data.signedUrl, file.name);
}

// Service role: neither side can read the other's records or the buyer team's
// name. Callers first prove the viewer is on the seller side of this deal.
export async function loadSellerSide(
  admin: Client,
  dealId: string,
): Promise<SellerSide> {
  const [{ data: deal }, { data: room }, { data: counsel }] = await Promise.all(
    [
      admin
        .from('deal')
        .select('accounts!deal_account_id_fkey(name)')
        .eq('id', dealId)
        .single()
        .throwOnError(),
      admin
        .from('seller_room')
        .select('seller_room_member(user_id, name)')
        .eq('deal_id', dealId)
        .single()
        .throwOnError(),
      admin
        .from('deal_counsel')
        .select('user_id, name, email')
        .eq('deal_id', dealId)
        .eq('side', 'seller')
        .order('created_at')
        .throwOnError(),
    ],
  );

  return {
    sellers: room.seller_room_member.map((member) => ({
      userId: member.user_id,
      name: member.name,
    })),
    counsel: counsel.map((each) => ({
      userId: each.user_id,
      name: each.name ?? each.email,
    })),
    buyerTeam: deal.accounts.name,
  };
}
