import { ApplicationFailure } from '@temporalio/common';

import { MailboxNoResponse, MailboxRequestFailed, sendAs, type MailboxConnection } from '@odb/mailbox';
import { dealBoxMergeFields, renderTemplate, type MergeContext } from '@odb/outreach';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import { LetterCapReached, LetterSetupMissing, sendLetter } from '../letters/sendLetter';
import { outreachSender } from '../outreachSender';
import { isTeamLocked } from '../teamLock';

type OutreachClient = ReturnType<typeof getSupabaseServerAdminClient>;

const UNIQUE_VIOLATION = '23505';

const DAY_MS = 86_400_000;

const DELIVERED_LETTER_STATUSES = ['created', 'mailed', 'in_transit', 'delivered', 'returned'] as const;

type OutreachMessageStatus = 'sending' | 'sent' | 'failed' | 'unknown';

interface OutreachSettingRow {
  daily_cap: number;
  max_touches: number;
  letter_return_address_line1: string | null;
  letter_return_city: string | null;
  letter_return_state: string | null;
  letter_return_postal_code: string | null;
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
  unsubscribe_token: string;
}

interface OutreachStepRow {
  sequence_id: string;
  ordinal: number;
  delay_days: number;
  channel: 'email' | 'letter';
  subject: string | null;
  body: string;
}

type SequenceSteps = Map<string, OutreachStepRow[]>;

interface OutreachMessageRow {
  enrollment_id: string;
  step_id: number;
  to_email: string;
  subject: string;
  status: OutreachMessageStatus;
  sent_at: string | null;
  provider_thread_id: string | null;
}

interface FirstEmail {
  subject: string;
  threadId: string;
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
  name: string | null;
  email: string | null;
}

function startOfUtcDayIso(): string {
  const day = new Date();
  day.setUTCHours(0, 0, 0, 0);
  return day.toISOString();
}

export async function fetchDueOutreachAccounts(): Promise<string[]> {
  const client = getSupabaseServerAdminClient();

  const { data, error } = await client
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
  const now = new Date().toISOString();

  if (await isTeamLocked({ accountId: input.accountId })) {
    return { sent: 0 };
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    console.error('[workflows] outreach dispatch refused: NEXT_PUBLIC_SITE_URL is not set');
    return { sent: 0 };
  }
  const unsubscribePath = (enrollment: OutreachEnrollmentRow) =>
    `unsubscribe?token=${enrollment.unsubscribe_token}`;

  const setting = await loadSetting(client, input.accountId);

  const messages = await loadAccountMessages(client, input.accountId);
  const letterTargets = await loadLetterTargets(client, input.accountId);

  const dayStart = startOfUtcDayIso();
  const sentToday = messages.filter(
    (message) =>
      message.status !== 'failed' &&
      message.sent_at !== null &&
      message.sent_at >= dayStart,
  ).length;

  const suppression = await loadSuppression(client, input.accountId);
  const blocksEmail = new Set(suppression.map((row) => row.email.toLowerCase()));
  const blocksLetters = new Set(
    suppression.filter((row) => row.reason !== 'bounce').map((row) => row.email.toLowerCase()),
  );

  const touches = new Map<string, number>();
  const addTouch = (email: string) =>
    touches.set(email.toLowerCase(), (touches.get(email.toLowerCase()) ?? 0) + 1);
  messages.filter((message) => message.status === 'sent').forEach((message) => addTouch(message.to_email));
  letterTargets.forEach(addTouch);
  const atTouchLimit = (enrollment: OutreachEnrollmentRow) =>
    (touches.get(enrollment.target_email.toLowerCase()) ?? 0) >= setting.max_touches;

  const firstEmails = new Map<string, FirstEmail>();
  for (const message of messages
    .filter((message) => message.status === 'sent' && message.provider_thread_id !== null)
    .sort((left, right) => right.step_id - left.step_id)) {
    firstEmails.set(message.enrollment_id, {
      subject: message.subject,
      threadId: message.provider_thread_id!,
    });
  }

  const steps = await loadSequenceSteps(client, input.accountId);
  const stepOf = (enrollment: OutreachEnrollmentRow) =>
    steps.get(enrollment.sequence_id)?.find((step) => step.ordinal === enrollment.current_step);
  const due = await loadDueEnrollments(client, input.accountId, now);
  const finished = due.filter((enrollment) => stepOf(enrollment) === undefined || atTouchLimit(enrollment));
  for (const enrollment of finished) {
    await finishSequence(client, enrollment);
  }
  const dueOn = (channel: OutreachStepRow['channel']) =>
    due.filter((enrollment) => !finished.includes(enrollment) && stepOf(enrollment)!.channel === channel);

  const lettersDue = dueOn('letter');
  for (const enrollment of lettersDue.filter((enrollment) =>
    blocksLetters.has(enrollment.target_email.toLowerCase()),
  )) {
    await markSuppressed(client, enrollment);
  }
  const letterEligible = lettersDue.filter(
    (enrollment) => !blocksLetters.has(enrollment.target_email.toLowerCase()),
  );
  const emailsDue = dueOn('email');
  for (const enrollment of emailsDue.filter((enrollment) =>
    blocksEmail.has(enrollment.target_email.toLowerCase()),
  )) {
    await markSuppressed(client, enrollment);
  }
  const emailEligible = emailsDue.filter(
    (enrollment) => !blocksEmail.has(enrollment.target_email.toLowerCase()),
  );

  const connection = await loadActiveConnection(client, input.accountId);
  const sender = await outreachSender(input.accountId);
  const criteria = await loadDealBoxCriteria(client, input.accountId);

  let sent = 0;

  if (connection === null) {
    await noteError(client, letterEligible, 'Connect a mailbox first');
    return { sent };
  }

  for (const [index, enrollment] of letterEligible.entries()) {
    if (atTouchLimit(enrollment)) {
      await finishSequence(client, enrollment);
      continue;
    }
    if (enrollment.firm_id === null) {
      await failEnrollment(client, enrollment, 'This enrollment has no firm to mail');
      continue;
    }
    const context = await loadMergeContext(client, enrollment, criteria, sender);
    try {
      await sendLetter({
        accountId: input.accountId,
        firmId: enrollment.firm_id,
        body: `${renderTemplate(stepOf(enrollment)!.body, context)}\n\nTo stop hearing from us, visit ${siteUrl}/${unsubscribePath(enrollment)}`,
        idempotencyKey: `${enrollment.id}:${enrollment.current_step}`,
        enrollmentId: enrollment.id,
        stepOrdinal: enrollment.current_step,
      });
    } catch (error) {
      if (error instanceof LetterCapReached || error instanceof LetterSetupMissing) {
        await noteError(client, letterEligible.slice(index), error.message);
        break;
      }
      const { message } = error as Error;
      if (error instanceof ApplicationFailure && error.nonRetryable) {
        await failEnrollment(client, enrollment, message);
      } else {
        await holdForNextTick(client, enrollment, 'letter', message);
      }
      continue;
    }
    await recordTouch(client, input.accountId, enrollment, steps);
    addTouch(enrollment.target_email);
    sent += 1;
  }

  const remaining = setting.daily_cap - sentToday;
  if (remaining <= 0) {
    return { sent };
  }

  if (setting.letter_return_address_line1 === null) {
    await noteError(client, emailEligible, 'Set a letter return address first');
    return { sent };
  }
  const returnAddress = `${setting.letter_return_address_line1}, ${setting.letter_return_city}, ${setting.letter_return_state} ${setting.letter_return_postal_code}`;

  for (const enrollment of emailEligible.slice(0, remaining)) {
    if (atTouchLimit(enrollment)) {
      await finishSequence(client, enrollment);
      continue;
    }
    const delivered = await deliverOutreach({
      client,
      accountId: input.accountId,
      connection,
      enrollment,
      step: stepOf(enrollment)!,
      steps,
      firstEmail: firstEmails.get(enrollment.id),
      footer: `${sender.name}, ${returnAddress} · `,
      unsubscribeUrl: `${siteUrl}/${unsubscribePath(enrollment)}`,
      oneClickUrl: `${siteUrl}/api/${unsubscribePath(enrollment)}`,
      context: await loadMergeContext(client, enrollment, criteria, {
        ...sender,
        email: connection.emailAddress,
      }),
    });

    if (delivered) {
      addTouch(enrollment.target_email);
      sent += 1;
    }
  }

  return { sent };
}

async function deliverOutreach(args: {
  client: OutreachClient;
  accountId: string;
  connection: MailboxConnection;
  enrollment: OutreachEnrollmentRow;
  step: OutreachStepRow;
  steps: SequenceSteps;
  firstEmail: FirstEmail | undefined;
  footer: string;
  unsubscribeUrl: string;
  oneClickUrl: string;
  context: MergeContext;
}): Promise<boolean> {
  const { client, accountId, connection, enrollment, step, steps, firstEmail, footer, context } = args;

  const subject = firstEmail ? `Re: ${firstEmail.subject}` : renderTemplate(step.subject!, context);
  const body = renderTemplate(step.body, context);

  const { error: recordError } = await client.from('outreach_message').insert({
    enrollment_id: enrollment.id,
    step_id: enrollment.current_step,
    to_email: enrollment.target_email,
    from_email: connection.emailAddress,
    subject,
    body,
    status: 'sending',
    sent_at: new Date().toISOString(),
  });

  if (recordError?.code === UNIQUE_VIOLATION) {
    await settleRecordedStep(client, accountId, enrollment, steps);
    return false;
  }

  if (recordError) {
    throw recordError;
  }

  let providerMessageId: string;
  let threadId: string;

  try {
    ({ providerMessageId, threadId } = await sendAs(connection, {
      to: enrollment.target_email,
      subject,
      text: `${body}\n\n${footer}Unsubscribe: ${args.unsubscribeUrl}`,
      html: `${body.replace(/\n/g, '<br>')}<br><br>${footer}<a href="${args.unsubscribeUrl}">Unsubscribe</a>`,
      replyTo: connection.emailAddress,
      inThread: firstEmail?.threadId,
      headers: {
        'List-Unsubscribe': `<${args.oneClickUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    }));
  } catch (error) {
    const { message } = error as Error;
    if (error instanceof MailboxNoResponse) {
      await markMessage(client, enrollment, { status: 'unknown', error: message });
      await noteError(client, [enrollment], 'Send result unknown; check the mailbox');
    } else if (
      error instanceof MailboxRequestFailed &&
      error.status >= 400 &&
      error.status < 500 &&
      error.status !== 429
    ) {
      await markMessage(client, enrollment, { status: 'failed', error: message });
      await failEnrollment(client, enrollment, message);
    } else {
      await client
        .from('outreach_message')
        .delete()
        .eq('enrollment_id', enrollment.id)
        .eq('step_id', enrollment.current_step)
        .throwOnError();
      await holdForNextTick(client, enrollment, 'email', message);
    }

    return false;
  }

  await markMessage(client, enrollment, {
    status: 'sent',
    provider_message_id: providerMessageId,
    provider_thread_id: threadId,
    sent_at: new Date().toISOString(),
  });
  await recordTouch(client, accountId, enrollment, steps);

  return true;
}

async function settleRecordedStep(
  client: OutreachClient,
  accountId: string,
  enrollment: OutreachEnrollmentRow,
  steps: SequenceSteps,
): Promise<void> {
  const { data } = await client
    .from('outreach_message')
    .select('status')
    .eq('enrollment_id', enrollment.id)
    .eq('step_id', enrollment.current_step)
    .single()
    .throwOnError();

  const status = data.status as OutreachMessageStatus;
  switch (status) {
    case 'sent':
      return recordTouch(client, accountId, enrollment, steps);
    case 'failed':
      return failEnrollment(client, enrollment);
    case 'sending':
    case 'unknown':
      return;
  }
}

async function recordTouch(
  client: OutreachClient,
  accountId: string,
  enrollment: OutreachEnrollmentRow,
  steps: SequenceSteps,
): Promise<void> {
  const next = steps
    .get(enrollment.sequence_id)!
    .find((step) => step.ordinal > enrollment.current_step);

  await client
    .from('outreach_enrollment')
    .update(
      next === undefined
        ? { status: 'sent', sent_count: enrollment.sent_count + 1, error: null }
        : {
            current_step: next.ordinal,
            next_send_at: new Date(Date.now() + next.delay_days * DAY_MS).toISOString(),
            sent_count: enrollment.sent_count + 1,
            error: null,
          },
    )
    .eq('id', enrollment.id)
    .eq('status', 'queued')
    .eq('current_step', enrollment.current_step)
    .throwOnError();

  if (enrollment.firm_id !== null) {
    await client
      .from('firm')
      .update({ status: 'contacted' })
      .eq('id', enrollment.firm_id)
      .eq('account_id', accountId)
      .throwOnError();
  }
}

async function failEnrollment(
  client: OutreachClient,
  enrollment: OutreachEnrollmentRow,
  error?: string,
): Promise<void> {
  await client
    .from('outreach_enrollment')
    .update({ status: 'failed', error })
    .eq('id', enrollment.id)
    .throwOnError();
}

async function noteError(
  client: OutreachClient,
  enrollments: OutreachEnrollmentRow[],
  message: string,
): Promise<void> {
  await client
    .from('outreach_enrollment')
    .update({ error: message })
    .in('id', enrollments.map((enrollment) => enrollment.id))
    .throwOnError();
}

async function holdForNextTick(
  client: OutreachClient,
  enrollment: OutreachEnrollmentRow,
  channel: OutreachStepRow['channel'],
  message: string,
): Promise<void> {
  console.warn(
    `[workflows] ${channel} for outreach enrollment ${enrollment.id} will retry next tick: ${message}`,
  );
  await noteError(client, [enrollment], message);
}

async function markSuppressed(
  client: OutreachClient,
  enrollment: OutreachEnrollmentRow,
): Promise<void> {
  await client
    .from('outreach_enrollment')
    .update({ status: 'suppressed' })
    .eq('id', enrollment.id)
    .eq('status', 'queued')
    .throwOnError();
}

async function finishSequence(
  client: OutreachClient,
  enrollment: OutreachEnrollmentRow,
): Promise<void> {
  await client
    .from('outreach_enrollment')
    .update({ status: 'sent' })
    .eq('id', enrollment.id)
    .eq('status', 'queued')
    .throwOnError();
}

async function markMessage(
  client: OutreachClient,
  enrollment: OutreachEnrollmentRow,
  outcome:
    | { status: 'sent'; provider_message_id: string; provider_thread_id: string; sent_at: string }
    | { status: 'failed' | 'unknown'; error: string },
): Promise<void> {
  await client
    .from('outreach_message')
    .update(outcome)
    .eq('enrollment_id', enrollment.id)
    .eq('step_id', enrollment.current_step)
    .throwOnError();
}

async function loadMergeContext(
  client: OutreachClient,
  enrollment: OutreachEnrollmentRow,
  criteria: DealBoxCriteria,
  sender: { name: string; company: string; email?: string },
): Promise<MergeContext> {
  const recipient = await loadContact(client, enrollment.contact_id);
  const firm = await loadFirm(client, enrollment.firm_id);
  const industries = criteria.industries?.join(', ') ?? criteria.naics?.join(', ');
  const revenueRange =
    criteria.min_revenue !== undefined
      ? `$${criteria.min_revenue.toLocaleString('en-US')}`
      : undefined;

  return {
    recipient: {
      name: recipient?.name ?? undefined,
      email: recipient?.email ?? enrollment.target_email,
    },
    firm: firm
      ? {
          name: firm.name,
          industry: firm.industry ?? undefined,
          city: firm.city ?? undefined,
          state: firm.state ?? undefined,
          website: firm.website ?? undefined,
        }
      : undefined,
    dealBox: dealBoxMergeFields({ revenueRange, industries }),
    sender,
  };
}

async function loadSetting(
  client: OutreachClient,
  accountId: string,
): Promise<OutreachSettingRow> {
  const { data, error } = await client
    .from('outreach_setting')
    .select(
      'daily_cap, max_touches, letter_return_address_line1, letter_return_city, letter_return_state, letter_return_postal_code',
    )
    .eq('account_id', accountId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as OutreachSettingRow;
}

async function loadSequenceSteps(
  client: OutreachClient,
  accountId: string,
): Promise<SequenceSteps> {
  const { data } = await client
    .from('outreach_step')
    .select('sequence_id, ordinal, delay_days, channel, subject, body')
    .eq('account_id', accountId)
    .order('ordinal')
    .throwOnError();

  const steps: SequenceSteps = new Map();
  for (const step of data as OutreachStepRow[]) {
    steps.set(step.sequence_id, [...(steps.get(step.sequence_id) ?? []), step]);
  }
  return steps;
}

async function loadLetterTargets(
  client: OutreachClient,
  accountId: string,
): Promise<string[]> {
  const { data } = await client
    .from('outreach_letter')
    .select('outreach_enrollment!inner(target_email)')
    .eq('account_id', accountId)
    .in('status', DELIVERED_LETTER_STATUSES)
    .throwOnError();

  return data.map((letter) => letter.outreach_enrollment.target_email);
}

async function loadAccountMessages(
  client: OutreachClient,
  accountId: string,
): Promise<OutreachMessageRow[]> {
  const { data } = await client
    .from('outreach_message')
    .select(
      'enrollment_id, step_id, to_email, subject, status, sent_at, provider_thread_id, outreach_enrollment!inner(account_id)',
    )
    .eq('outreach_enrollment.account_id', accountId)
    .throwOnError();

  return data as OutreachMessageRow[];
}

async function loadActiveConnection(
  client: OutreachClient,
  accountId: string,
): Promise<MailboxConnection | null> {
  const { data, error } = await client
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

async function loadSuppression(
  client: OutreachClient,
  accountId: string,
): Promise<{ email: string; reason: string }[]> {
  const { data } = await client
    .from('outreach_suppression')
    .select('email, reason')
    .eq('account_id', accountId)
    .throwOnError();

  return data;
}

async function loadDueEnrollments(
  client: OutreachClient,
  accountId: string,
  now: string,
): Promise<OutreachEnrollmentRow[]> {
  const { data, error } = await client
    .from('outreach_enrollment')
    .select('id, sequence_id, firm_id, contact_id, target_email, current_step, sent_count, unsubscribe_token')
    .eq('account_id', accountId)
    .eq('status', 'queued')
    .lte('next_send_at', now);

  if (error) {
    throw error;
  }

  return (data ?? []) as OutreachEnrollmentRow[];
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
