import type { NotifiableDealEvent } from '@odb/notifications/relay';
import { createNovuClient, triggerNotification } from '@odb/notifications/server';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

export interface FetchDealNotificationEventsInput {
  afterGlobalSeq: number;
  limit: number;
}

export async function fetchDealNotificationEvents(
  input: FetchDealNotificationEventsInput,
): Promise<NotifiableDealEvent[]> {
  const client = getSupabaseServerAdminClient();

  const { data, error } = await client
    .from('deal_event')
    .select('global_seq, deal_id, account_id, actor_ref, event_type, payload')
    .gt('global_seq', input.afterGlobalSeq)
    .order('global_seq', { ascending: true })
    .limit(input.limit);

  if (error) {
    throw error;
  }

  return data.map((row) => ({
    globalSeq: row.global_seq,
    dealId: row.deal_id,
    accountId: row.account_id,
    actorRef: row.actor_ref,
    eventType: row.event_type,
    stage: (row.payload as { stage?: string } | null)?.stage ?? null,
  }));
}

export interface NotifyDealEventInput {
  workflowId: string;
  dealId: string;
  accountId: string;
  actorRef: string | null;
  eventType: string;
}

export async function notifyDealEvent(input: NotifyDealEventInput): Promise<void> {
  if (!process.env.NOVU_API_KEY || !process.env.NOVU_API_URL) {
    console.info(
      `Novu not configured; skipping deal-event notification ${input.workflowId} for deal ${input.dealId}`,
    );
    return;
  }

  const client = getSupabaseServerAdminClient();

  const { data: deal } = await client
    .from('deal')
    .select('description')
    .eq('id', input.dealId)
    .single();

  const { data: members } = await client
    .from('accounts_memberships')
    .select('user_id')
    .eq('account_id', input.accountId);

  const novu = createNovuClient();
  const payload = {
    dealId: input.dealId,
    dealName: deal?.description ?? null,
    actor: input.actorRef,
    event: input.eventType,
  };

  for (const member of members ?? []) {
    try {
      await triggerNotification(
        { novu, client },
        {
          eventType: input.workflowId,
          recipientUserId: member.user_id,
          payload,
        },
      );
    } catch (error) {
      console.warn(
        `Novu deal-event notification ${input.workflowId} failed for ${member.user_id}`,
        error,
      );
    }
  }
}
