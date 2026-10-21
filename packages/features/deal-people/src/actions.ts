'use server';

import { refusableAction } from '@odb/lender-rooms/actions/refusable-action.ts';
import { Refusal } from '@odb/lender-rooms/actions/refusal.ts';
import { refuseWhileTeamLocked } from '@odb/lender-rooms/actions/team-lock.ts';
import { getSupabaseServerClient } from '@odb/supabase/server';

import {
  addContactSchema,
  attachContactSchema,
  editContactSchema,
  removeContactSchema,
  starSchema,
  unstarSchema,
} from './schema';

const NOT_ALLOWED = 'You cannot edit the people on this deal.';

async function managedDealAccount(dealId: string) {
  const client = getSupabaseServerClient();
  const { data: deal } = await client
    .from('deal')
    .select('account_id')
    .eq('id', dealId)
    .maybeSingle()
    .throwOnError();

  if (!deal) {
    throw new Refusal(NOT_ALLOWED);
  }

  const { data: manages } = await client
    .rpc('manages_deal_in_account', {
      deal_id: dealId,
      account_id: deal.account_id,
    })
    .throwOnError();

  if (!manages) {
    throw new Refusal(NOT_ALLOWED);
  }

  await refuseWhileTeamLocked(deal.account_id);

  return deal.account_id;
}

async function refuseUnlessOnDeal(dealId: string, contactId: string) {
  const { data: attached } = await getSupabaseServerClient()
    .from('deal_contact')
    .select('id')
    .eq('deal_id', dealId)
    .eq('contact_id', contactId)
    .maybeSingle()
    .throwOnError();

  if (!attached) {
    throw new Refusal(NOT_ALLOWED);
  }
}

export const addDealContact = refusableAction(
  async ({ dealId, side, role, ...contact }) => {
    const accountId = await managedDealAccount(dealId);
    const client = getSupabaseServerClient();
    const { data: created } = await client
      .from('contact')
      .insert({ ...contact, account_id: accountId })
      .select('id')
      .single()
      .throwOnError();

    await client
      .from('deal_contact')
      .insert({
        account_id: accountId,
        deal_id: dealId,
        contact_id: created.id,
        side,
        role,
      })
      .throwOnError();
  },
  { schema: addContactSchema },
);

export const attachDealContact = refusableAction(
  async ({ dealId, contactId, side, role }) => {
    const accountId = await managedDealAccount(dealId);
    const client = getSupabaseServerClient();
    const { data: ownContact } = await client
      .from('contact')
      .select('id')
      .eq('id', contactId)
      .eq('account_id', accountId)
      .maybeSingle()
      .throwOnError();

    if (!ownContact) {
      throw new Refusal(NOT_ALLOWED);
    }

    await client
      .from('deal_contact')
      .insert({
        account_id: accountId,
        deal_id: dealId,
        contact_id: contactId,
        side,
        role,
      })
      .throwOnError();
  },
  { schema: attachContactSchema },
);

export const editDealContact = refusableAction(
  async ({ dealId, contactId, side, role, ...contact }) => {
    await managedDealAccount(dealId);
    await refuseUnlessOnDeal(dealId, contactId);
    const client = getSupabaseServerClient();

    await client
      .from('contact')
      .update(contact)
      .eq('id', contactId)
      .throwOnError();
    await client
      .from('deal_contact')
      .update({ side, role })
      .eq('deal_id', dealId)
      .eq('contact_id', contactId)
      .throwOnError();
  },
  { schema: editContactSchema },
);

export const removeDealContact = refusableAction(
  async ({ dealId, contactId }) => {
    await managedDealAccount(dealId);
    await refuseUnlessOnDeal(dealId, contactId);
    await getSupabaseServerClient()
      .from('deal_contact')
      .delete()
      .eq('deal_id', dealId)
      .eq('contact_id', contactId)
      .throwOnError();
  },
  { schema: removeContactSchema },
);

export const starMainContact = refusableAction(
  async ({ dealId, side, lenderRoomId, who }) => {
    await managedDealAccount(dealId);

    if ('contactId' in who) {
      await refuseUnlessOnDeal(dealId, who.contactId);
    }

    await getSupabaseServerClient()
      .from('deal_main_contact')
      .upsert(
        {
          deal_id: dealId,
          side,
          lender_room_id: lenderRoomId,
          user_id: 'userId' in who ? who.userId : null,
          contact_id: 'contactId' in who ? who.contactId : null,
        },
        { onConflict: 'deal_id,side,lender_room_id' },
      )
      .throwOnError();
  },
  { schema: starSchema },
);

export const unstarMainContact = refusableAction(
  async ({ dealId, side, lenderRoomId }) => {
    await managedDealAccount(dealId);
    const slot = getSupabaseServerClient()
      .from('deal_main_contact')
      .delete()
      .eq('deal_id', dealId)
      .eq('side', side);

    await (
      lenderRoomId
        ? slot.eq('lender_room_id', lenderRoomId)
        : slot.is('lender_room_id', null)
    ).throwOnError();
  },
  { schema: unstarSchema },
);
