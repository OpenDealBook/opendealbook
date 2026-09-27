import type { Enums, Json } from '@tuckin/supabase';
import { getSupabaseServerAdminClient } from '@tuckin/supabase/admin';

export interface WriteAuditEventInput {
  accountId: string;
  dealId: string;
  actorUserId: string;
  eventType: string;
  payload: Json;
}

export async function writeAuditEvent(
  input: WriteAuditEventInput,
): Promise<void> {
  const client = getSupabaseServerAdminClient();

  const { error } = await client.from('audit_event').insert({
    account_id: input.accountId,
    deal_id: input.dealId,
    actor_user_id: input.actorUserId,
    event_type: input.eventType,
    payload: input.payload,
  });

  if (error) {
    throw error;
  }
}

export interface CreateNotificationInput {
  accountId: string;
  recipientUserId: string;
  type: Enums<'notification_type'>;
  body: string;
  link?: string;
}

export async function createNotification(
  input: CreateNotificationInput,
): Promise<void> {
  const client = getSupabaseServerAdminClient();

  const { error } = await client.from('notifications').insert({
    account_id: input.accountId,
    recipient_user_id: input.recipientUserId,
    type: input.type,
    body: input.body,
    link: input.link ?? null,
  });

  if (error) {
    throw error;
  }
}
