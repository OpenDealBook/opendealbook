import type { SupabaseClient } from '@supabase/supabase-js';

import { outsideDealName } from '@odb/deals/shared';
import {
  fetchCloseDeadline,
  loadDealTermsSought,
} from '@odb/deals/server';
import { Refusal } from '@odb/lender-rooms/actions/refusal.ts';
import { requireEnv } from '@odb/shared/env';
import type { Database } from '@odb/supabase';

import { draftEmail } from './draft-email';
import { loadOutreachTemplate } from './template';

type Client = SupabaseClient<Database>;

export async function loadDrafts(client: Client, dealId: string, userId: string) {
  const { data: mayWork } = await client
    .rpc('has_deal_permission', { deal_id: dealId, permission: 'deals.work' })
    .throwOnError();

  if (!mayWork) {
    throw new Refusal('Only the deal team can do that');
  }

  const { data: deal } = await client
    .from('deal')
    .select('account_id, close_date, code_name, firm:firm_id!inner(name)')
    .eq('id', dealId)
    .single()
    .throwOnError();

  const [
    template,
    { terms },
    deadline,
    { data: sender },
    { data: team },
    { data: rooms },
  ] = await Promise.all([
    loadOutreachTemplate(client, deal.account_id),
    loadDealTermsSought(client, dealId),
    fetchCloseDeadline(client, dealId),
    client
      .from('accounts')
      .select('name')
      .eq('primary_owner_user_id', userId)
      .eq('is_personal_account', true)
      .single()
      .throwOnError(),
    client
      .from('accounts')
      .select('name')
      .eq('id', deal.account_id)
      .single()
      .throwOnError(),
    client
      .from('lender_room')
      .select('id, name, lender_id')
      .eq('deal_id', dealId)
      .is('closed_at', null)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order('created_at')
      .throwOnError(),
  ]);

  const { data: lenders } = await client
    .from('lender')
    .select('id, name, lender_contact(name, email, is_primary)')
    .eq('account_id', deal.account_id)
    .in(
      'id',
      rooms.flatMap((room) => room.lender_id ?? []),
    )
    .throwOnError();

  const { data: sent } = await client
    .from('lender_room_outreach')
    .select('room_id, sent_at')
    .in(
      'room_id',
      rooms.map((room) => room.id),
    )
    .eq('status', 'sent')
    .eq('kind', 'outreach')
    .order('sent_at', { ascending: false })
    .throwOnError();

  const origin = requireEnv('NEXT_PUBLIC_SITE_URL');

  const drafts = [];
  const skipped = [];

  for (const room of rooms) {
    const lender = lenders.find((found) => found.id === room.lender_id);
    const contact = lender?.lender_contact.find((found) => found.is_primary);

    if (!lender || !contact?.email) {
      skipped.push({
        roomId: room.id,
        roomName: room.name,
        reason: 'Save this lender with a primary contact to draft',
      });
      continue;
    }

    const email = draftEmail(template, {
      dealName: outsideDealName(deal),
      contactName: contact.name,
      lenderName: lender.name,
      roomLink: `${origin}/lender/${room.id}`,
      ourName: sender.name,
      teamName: team.name,
      terms: {
        loanAmount: terms.loan_amount,
        loanType: terms.loan_type,
        termYears: terms.term_years,
        rateType: terms.rate_type,
        sellerNoteAmount: terms.seller_note_amount,
      },
      targetCloseDate: deal.close_date,
      mustCloseBy: deadline?.must_close_by ?? null,
    });

    drafts.push({
      roomId: room.id,
      lenderName: lender.name,
      to: contact.email,
      ...email,
      lastSentAt: sent.find((row) => row.room_id === room.id)?.sent_at ?? null,
    });
  }

  return { drafts, skipped };
}
