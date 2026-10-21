import type { SupabaseClient } from '@supabase/supabase-js';

import { outsideDealName } from '@odb/deals/shared';
import { listLendersToNudge } from '@odb/lender-rooms/crm/nudges/nudges.ts';
import type { Database } from '@odb/supabase';

export async function loadNudgeTargets(
  client: SupabaseClient<Database>,
  accountId: string,
) {
  const lenders = await listLendersToNudge(client, accountId);
  const deals = lenders.flatMap((lender) => lender.deals);

  const [{ data: outreach }, { data: dealNames }] = await Promise.all([
    client
      .from('lender_room_outreach')
      .select('room_id, provider_thread_id, subject')
      .in(
        'room_id',
        deals.map((deal) => deal.roomId),
      )
      .eq('kind', 'outreach')
      .eq('status', 'sent')
      .order('sent_at', { ascending: false })
      .throwOnError(),
    client
      .from('deal')
      .select('id, code_name, firm:firm_id!inner(name)')
      .in(
        'id',
        deals.map((deal) => deal.dealId),
      )
      .throwOnError(),
  ]);
  const outsideNameById = new Map(
    dealNames.map((deal) => [deal.id, outsideDealName(deal)]),
  );

  const targets = [];
  const cannotDraft = [];

  for (const lender of lenders) {
    const contact = lender.primaryContact;

    if (contact?.email == null) {
      cannotDraft.push({
        lenderId: lender.lenderId,
        lenderName: lender.lenderName,
        reason: 'Save this lender with a primary contact to draft',
      });
      continue;
    }

    const deals = lender.deals.map((deal) => ({
      dealName: outsideNameById.get(deal.dealId)!,
      daysSilent: deal.daysSilent,
    }));

    const roomIds = lender.deals.map((deal) => deal.roomId);
    const latest = outreach.find((row) => roomIds.includes(row.room_id))!;

    targets.push({
      lenderId: lender.lenderId,
      lenderName: lender.lenderName,
      contact: { name: contact.name, email: contact.email },
      roomIds,
      deals,
      thread: { id: latest.provider_thread_id!, subject: latest.subject },
    });
  }

  return { targets, cannotDraft };
}
