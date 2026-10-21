'use server';

import { z } from 'zod';

import { refusableAction } from '@odb/lender-rooms/actions/refusable-action.ts';
import { Refusal } from '@odb/lender-rooms/actions/refusal.ts';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { inviteCounsel } from './invite-counsel';

export async function listSellerCounsel(dealId: string) {
  const { data } = await getSupabaseServerClient()
    .from('deal_counsel')
    .select('user_id, name, email, created_at')
    .eq('deal_id', dealId)
    .order('created_at')
    .throwOnError();

  // Service role: sign-in times live in auth, which the seller cannot read.
  // Only counsel the seller could already see above are looked up.
  const admin = getSupabaseServerAdminClient();

  return Promise.all(
    data.map(async (counsel) => ({
      name: counsel.name,
      email: counsel.email,
      invitedAt: counsel.created_at,
      joined: Boolean(
        (await admin.auth.admin.getUserById(counsel.user_id)).data.user!
          .last_sign_in_at,
      ),
    })),
  );
}

export const inviteSellerCounsel = refusableAction(
  async (input, user) => {
    const from = process.env.SELLER_DELIVERY_FROM_EMAIL;

    if (!from) {
      throw new Refusal('Counsel email is not set up');
    }

    // Read straight from seller_room_member: a closed room still counts, and
    // seller's counsel, who have no member row, cannot invite.
    const { data: isSeller } = await getSupabaseServerClient()
      .rpc('is_deal_seller_room_member', { deal_id: input.dealId })
      .throwOnError();

    if (!isSeller) {
      throw new Refusal('You cannot invite counsel to this deal.');
    }

    const { data: readOnlyReason } = await getSupabaseServerClient()
      .rpc('seller_side_read_only_reason', { deal_id: input.dealId })
      .throwOnError();

    if (readOnlyReason) {
      throw new Refusal(readOnlyReason);
    }

    // Service role: neither the seller nor counsel can read the deal or write
    // deal_counsel. The caller was proven above to be the deal's seller.
    const admin = getSupabaseServerAdminClient();

    const { data: deal } = await admin
      .from('deal')
      .select(
        'account_id, code_name, firm!inner(name), accounts!deal_account_id_fkey(name)',
      )
      .eq('id', input.dealId)
      .single()
      .throwOnError();

    const { data: seller } = await admin
      .from('seller_room_member')
      .select('name, email, seller_room!inner(deal_id)')
      .eq('user_id', user.id)
      .eq('seller_room.deal_id', input.dealId)
      .single()
      .throwOnError();

    await inviteCounsel(admin, {
      accountId: deal.account_id,
      dealId: input.dealId,
      side: 'seller',
      email: input.email,
      name: input.name,
      invitedBy: user.id,
      copy: {
        inviter: { name: seller.name, email: seller.email },
        teamName: deal.accounts.name,
        outsideName: deal.code_name ?? deal.firm.name,
        dealName: deal.firm.name,
      },
      from,
    });
  },
  {
    auth: true,
    schema: z.object({
      dealId: z.uuid(),
      email: z.email().toLowerCase(),
      name: z.string().trim().min(1).max(200).optional(),
    }),
  },
);
