import {
  LENDER_ROOM_DOCUMENTS_WORKFLOW_ID,
  type NotifiableDealEvent,
} from '@odb/notifications/relay';
import { createNovuClient, triggerNotification } from '@odb/notifications/server';
import type { Database } from '@odb/supabase';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { z } from 'zod';

const addedDocumentSchema = z.object({
  version: z.preprocess((version) => version ?? 1, z.coerce.number()),
  uploaded_by: z.string().nullish(),
});

type LenderDocumentRecipient =
  Database['public']['Functions']['lender_document_recipients']['Returns'][number];

function keepFirstRoomPerPerson(
  recipients: LenderDocumentRecipient[],
): LenderDocumentRecipient[] {
  const firstByUserId = new Map<string, LenderDocumentRecipient>();
  for (const recipient of recipients) {
    const kept = firstByUserId.get(recipient.user_id);
    if (!kept || recipient.room_id < kept.room_id) {
      firstByUserId.set(recipient.user_id, recipient);
    }
  }
  return [...firstByUserId.values()];
}

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
  globalSeq: number;
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

  if (input.workflowId === LENDER_ROOM_DOCUMENTS_WORKFLOW_ID) {
    await notifyLenderPeopleOfDocument(input);
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

async function notifyLenderPeopleOfDocument(
  input: NotifyDealEventInput,
): Promise<void> {
  const client = getSupabaseServerAdminClient();

  const { data: event } = await client
    .from('deal_event')
    .select('aggregate_id, payload')
    .eq('global_seq', input.globalSeq)
    .maybeSingle()
    .throwOnError();

  if (!event) {
    console.error(
      `Lender document notification skipped; deal event ${input.globalSeq} was not found`,
    );
    return;
  }

  const document = addedDocumentSchema.safeParse(event.payload);

  if (!document.success) {
    console.error(
      `Lender document notification skipped; deal event ${input.globalSeq} has an unreadable payload`,
      document.error,
    );
    return;
  }

  const { data: recipients } = await client
    .rpc('lender_document_recipients', { document_id: event.aggregate_id })
    .throwOnError();

  const uploaderUserId = document.data.uploaded_by ?? input.actorRef;
  const novu = createNovuClient();

  for (const recipient of keepFirstRoomPerPerson(recipients)) {
    if (recipient.user_id === uploaderUserId) {
      continue;
    }

    await triggerNotification(
      {
        novu: {
          subscribers: novu.subscribers,
          trigger: (workflowId, data) =>
            novu.trigger(workflowId, data).catch((error: unknown) => {
              console.warn(
                `Novu lender document notification failed for ${recipient.user_id}`,
                error,
              );
            }),
        },
        client,
      },
      {
        eventType: input.workflowId,
        recipientUserId: recipient.user_id,
        email: recipient.email,
        payload: {
          roomId: recipient.room_id,
          dealId: input.dealId,
          documentId: event.aggregate_id,
          isNewVersion: document.data.version > 1,
        },
        transactionId: `${input.workflowId}:${input.globalSeq}:${recipient.user_id}`,
      },
    );
  }
}
