'use server';

import type { SupabaseClient } from '@supabase/supabase-js';

import { z } from 'zod';

import { getLogger } from '@odb/shared/logger';
import type { Database } from '@odb/supabase';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { refusableAction } from '../../actions/refusable-action';
import { Refusal } from '../../actions/refusal';
import { refuseWhileTeamLocked } from '../../actions/team-lock';
import { lookupLenderBrand } from '../../brand/actions';
import { refuseAnotherSide } from '../../members/another-side';
import { findOrCreateUserId } from '../../members/find-or-create-user-id';
import { giveNameIfNone } from '../../members/give-name-if-none';
import {
  claimSignInLinkWindow,
  sendLenderInvite,
} from '../../members/sign-in-link';
import { createLenderRoom } from '../../rooms/actions';

const DEAL_TEAM_ONLY = 'Only the deal team can do that';

interface Target {
  id: string;
  name: string;
  website: string;
  domain: string;
  contactName: string;
  email: string;
}

async function readManagedDeal(dealId: string) {
  const client = getSupabaseServerClient();

  const { data: deal } = await client
    .from('deal')
    .select('account_id')
    .eq('id', dealId)
    .maybeSingle()
    .throwOnError();

  if (!deal) {
    throw new Refusal(DEAL_TEAM_ONLY);
  }

  const { data: manages } = await client
    .rpc('manages_deal_in_account', {
      deal_id: dealId,
      account_id: deal.account_id,
    })
    .throwOnError();

  if (!manages) {
    throw new Refusal(DEAL_TEAM_ONLY);
  }

  return deal;
}

async function readTargets(
  admin: SupabaseClient<Database>,
  dealId: string,
  accountId: string,
  lenderIds: string[],
): Promise<Target[]> {
  const { data: lenders } = await getSupabaseServerClient()
    .from('lender')
    .select(
      'id, name, website, domain, account_id, lender_contact(name, email, is_primary)',
    )
    .in('id', lenderIds)
    .throwOnError();

  const targets = lenderIds.map((lenderId) => {
    const lender = lenders.find((found) => found.id === lenderId);

    if (lender?.account_id !== accountId) {
      throw new Refusal('A selected lender is not on this team');
    }

    const primary = lender.lender_contact.find((contact) => contact.is_primary);

    if (!primary?.email) {
      throw new Refusal(
        `${lender.name} has no primary contact. Set one before creating a room.`,
      );
    }

    return {
      ...lender,
      contactName: primary.name,
      email: primary.email.toLowerCase(),
    };
  });

  for (const target of targets) {
    await refuseAnotherSide(admin, {
      dealId,
      email: target.email,
      side: 'lender',
    });
  }

  return targets;
}

async function addPrimaryToRoom(
  roomId: string,
  target: Target,
  sentBy: string,
) {
  const admin = getSupabaseServerAdminClient();
  const userId = await findOrCreateUserId(admin, target.email);

  await getSupabaseServerClient()
    .from('lender_room_member')
    .upsert(
      { room_id: roomId, user_id: userId, email: target.email },
      { onConflict: 'room_id,user_id', ignoreDuplicates: true },
    )
    .throwOnError();

  await giveNameIfNone(admin, userId, target.contactName);

  try {
    await sendLenderInvite(admin, {
      email: target.email,
      roomId,
      sentBy,
    });
  } catch (error) {
    getLogger().error({ err: error }, 'Lender room spin-up email was not sent');

    return true;
  }

  await claimSignInLinkWindow(admin, target.email);

  return false;
}

export const spinUpLenderRooms = refusableAction(
  async (input, user) => {
    const client = getSupabaseServerClient();
    const deal = await readManagedDeal(input.dealId);

    await refuseWhileTeamLocked(deal.account_id);

    const targets = await readTargets(
      getSupabaseServerAdminClient(),
      input.dealId,
      deal.account_id,
      [...new Set(input.lenderIds)],
    );

    const { data: existingRooms } = await client
      .from('lender_room')
      .select('id, brand_domain, lender_room_member(id)')
      .eq('deal_id', input.dealId)
      .in(
        'brand_domain',
        targets.map((target) => target.domain),
      )
      .throwOnError();

    const results = [];

    for (const target of targets) {
      const existing = existingRooms.find(
        (room) => room.brand_domain === target.domain,
      );

      if (existing) {
        results.push({
          lenderId: target.id,
          roomId: existing.id,
          status: 'already_has_room' as const,
          emailFailed:
            existing.lender_room_member.length === 0 &&
            (await addPrimaryToRoom(existing.id, target, user.id)),
        });
        continue;
      }

      await lookupLenderBrand({ dealId: input.dealId, url: target.website });

      const created = await createLenderRoom({
        dealId: input.dealId,
        name: target.name,
        brandDomain: target.domain,
        lenderId: target.id,
      });

      if (!created.ok) {
        throw new Refusal(created.refusal);
      }

      results.push({
        lenderId: target.id,
        roomId: created.value,
        status: 'created' as const,
        emailFailed: await addPrimaryToRoom(created.value, target, user.id),
      });
    }

    return results;
  },
  {
    auth: true,
    schema: z.object({
      dealId: z.uuid(),
      lenderIds: z.array(z.uuid()).min(1),
    }),
  },
);
