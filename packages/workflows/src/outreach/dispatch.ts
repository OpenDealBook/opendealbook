import { sendAs, type MailboxConnection } from '@odb/mailbox';
import {
  DEFAULT_OUTREACH_SEQUENCES,
  renderTemplate,
  type MergeContext,
} from '@odb/outreach';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

// PINNED CONTRACT: reconcile against generated types in Wave 2. The outreach
// tables do not yet exist in the generated Database types, so their reads and
// writes go through this untyped handle and the row shapes are declared here.
type PinnedClient = { from(table: string): any };

interface OutreachSettingRow {
  daily_cap: number;
  max_touches: number;
}

interface MailboxConnectionRow {
  provider: MailboxConnection['provider'];
  nango_connection_id: string;
  provider_config_key: string;
  email_address: string;
  status: string;
}

interface OutreachEnrollmentRow {
  id: string;
  sequence_id: string;
  firm_id: string | null;
  contact_id: string | null;
  target_email: string;
  current_step: number;
  sent_count: number;
}

interface OutreachMessageRow {
  to_email: string;
  status: string;
  sent_at: string | null;
}

interface DealBoxCriteria {
  industries?: string[];
  naics?: string[];
  min_revenue?: number;
}

interface FirmMergeRow {
  name: string;
  industry: string | null;
  city: string | null;
  state: string | null;
  website: string | null;
}

interface ContactMergeRow {
  name: string;
  email: string | null;
}

function startOfUtcDayIso(): string {
  const day = new Date();
  day.setUTCHours(0, 0, 0, 0);
  return day.toISOString();
}

export async function fetchDueOutreachAccounts(): Promise<string[]> {
  const pinned = getSupabaseServerAdminClient() as unknown as PinnedClient;

  const { data, error } = await pinned
    .from('outreach_enrollment')
    .select('account_id')
    .eq('status', 'queued')
    .lte('next_send_at', new Date().toISOString());

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as { account_id: string }[];
  return [...new Set(rows.map((row) => row.account_id))];
}

export interface DispatchAccountOutreachInput {
  accountId: string;
}

export interface DispatchAccountOutreachResult {
  sent: number;
}

export async function dispatchAccountOutreach(
  input: DispatchAccountOutreachInput,
): Promise<DispatchAccountOutreachResult> {
  const client = getSupabaseServerAdminClient();
  const pinned = client as unknown as PinnedClient;
  const now = new Date().toISOString();

  const setting = await loadSetting(pinned, input.accountId);

  const accountEnrollmentIds = await loadAccountEnrollmentIds(pinned, input.accountId);
  const messages = await loadAccountMessages(pinned, accountEnrollmentIds);

  const dayStart = startOfUtcDayIso();
  const sentToday = messages.filter(
    (message) =>
      message.status === 'sent' &&
      message.sent_at !== null &&
      message.sent_at >= dayStart,
  ).length;

  const remaining = setting.daily_cap - sentToday;
  if (remaining <= 0) {
    return { sent: 0 };
  }

  const connection = await loadActiveConnection(pinned, input.accountId);
  if (connection === null) {
    return { sent: 0 };
  }

  const suppressed = await loadSuppressedEmails(pinned, input.accountId);

  const touches = new Map<string, number>();
  for (const message of messages) {
    touches.set(message.to_email, (touches.get(message.to_email) ?? 0) + 1);
  }

  const due = await loadDueEnrollments(pinned, input.accountId, now);
  const eligible = due
    .filter((enrollment) => !suppressed.has(enrollment.target_email))
    .filter(
      (enrollment) =>
        (touches.get(enrollment.target_email) ?? 0) < setting.max_touches,
    )
    .slice(0, remaining);

  const senderName = await loadAccountName(client, input.accountId);
  const criteria = await loadDealBoxCriteria(client, input.accountId);

  let sent = 0;
  for (const enrollment of eligible) {
    const delivered = await deliverOutreach({
      client,
      pinned,
      accountId: input.accountId,
      connection,
      enrollment,
      criteria,
      sender: {
        name: senderName,
        company: senderName,
        email: connection.emailAddress,
      },
    });

    if (delivered) {
      sent += 1;
    }
  }

  return { sent };
}

async function deliverOutreach(args: {
  client: ReturnType<typeof getSupabaseServerAdminClient>;
  pinned: PinnedClient;
  accountId: string;
  connection: MailboxConnection;
  enrollment: OutreachEnrollmentRow;
  criteria: DealBoxCriteria;
  sender: { name: string; company: string; email: string };
}): Promise<boolean> {
  const { client, pinned, accountId, connection, enrollment, criteria, sender } = args;

  const sequence = DEFAULT_OUTREACH_SEQUENCES.find(
    (candidate) => candidate.key === enrollment.sequence_id,
  )!;
  const step = sequence.steps.find(
    (candidate) => candidate.ordinal === enrollment.current_step,
  )!;

  const recipient = await loadContact(client, enrollment.contact_id);
  const firm = await loadFirm(client, enrollment.firm_id);

  const context = buildMergeContext({
    targetEmail: enrollment.target_email,
    recipient,
    firm,
    criteria,
    sender,
  });

  const subject = renderTemplate(step.subject, context);
  const body = renderTemplate(step.body, context);

  try {
    const { providerMessageId } = await sendAs(connection, {
      to: enrollment.target_email,
      subject,
      text: body,
      html: body.replace(/\n/g, '<br>'),
      replyTo: connection.emailAddress,
    });

    await pinned.from('outreach_message').insert({
      enrollment_id: enrollment.id,
      step_id: enrollment.current_step,
      to_email: enrollment.target_email,
      subject,
      body,
      status: 'sent',
      provider_message_id: providerMessageId,
      sent_at: new Date().toISOString(),
    });

    await pinned
      .from('outreach_enrollment')
      .update({ status: 'sent', sent_count: enrollment.sent_count + 1 })
      .eq('id', enrollment.id);

    if (enrollment.firm_id !== null) {
      await client
        .from('firm')
        .update({ status: 'contacted' })
        .eq('id', enrollment.firm_id)
        .eq('account_id', accountId);
    }

    return true;
  } catch (error) {
    await pinned.from('outreach_message').insert({
      enrollment_id: enrollment.id,
      step_id: enrollment.current_step,
      to_email: enrollment.target_email,
      subject,
      body,
      status: 'failed',
      sent_at: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    });

    await pinned
      .from('outreach_enrollment')
      .update({ status: 'failed' })
      .eq('id', enrollment.id);

    return false;
  }
}

function buildMergeContext(args: {
  targetEmail: string;
  recipient: ContactMergeRow | null;
  firm: FirmMergeRow | null;
  criteria: DealBoxCriteria;
  sender: { name: string; company: string; email: string };
}): MergeContext {
  const industries =
    args.criteria.industries?.join(', ') ?? args.criteria.naics?.join(', ');
  const revenueRange =
    args.criteria.min_revenue !== undefined
      ? `$${args.criteria.min_revenue.toLocaleString('en-US')}`
      : undefined;

  return {
    recipient: {
      name: args.recipient?.name,
      email: args.recipient?.email ?? args.targetEmail,
    },
    firm: args.firm
      ? {
          name: args.firm.name,
          industry: args.firm.industry ?? undefined,
          city: args.firm.city ?? undefined,
          state: args.firm.state ?? undefined,
          website: args.firm.website ?? undefined,
        }
      : undefined,
    dealBox: { revenueRange, industries },
    sender: args.sender,
  };
}

async function loadSetting(
  pinned: PinnedClient,
  accountId: string,
): Promise<OutreachSettingRow> {
  const { data, error } = await pinned
    .from('outreach_setting')
    .select('daily_cap, max_touches')
    .eq('account_id', accountId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as OutreachSettingRow;
}

async function loadAccountEnrollmentIds(
  pinned: PinnedClient,
  accountId: string,
): Promise<string[]> {
  const { data, error } = await pinned
    .from('outreach_enrollment')
    .select('id')
    .eq('account_id', accountId);

  if (error) {
    throw error;
  }

  return ((data ?? []) as { id: string }[]).map((row) => row.id);
}

async function loadAccountMessages(
  pinned: PinnedClient,
  enrollmentIds: string[],
): Promise<OutreachMessageRow[]> {
  const { data, error } = await pinned
    .from('outreach_message')
    .select('to_email, status, sent_at')
    .in('enrollment_id', enrollmentIds);

  if (error) {
    throw error;
  }

  return (data ?? []) as OutreachMessageRow[];
}

async function loadActiveConnection(
  pinned: PinnedClient,
  accountId: string,
): Promise<MailboxConnection | null> {
  const { data, error } = await pinned
    .from('mailbox_connection')
    .select('provider, nango_connection_id, provider_config_key, email_address, status')
    .eq('account_id', accountId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = data as MailboxConnectionRow | null;
  if (row === null || row.status !== 'active') {
    return null;
  }

  return {
    provider: row.provider,
    nangoConnectionId: row.nango_connection_id,
    providerConfigKey: row.provider_config_key,
    emailAddress: row.email_address,
  };
}

async function loadSuppressedEmails(
  pinned: PinnedClient,
  accountId: string,
): Promise<Set<string>> {
  const { data, error } = await pinned
    .from('outreach_suppression')
    .select('email')
    .eq('account_id', accountId);

  if (error) {
    throw error;
  }

  return new Set(((data ?? []) as { email: string }[]).map((row) => row.email));
}

async function loadDueEnrollments(
  pinned: PinnedClient,
  accountId: string,
  now: string,
): Promise<OutreachEnrollmentRow[]> {
  const { data, error } = await pinned
    .from('outreach_enrollment')
    .select('id, sequence_id, firm_id, contact_id, target_email, current_step, sent_count')
    .eq('account_id', accountId)
    .eq('status', 'queued')
    .lte('next_send_at', now);

  if (error) {
    throw error;
  }

  return (data ?? []) as OutreachEnrollmentRow[];
}

async function loadAccountName(
  client: ReturnType<typeof getSupabaseServerAdminClient>,
  accountId: string,
): Promise<string> {
  const { data, error } = await client
    .from('accounts')
    .select('name')
    .eq('id', accountId)
    .single();

  if (error) {
    throw error;
  }

  return data.name;
}

async function loadDealBoxCriteria(
  client: ReturnType<typeof getSupabaseServerAdminClient>,
  accountId: string,
): Promise<DealBoxCriteria> {
  const { data, error } = await client
    .from('deal_box')
    .select('criteria_json')
    .eq('account_id', accountId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data?.criteria_json ?? {}) as DealBoxCriteria;
}

async function loadContact(
  client: ReturnType<typeof getSupabaseServerAdminClient>,
  contactId: string | null,
): Promise<ContactMergeRow | null> {
  if (contactId === null) {
    return null;
  }

  const { data, error } = await client
    .from('contact')
    .select('name, email')
    .eq('id', contactId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function loadFirm(
  client: ReturnType<typeof getSupabaseServerAdminClient>,
  firmId: string | null,
): Promise<FirmMergeRow | null> {
  if (firmId === null) {
    return null;
  }

  const { data, error } = await client
    .from('firm')
    .select('name, industry, city, state, website')
    .eq('id', firmId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}
