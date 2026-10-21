'use server';

import { z } from 'zod';

import { refusableAction } from '@odb/lender-rooms/actions/refusable-action.ts';
import { Refusal } from '@odb/lender-rooms/actions/refusal.ts';
import { TEAM_READ_ONLY } from '@odb/next';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { inviteCounsel } from './invite-counsel';

const NOT_ALLOWED = 'You cannot invite counsel to this deal.';

export const inviteBuyerCounsel = refusableAction(
  async (input, user) => {
    const from = process.env.SELLER_DELIVERY_FROM_EMAIL;

    if (!from) {
      throw new Refusal('Counsel email is not set up');
    }

    const client = getSupabaseServerClient();

    const { data: deal } = await client
      .from('deal')
      .select(
        'account_id, archived_at, resolution, code_name, firm!inner(name), accounts!deal_account_id_fkey(name)',
      )
      .eq('id', input.dealId)
      .maybeSingle()
      .throwOnError();

    if (!deal) {
      throw new Refusal(NOT_ALLOWED);
    }

    const { data: manages } = await client
      .rpc('manages_deal_in_account', {
        deal_id: input.dealId,
        account_id: deal.account_id,
      })
      .throwOnError();

    if (!manages) {
      throw new Refusal(NOT_ALLOWED);
    }

    const { data: locked } = await client
      .rpc('is_account_locked', { target_account_id: deal.account_id })
      .throwOnError();

    if (locked) {
      throw new Refusal(TEAM_READ_ONLY);
    }

    if (deal.archived_at || deal.resolution) {
      throw new Refusal('This deal is closed, so counsel cannot be invited.');
    }

    // Service role: authenticated has no insert grant on deal_counsel. The
    // caller was proven above to manage this deal.
    const admin = getSupabaseServerAdminClient();
    const { data: inviter } = await client
      .from('accounts')
      .select('name, email')
      .eq('primary_owner_user_id', user.id)
      .eq('is_personal_account', true)
      .single()
      .throwOnError();
    const outsideName = deal.code_name ?? deal.firm.name;

    await inviteCounsel(admin, {
      accountId: deal.account_id,
      dealId: input.dealId,
      side: 'buyer',
      email: input.email,
      name: input.name,
      invitedBy: user.id,
      copy: {
        inviter,
        teamName: deal.accounts.name,
        outsideName,
        dealName: outsideName,
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
