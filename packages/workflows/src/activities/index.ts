import { getMailer } from '@tuckin/mailers';
import type { Enums, Json } from '@tuckin/supabase';
import { getSupabaseServerAdminClient } from '@tuckin/supabase/admin';

import { buildBrokerCatchUpEmail, firstName } from '../brokerCatchUpEmail';
import type { BrokerCatchUpConfig } from '../workflows/brokerCatchUp';

export interface WriteAuditEventInput {
  accountId: string;
  dealId: string;
  actorUserId: string;
  eventType: string;
  payload: NonNullable<Json>;
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

export interface BrokerContact {
  id: string;
  name: string;
  email: string;
}

export async function loadBrokerContacts(input: {
  accountId: string;
}): Promise<BrokerContact[]> {
  const client = getSupabaseServerAdminClient();

  const { data, error } = await client
    .from('contact')
    .select('id, name, email')
    .eq('account_id', input.accountId)
    .eq('kind', 'broker')
    .not('email', 'is', null);

  if (error) {
    throw error;
  }

  return data.map((row) => ({ id: row.id, name: row.name, email: row.email! }));
}

export interface ExcludedBroker {
  brokerContactId: string;
  brokerName: string;
}

export async function computeExcludedBrokers(input: {
  accountId: string;
}): Promise<ExcludedBroker[]> {
  const client = getSupabaseServerAdminClient();

  const { data: stages, error: stagesError } = await client
    .from('pipeline_stage')
    .select('key, sort_order, is_terminal')
    .eq('account_id', input.accountId);

  if (stagesError) {
    throw stagesError;
  }

  const loi = stages.find((stage) => stage.key === 'loi');

  if (!loi) {
    return [];
  }

  const activeStageKeys = stages
    .filter((stage) => !stage.is_terminal && stage.sort_order >= loi.sort_order)
    .map((stage) => stage.key);

  const { data: deals, error: dealsError } = await client
    .from('deal')
    .select('broker_contact_id')
    .eq('account_id', input.accountId)
    .in('stage', activeStageKeys)
    .not('broker_contact_id', 'is', null);

  if (dealsError) {
    throw dealsError;
  }

  const brokerIds = [...new Set(deals.map((deal) => deal.broker_contact_id!))];

  if (brokerIds.length === 0) {
    return [];
  }

  const { data: brokers, error: brokersError } = await client
    .from('contact')
    .select('id, name')
    .in('id', brokerIds);

  if (brokersError) {
    throw brokersError;
  }

  return brokers.map((broker) => ({
    brokerContactId: broker.id,
    brokerName: broker.name,
  }));
}

export async function sendBrokerBatchEmail(input: {
  accountId: string;
  config: BrokerCatchUpConfig;
  recipients: BrokerContact[];
}): Promise<{ sent: number }> {
  const client = getSupabaseServerAdminClient();

  const { data: dealBox, error } = await client
    .from('deal_box')
    .select('broker_summary')
    .eq('account_id', input.accountId)
    .order('version', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    throw error;
  }

  const mailer = await getMailer();

  for (const recipient of input.recipients) {
    const content = buildBrokerCatchUpEmail({
      brokerFirstName: firstName(recipient.name),
      updates: input.config.updates,
      dealBoxSummary: dealBox.broker_summary ?? '',
      bookACallUrl: input.config.bookACallUrl,
    });

    await mailer.sendEmail({
      to: recipient.email,
      from: input.config.fromEmail,
      subject: input.config.subject,
      html: content.html,
      text: content.text,
    });
  }

  return { sent: input.recipients.length };
}

export async function createBrokerFollowUpTask(input: {
  accountId: string;
  recipientUserId: string;
  brokerName: string;
}): Promise<void> {
  const client = getSupabaseServerAdminClient();

  const { error } = await client.from('notifications').insert({
    account_id: input.accountId,
    recipient_user_id: input.recipientUserId,
    type: 'info',
    body: `Send a personal catch-up note to ${input.brokerName}; they have an active deal in LOI or later`,
  });

  if (error) {
    throw error;
  }
}

export interface RecordWorkbookRunInput {
  workbookId: string;
  accountId: string;
  startedAt: string;
  finishedAt: string;
  itemsTotal: number;
  itemsDone: number;
  status: string;
}

export async function recordWorkbookRun(
  input: RecordWorkbookRunInput,
): Promise<void> {
  const client = getSupabaseServerAdminClient();

  const { error } = await client.from('workbook_run').insert({
    workbook_id: input.workbookId,
    account_id: input.accountId,
    started_at: input.startedAt,
    finished_at: input.finishedAt,
    items_total: input.itemsTotal,
    items_done: input.itemsDone,
    status: input.status,
  });

  if (error) {
    throw error;
  }
}
