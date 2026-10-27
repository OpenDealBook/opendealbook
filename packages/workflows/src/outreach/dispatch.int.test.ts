import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApplicationFailure } from '@temporalio/common';

import { turnTeamBillingOn } from '@odb/supabase/test-support/team-billing';

import {
  provisionAccount,
  type IntegrationAccount,
} from '../../test-support/integration-harness';

const mailbox = vi.hoisted(() => {
  class MailboxRequestFailed extends Error {
    constructor(
      readonly status: number,
      action: string,
    ) {
      super(`${action} failed with status ${status}`);
    }
  }
  class MailboxNoResponse extends Error {}
  return {
    MailboxRequestFailed,
    MailboxNoResponse,
    sendAs: vi.fn(async (..._args: unknown[]) => ({
      providerMessageId: 'mock-provider-message-id',
      threadId: 'mock-thread-id',
    })),
  };
});

vi.mock('@odb/mailbox', () => ({
  sendAs: mailbox.sendAs,
  MailboxRequestFailed: mailbox.MailboxRequestFailed,
  MailboxNoResponse: mailbox.MailboxNoResponse,
}));

const letters = vi.hoisted(() => {
  class LetterCapReached extends Error {}
  class LetterSetupMissing extends Error {}
  return {
    LetterCapReached,
    LetterSetupMissing,
    sendLetter: vi.fn(async (..._args: unknown[]) => ({ letterId: 'letter-1', status: 'created' })),
  };
});

vi.mock('../letters/sendLetter', () => ({
  sendLetter: letters.sendLetter,
  LetterCapReached: letters.LetterCapReached,
  LetterSetupMissing: letters.LetterSetupMissing,
}));

const SITE_URL = 'https://app.odb.test';
process.env.NEXT_PUBLIC_SITE_URL = SITE_URL;

const database = vi.hoisted(() => ({ reachable: true }));

vi.mock('@odb/supabase/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@odb/supabase/admin')>();
  return {
    getSupabaseServerAdminClient: () => {
      const client = actual.getSupabaseServerAdminClient();
      const from = client.from.bind(client);
      client.from = ((table: Parameters<typeof from>[0]) => {
        if (!database.reachable) {
          throw new Error('worker lost the database');
        }
        return from(table);
      }) as typeof client.from;
      return client;
    },
  };
});

import { dispatchAccountOutreach } from './dispatch';

let account: IntegrationAccount;
let sequenceId: string;

async function seedSequence(): Promise<void> {
  const { data: sequence, error: sequenceError } = await account.admin
    .from('outreach_sequence')
    .insert({ account_id: account.accountId, name: 'Cold touch' })
    .select('id')
    .single();
  if (sequenceError) {
    throw sequenceError;
  }
  sequenceId = sequence.id as string;

  const { error: stepError } = await account.admin.from('outreach_step').insert({
    account_id: account.accountId,
    sequence_id: sequenceId,
    ordinal: 1,
    subject: 'Quick question',
    body: 'Hi there, would you be open to a conversation?',
  });
  if (stepError) {
    throw stepError;
  }

  const { error: connectionError } = await account.admin
    .from('mailbox_connection')
    .insert({
      account_id: account.accountId,
      user_id: account.userId,
      provider: 'gmail',
      nango_connection_id: 'nango-conn',
      provider_config_key: 'gmail-config',
      email_address: 'operator@odb.test',
      status: 'active',
    });
  if (connectionError) {
    throw connectionError;
  }
}

const RETURN_ADDRESS = '1 Main St, Springfield, IL 62701';

async function setSetting(dailyCap: number, maxTouches: number): Promise<void> {
  const { error } = await account.admin.from('outreach_setting').insert({
    account_id: account.accountId,
    daily_cap: dailyCap,
    max_touches: maxTouches,
    letter_return_name: 'Beacon Partners',
    letter_return_address_line1: '1 Main St',
    letter_return_city: 'Springfield',
    letter_return_state: 'IL',
    letter_return_postal_code: '62701',
  });
  if (error) {
    throw error;
  }
}

async function enroll(targetEmail: string, status = 'queued', currentStep = 1): Promise<string> {
  const { data, error } = await account.admin
    .from('outreach_enrollment')
    .insert({
      account_id: account.accountId,
      sequence_id: sequenceId,
      target_email: targetEmail,
      status,
      current_step: currentStep,
      next_send_at: new Date(Date.now() - 3_600_000).toISOString(),
    })
    .select('id')
    .single();
  if (error) {
    throw error;
  }
  return data.id as string;
}

async function messagesFor(emails: string[]): Promise<Record<string, number>> {
  const { data: enrollments } = await account.admin
    .from('outreach_enrollment')
    .select('id')
    .eq('account_id', account.accountId);
  const ids = (enrollments ?? []).map((row: { id: string }) => row.id);
  const { data } = await account.admin
    .from('outreach_message')
    .select('to_email, status')
    .in('enrollment_id', ids);
  const counts: Record<string, number> = {};
  for (const email of emails) {
    counts[email] = (data ?? []).filter(
      (row: { to_email: string; status: string }) =>
        row.to_email === email && row.status === 'sent',
    ).length;
  }
  return counts;
}

async function addStep(
  ordinal: number,
  delayDays: number,
  channel: 'email' | 'letter' = 'email',
): Promise<void> {
  await account.admin
    .from('outreach_step')
    .insert({
      account_id: account.accountId,
      sequence_id: sequenceId,
      ordinal,
      delay_days: delayDays,
      channel,
      subject: channel === 'email' ? `Step ${ordinal}` : null,
      body: `Step ${ordinal} body for {{ firm.name }}`,
    })
    .throwOnError();
}

async function approvedFirm(name: string): Promise<string> {
  const { data: firm } = await account.admin
    .from('firm')
    .insert({ account_id: account.accountId, name })
    .select('id')
    .single()
    .throwOnError();
  const { data: verdict } = await account.admin
    .from('firm_verdict')
    .insert({
      account_id: account.accountId,
      firm_id: firm.id,
      fit: true,
      reasons: ['fits the deal box'],
      model: 'test',
    })
    .select('id')
    .single()
    .throwOnError();
  await account.admin
    .from('firm_verdict_approval')
    .insert({ verdict_id: verdict.id, account_id: account.accountId, approved_by: account.userId })
    .throwOnError();
  return firm.id as string;
}

async function enrollFirm(firmId: string, targetEmail: string, currentStep: number): Promise<string> {
  const id = await enroll(targetEmail, 'queued', currentStep);
  await account.admin
    .from('outreach_enrollment')
    .update({ firm_id: firmId })
    .eq('id', id)
    .throwOnError();
  return id;
}

async function tokenOf(id: string): Promise<string> {
  const { data } = await account.admin
    .from('outreach_enrollment')
    .select('unsubscribe_token')
    .eq('id', id)
    .single()
    .throwOnError();
  return data.unsubscribe_token as string;
}

async function progress(id: string) {
  const { data } = await account.admin
    .from('outreach_enrollment')
    .select('status, current_step, sent_count, next_send_at')
    .eq('id', id)
    .single()
    .throwOnError();
  return data as { status: string; current_step: number; sent_count: number; next_send_at: string };
}

const DAY_MS = 86_400_000;

beforeEach(async () => {
  mailbox.sendAs.mockClear();
  letters.sendLetter.mockClear();
  database.reachable = true;
  account = await provisionAccount();
  await seedSequence();
});

afterEach(async () => {
  await account.cleanup();
});

describe('dispatchAccountOutreach (integration)', () => {
  it('honors the daily cap', async () => {
    await setSetting(2, 5);
    await enroll('a@target.test');
    await enroll('b@target.test');
    await enroll('c@target.test');

    const result = await dispatchAccountOutreach({ accountId: account.accountId });

    expect(result.sent).toBe(2);
    expect(mailbox.sendAs).toHaveBeenCalledTimes(2);

    const { data: sent } = await account.admin
      .from('outreach_enrollment')
      .select('status')
      .eq('account_id', account.accountId)
      .eq('status', 'sent');
    expect(sent).toHaveLength(2);
  });

  it('honors the per-target max touches', async () => {
    await setSetting(10, 1);

    const priorEnrollment = await enroll('repeat@target.test', 'sent');
    await account.admin.from('outreach_message').insert({
      enrollment_id: priorEnrollment,
      step_id: 1,
      to_email: 'repeat@target.test',
      subject: 'Earlier',
      body: 'Earlier touch',
      status: 'sent',
      sent_at: new Date().toISOString(),
    });

    await enroll('repeat@target.test');
    await enroll('fresh@target.test');

    const result = await dispatchAccountOutreach({ accountId: account.accountId });

    expect(result.sent).toBe(1);
    const counts = await messagesFor(['repeat@target.test', 'fresh@target.test']);
    expect(counts['repeat@target.test']).toBe(1);
    expect(counts['fresh@target.test']).toBe(1);
  });

  it('finishes an enrollment whose target has reached max touches instead of leaving it queued', async () => {
    await setSetting(10, 1);
    await addStep(2, 7);
    const enrollmentId = await enroll('capped@target.test');

    await dispatchAccountOutreach({ accountId: account.accountId });
    await account.admin
      .from('outreach_enrollment')
      .update({ next_send_at: new Date(Date.now() - 60_000).toISOString() })
      .eq('id', enrollmentId)
      .throwOnError();
    await dispatchAccountOutreach({ accountId: account.accountId });

    expect(mailbox.sendAs).toHaveBeenCalledTimes(1);
    expect(await progress(enrollmentId)).toMatchObject({ status: 'sent', current_step: 2, sent_count: 1 });
  });

  it('allows three touches for a team that has not set its own limit', async () => {
    const { data } = await account.admin
      .from('outreach_setting')
      .insert({ account_id: account.accountId, daily_cap: 10 })
      .select('max_touches')
      .single()
      .throwOnError();

    expect(data.max_touches).toBe(3);
  });

  it('honors the suppression list', async () => {
    await setSetting(10, 5);
    await account.admin.from('outreach_suppression').insert({
      account_id: account.accountId,
      email: 'blocked@target.test',
      reason: 'opt_out',
    });

    const blocked = await enroll('blocked@target.test');
    await enroll('allowed@target.test');

    const result = await dispatchAccountOutreach({ accountId: account.accountId });

    expect(result.sent).toBe(1);
    const counts = await messagesFor(['blocked@target.test', 'allowed@target.test']);
    expect(counts['blocked@target.test']).toBe(0);
    expect(counts['allowed@target.test']).toBe(1);
    expect(await progress(blocked)).toMatchObject({ status: 'suppressed' });
  });

  it('marks a send that got no response unknown and never resends it', async () => {
    await setSetting(10, 5);
    const enrollmentId = await enroll('silent@target.test');
    mailbox.sendAs.mockRejectedValueOnce(new mailbox.MailboxNoResponse('Gmail send got no response'));

    await dispatchAccountOutreach({ accountId: account.accountId });
    await dispatchAccountOutreach({ accountId: account.accountId });

    expect(mailbox.sendAs).toHaveBeenCalledTimes(1);
    const { data } = await account.admin
      .from('outreach_message')
      .select('status')
      .eq('enrollment_id', enrollmentId)
      .single()
      .throwOnError();
    expect(data.status).toBe('unknown');
    expect(await progress(enrollmentId)).toMatchObject({ status: 'queued', current_step: 1 });
    expect(await failure(enrollmentId)).toBe('Send result unknown; check the mailbox');
  });

  it('does not resend when a retry follows a crash after the provider accepted the email', async () => {
    await setSetting(10, 5);
    await enroll('once@target.test');
    mailbox.sendAs.mockImplementationOnce(async () => {
      database.reachable = false;
      return { providerMessageId: 'accepted-before-crash', threadId: 'thread-before-crash' };
    });

    await expect(dispatchAccountOutreach({ accountId: account.accountId })).rejects.toThrow(
      'worker lost the database',
    );
    database.reachable = true;
    await dispatchAccountOutreach({ accountId: account.accountId });

    expect(mailbox.sendAs).toHaveBeenCalledTimes(1);
  });

  it('records the message as sent with the provider id once the send succeeds', async () => {
    await setSetting(10, 5);
    const enrollmentId = await enroll('recorded@target.test');

    await dispatchAccountOutreach({ accountId: account.accountId });

    const { data } = await account.admin
      .from('outreach_message')
      .select('status, provider_message_id, sent_at, error')
      .eq('enrollment_id', enrollmentId)
      .single();
    expect(data).toMatchObject({
      status: 'sent',
      provider_message_id: 'mock-provider-message-id',
      error: null,
    });
    expect(data!.sent_at).not.toBeNull();
  });

  it('records the message as failed with the provider error when the send throws', async () => {
    await setSetting(10, 5);
    const enrollmentId = await enroll('bounced@target.test');
    mailbox.sendAs.mockRejectedValueOnce(new mailbox.MailboxRequestFailed(400, 'Gmail send'));

    await dispatchAccountOutreach({ accountId: account.accountId });

    const { data } = await account.admin
      .from('outreach_message')
      .select('status, error')
      .eq('enrollment_id', enrollmentId)
      .single();
    expect(data).toEqual({ status: 'failed', error: 'Gmail send failed with status 400' });
    expect(await progress(enrollmentId)).toMatchObject({ status: 'failed' });
    expect(await failure(enrollmentId)).toBe('Gmail send failed with status 400');
  });

  it('keeps the enrollment queued with the reason when the send fails for a passing reason, then sends next tick', async () => {
    await setSetting(10, 5);
    const enrollmentId = await enroll('later@target.test');
    mailbox.sendAs.mockRejectedValueOnce(new mailbox.MailboxRequestFailed(503, 'Gmail send'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await dispatchAccountOutreach({ accountId: account.accountId });

    expect(await progress(enrollmentId)).toMatchObject({ status: 'queued', sent_count: 0 });
    expect(await failure(enrollmentId)).toBe('Gmail send failed with status 503');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(enrollmentId));
    warn.mockRestore();

    await dispatchAccountOutreach({ accountId: account.accountId });

    expect(mailbox.sendAs).toHaveBeenCalledTimes(2);
    expect(await progress(enrollmentId)).toMatchObject({ status: 'sent', sent_count: 1 });
    expect(await failure(enrollmentId)).toBeNull();
  });

  it('treats a failure before the send as passing', async () => {
    await setSetting(10, 5);
    const enrollmentId = await enroll('network@target.test');
    mailbox.sendAs.mockRejectedValueOnce(new TypeError('fetch failed'));
    vi.spyOn(console, 'warn').mockImplementationOnce(() => {});

    await dispatchAccountOutreach({ accountId: account.accountId });

    expect(await progress(enrollmentId)).toMatchObject({ status: 'queued' });
    expect(await failure(enrollmentId)).toBe('fetch failed');
  });

  it('holds emails with the reason while the team has no letter return address', async () => {
    await setSetting(10, 5);
    await account.admin
      .from('outreach_setting')
      .update({ letter_return_address_line1: null })
      .eq('account_id', account.accountId)
      .throwOnError();
    const enrollmentId = await enroll('noaddress@target.test');

    await dispatchAccountOutreach({ accountId: account.accountId });

    expect(mailbox.sendAs).not.toHaveBeenCalled();
    expect(await progress(enrollmentId)).toMatchObject({ status: 'queued' });
    expect(await failure(enrollmentId)).toBe('Set a letter return address first');
  });

  it('finishes an enrollment whose step was removed and keeps dispatching the rest', async () => {
    await setSetting(10, 5);
    const orphan = await enroll('orphan@target.test', 'queued', 9);
    const fine = await enroll('fine@target.test');

    await dispatchAccountOutreach({ accountId: account.accountId });

    expect(await progress(orphan)).toMatchObject({ status: 'sent', current_step: 9 });
    expect(await progress(fine)).toMatchObject({ status: 'sent', sent_count: 1 });
  });

  it('replies to the first email\'s thread with its subject on a follow-up', async () => {
    await setSetting(10, 5);
    await addStep(2, 7);
    const enrollmentId = await enroll('follow@target.test', 'queued', 2);
    await account.admin
      .from('outreach_message')
      .insert({
        enrollment_id: enrollmentId,
        step_id: 1,
        to_email: 'follow@target.test',
        subject: 'Quick question',
        body: 'Hi',
        status: 'sent',
        sent_at: new Date(Date.now() - 7 * DAY_MS).toISOString(),
        provider_thread_id: 'first-thread',
      })
      .throwOnError();

    await dispatchAccountOutreach({ accountId: account.accountId });

    expect(mailbox.sendAs).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ subject: 'Re: Quick question', inThread: 'first-thread' }),
    );
  });

  it('matches suppression and touches without regard to case', async () => {
    await setSetting(10, 1);
    await account.admin
      .from('outreach_suppression')
      .insert({ account_id: account.accountId, email: 'Blocked@Target.test', reason: 'opt_out' })
      .throwOnError();
    const prior = await enroll('Touched@Target.test', 'sent');
    await account.admin
      .from('outreach_message')
      .insert({
        enrollment_id: prior,
        step_id: 1,
        to_email: 'Touched@Target.test',
        subject: 'Earlier',
        body: 'Earlier',
        status: 'sent',
        sent_at: new Date(Date.now() - DAY_MS).toISOString(),
      })
      .throwOnError();
    await enroll('blocked@target.test');
    await enroll('touched@target.test');

    const result = await dispatchAccountOutreach({ accountId: account.accountId });

    expect(result.sent).toBe(0);
    expect(mailbox.sendAs).not.toHaveBeenCalled();
  });

  it('counts only delivered attempts as touches', async () => {
    await setSetting(10, 1);
    await account.admin
      .from('outreach_setting')
      .update({ letter_monthly_cap: 5 })
      .eq('account_id', account.accountId)
      .throwOnError();
    const prior = await enroll('retry@target.test', 'failed');
    await account.admin
      .from('outreach_message')
      .insert({
        enrollment_id: prior,
        step_id: 1,
        to_email: 'retry@target.test',
        subject: 'Earlier',
        body: 'Earlier',
        status: 'failed',
      })
      .throwOnError();
    await account.admin
      .from('outreach_letter')
      .insert({
        account_id: account.accountId,
        enrollment_id: prior,
        step_ordinal: 1,
        provider: 'lob',
        address_line1: '1 Main St',
        city: 'Springfield',
        state: 'IL',
        postal_code: '62701',
        status: 'failed',
      })
      .throwOnError();
    await enroll('retry@target.test');

    const result = await dispatchAccountOutreach({ accountId: account.accountId });

    expect(result.sent).toBe(1);
  });

  it('never goes past max touches within one tick', async () => {
    await setSetting(10, 1);
    const first = await enroll('twice@target.test');
    const second = await enroll('twice@target.test');

    const result = await dispatchAccountOutreach({ accountId: account.accountId });

    expect(result.sent).toBe(1);
    expect(mailbox.sendAs).toHaveBeenCalledTimes(1);
    expect([(await progress(first)).status, (await progress(second)).status]).toEqual(['sent', 'sent']);
  });

  it('records which mailbox sent the email', async () => {
    await setSetting(10, 5);
    const enrollmentId = await enroll('from@target.test');

    await dispatchAccountOutreach({ accountId: account.accountId });

    const { data } = await account.admin
      .from('outreach_message')
      .select('from_email')
      .eq('enrollment_id', enrollmentId)
      .single()
      .throwOnError();
    expect(data.from_email).toBe('operator@odb.test');
  });

  it('refuses to send and logs an error when the site URL is not set', async () => {
    await setSetting(10, 5);
    await enroll('nourl@target.test');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    delete process.env.NEXT_PUBLIC_SITE_URL;

    const result = await dispatchAccountOutreach({ accountId: account.accountId });
    process.env.NEXT_PUBLIC_SITE_URL = SITE_URL;

    expect(result.sent).toBe(0);
    expect(mailbox.sendAs).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('NEXT_PUBLIC_SITE_URL'));
    error.mockRestore();
  });

  async function priorMessage(enrollmentId: string, status: string, sentAt: string | null) {
    await account.admin
      .from('outreach_message')
      .insert({
        enrollment_id: enrollmentId,
        step_id: 1,
        to_email: 'prior@target.test',
        subject: 'Earlier',
        body: 'Earlier touch',
        status,
        sent_at: sentAt,
      })
      .throwOnError();
  }

  async function enrollment(id: string) {
    const { data } = await account.admin
      .from('outreach_enrollment')
      .select('status, sent_count')
      .eq('id', id)
      .single()
      .throwOnError();
    return data;
  }

  it('finishes the bookkeeping without resending when the step was already sent', async () => {
    await setSetting(10, 5);
    const { data: firm } = await account.admin
      .from('firm')
      .insert({ account_id: account.accountId, name: 'Sent Firm LLC' })
      .select('id')
      .single()
      .throwOnError();
    const { data: verdict } = await account.admin
      .from('firm_verdict')
      .insert({
        account_id: account.accountId,
        firm_id: firm.id,
        fit: true,
        reasons: ['fits the deal box'],
        model: 'test',
      })
      .select('id')
      .single()
      .throwOnError();
    await account.admin
      .from('firm_verdict_approval')
      .insert({ verdict_id: verdict.id, account_id: account.accountId, approved_by: account.userId })
      .throwOnError();
    const enrollmentId = await enroll('sent@target.test');
    await account.admin
      .from('outreach_enrollment')
      .update({ firm_id: firm.id })
      .eq('id', enrollmentId)
      .throwOnError();
    await priorMessage(enrollmentId, 'sent', new Date().toISOString());

    await dispatchAccountOutreach({ accountId: account.accountId });

    expect(mailbox.sendAs).not.toHaveBeenCalled();
    expect(await enrollment(enrollmentId)).toEqual({ status: 'sent', sent_count: 1 });
    const { data: contacted } = await account.admin
      .from('firm')
      .select('status')
      .eq('id', firm.id)
      .single()
      .throwOnError();
    expect(contacted.status).toBe('contacted');
  });

  it('fails the enrollment without resending when the step already failed', async () => {
    await setSetting(10, 5);
    const enrollmentId = await enroll('failed@target.test');
    await priorMessage(enrollmentId, 'failed', null);

    await dispatchAccountOutreach({ accountId: account.accountId });

    expect(mailbox.sendAs).not.toHaveBeenCalled();
    expect((await enrollment(enrollmentId)).status).toBe('failed');
  });

  it('leaves a step still sending for the sweep', async () => {
    await setSetting(10, 5);
    const enrollmentId = await enroll('sending@target.test');
    await priorMessage(enrollmentId, 'sending', new Date().toISOString());

    await dispatchAccountOutreach({ accountId: account.accountId });

    expect(mailbox.sendAs).not.toHaveBeenCalled();
    expect(await enrollment(enrollmentId)).toEqual({ status: 'queued', sent_count: 0 });
  });

  it('stamps the started time on the message before the send', async () => {
    await setSetting(10, 5);
    const enrollmentId = await enroll('started@target.test');
    let startedAt: string | null = 'unread';
    mailbox.sendAs.mockImplementationOnce(async () => {
      const { data } = await account.admin
        .from('outreach_message')
        .select('sent_at')
        .eq('enrollment_id', enrollmentId)
        .single()
        .throwOnError();
      startedAt = data.sent_at;
      return { providerMessageId: 'pm-started', threadId: 'thread-started' };
    });

    await dispatchAccountOutreach({ accountId: account.accountId });

    expect(startedAt).not.toBeNull();
    expect(startedAt).not.toBe('unread');
  });

  it('counts messages still sending today against the daily cap', async () => {
    await setSetting(1, 5);
    const inFlight = await enroll('inflight@target.test', 'sent');
    await priorMessage(inFlight, 'sending', new Date().toISOString());
    await enroll('next@target.test');

    const result = await dispatchAccountOutreach({ accountId: account.accountId });

    expect(result.sent).toBe(0);
    expect(mailbox.sendAs).not.toHaveBeenCalled();
  });

  it('advances to the next step and schedules it by that step\'s delay', async () => {
    await setSetting(10, 5);
    await addStep(2, 7);
    const enrollmentId = await enroll('multi@target.test');

    await dispatchAccountOutreach({ accountId: account.accountId });

    const after = await progress(enrollmentId);
    expect(after).toMatchObject({ status: 'queued', current_step: 2, sent_count: 1 });
    expect(Date.parse(after.next_send_at) - Date.now()).toBeGreaterThan(7 * DAY_MS - 60_000);
    expect(Date.parse(after.next_send_at) - Date.now()).toBeLessThanOrEqual(7 * DAY_MS);
  });

  it('sends the next step once it is due and completes after the last step', async () => {
    await setSetting(10, 5);
    await addStep(2, 7);
    const enrollmentId = await enroll('last@target.test', 'queued', 2);

    await dispatchAccountOutreach({ accountId: account.accountId });

    expect(mailbox.sendAs).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ subject: 'Step 2' }),
    );
    expect(await progress(enrollmentId)).toMatchObject({ status: 'sent', current_step: 2, sent_count: 1 });
  });

  it('advances once without resending when a retry finds the step already sent', async () => {
    await setSetting(10, 5);
    await addStep(2, 7);
    const enrollmentId = await enroll('retried@target.test');
    await priorMessage(enrollmentId, 'sent', new Date().toISOString());

    await dispatchAccountOutreach({ accountId: account.accountId });

    expect(mailbox.sendAs).not.toHaveBeenCalled();
    expect(await progress(enrollmentId)).toMatchObject({ status: 'queued', current_step: 2, sent_count: 1 });
  });

  it('carries a one-click unsubscribe link in the body and the List-Unsubscribe header', async () => {
    await setSetting(10, 5);
    const enrollmentId = await enroll('optout@target.test');
    const { data } = await account.admin
      .from('outreach_enrollment')
      .select('unsubscribe_token')
      .eq('id', enrollmentId)
      .single()
      .throwOnError();
    const link = `${SITE_URL}/unsubscribe?token=${data.unsubscribe_token}`;
    await account.admin
      .from('buyer_profile')
      .insert({ account_id: account.accountId, version: 1, display_name: 'Jordan Buyer' })
      .throwOnError();

    await dispatchAccountOutreach({ accountId: account.accountId });

    const email = mailbox.sendAs.mock.calls[0]![1] as {
      text: string;
      html: string;
      headers: Record<string, string>;
    };
    expect(email.text).toMatch(
      new RegExp(`\\n\\nJordan Buyer, ${RETURN_ADDRESS} · Unsubscribe: ${link.replace(/[?]/g, '\\?')}$`),
    );
    expect(email.html).toContain(`<br><br>Jordan Buyer, ${RETURN_ADDRESS} · <a href="${link}">Unsubscribe</a>`);
    expect(email.headers).toEqual({
      'List-Unsubscribe': `<${SITE_URL}/api/unsubscribe?token=${data.unsubscribe_token}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
  });

  it('records the provider thread id so replies can be found', async () => {
    await setSetting(10, 5);
    const enrollmentId = await enroll('threaded@target.test');

    await dispatchAccountOutreach({ accountId: account.accountId });

    const { data } = await account.admin
      .from('outreach_message')
      .select('provider_thread_id')
      .eq('enrollment_id', enrollmentId)
      .single()
      .throwOnError();
    expect(data.provider_thread_id).toBe('mock-thread-id');
  });

  it('sends a letter step through sendLetter outside the daily email cap and advances', async () => {
    await setSetting(1, 5);
    await addStep(2, 0, 'letter');
    await addStep(3, 7);
    const firmId = await approvedFirm('Letter Firm LLC');
    const letterEnrollment = await enrollFirm(firmId, 'owner@letterfirm.test', 2);
    await enroll('email@target.test');

    const result = await dispatchAccountOutreach({ accountId: account.accountId });

    expect(mailbox.sendAs).toHaveBeenCalledTimes(1);
    expect(letters.sendLetter).toHaveBeenCalledWith({
      accountId: account.accountId,
      firmId,
      body: `Step 2 body for Letter Firm LLC\n\nTo stop hearing from us, visit ${SITE_URL}/unsubscribe?token=${await tokenOf(letterEnrollment)}`,
      idempotencyKey: `${letterEnrollment}:2`,
      enrollmentId: letterEnrollment,
      stepOrdinal: 2,
    });
    expect(result.sent).toBe(2);
    expect(await progress(letterEnrollment)).toMatchObject({ status: 'queued', current_step: 3, sent_count: 1 });
  });

  it('keeps every due letter queued with the limit reason when the letter cap is reached', async () => {
    await setSetting(10, 5);
    await addStep(2, 0, 'letter');
    const first = await enrollFirm(await approvedFirm('Capped Firm LLC'), 'owner@capped.test', 2);
    const second = await enrollFirm(await approvedFirm('Also Capped LLC'), 'owner@alsocapped.test', 2);
    letters.sendLetter.mockRejectedValue(
      new letters.LetterCapReached('The monthly letter limit is reached'),
    );

    const result = await dispatchAccountOutreach({ accountId: account.accountId });
    const attempts = letters.sendLetter.mock.calls.length;
    letters.sendLetter.mockReset();
    letters.sendLetter.mockImplementation(async () => ({ letterId: 'letter-1', status: 'created' }));

    expect(result.sent).toBe(0);
    expect(attempts).toBe(1);
    expect(await progress(first)).toMatchObject({ status: 'queued', current_step: 2, sent_count: 0 });
    expect(await progress(second)).toMatchObject({ status: 'queued', current_step: 2, sent_count: 0 });
    expect(await failure(first)).toBe('The monthly letter limit is reached');
    expect(await failure(second)).toBe('The monthly letter limit is reached');
  });

  it('fails only the letter enrollment whose letter cannot be mailed and keeps sending the rest', async () => {
    await setSetting(10, 5);
    await addStep(2, 0, 'letter');
    const firmId = await approvedFirm('Nowhere Firm LLC');
    const letterEnrollment = await enrollFirm(firmId, 'owner@nowhere.test', 2);
    await enroll('email@target.test');
    letters.sendLetter.mockRejectedValueOnce(
      ApplicationFailure.nonRetryable('This firm has no mailing address'),
    );

    const result = await dispatchAccountOutreach({ accountId: account.accountId });

    expect(result.sent).toBe(1);
    expect(mailbox.sendAs).toHaveBeenCalledTimes(1);
    const { data } = await account.admin
      .from('outreach_enrollment')
      .select('status, error')
      .eq('id', letterEnrollment)
      .single()
      .throwOnError();
    expect(data).toEqual({ status: 'failed', error: 'This firm has no mailing address' });
  });

  it('leaves a letter enrollment queued for the next tick when its letter fails for a passing reason', async () => {
    await setSetting(10, 5);
    await addStep(2, 0, 'letter');
    const flakyFirm = await approvedFirm('Flaky Firm LLC');
    const steadyFirm = await approvedFirm('Steady Firm LLC');
    const flaky = await enrollFirm(flakyFirm, 'owner@flaky.test', 2);
    const steady = await enrollFirm(steadyFirm, 'owner@steady.test', 2);
    await enroll('email@target.test');
    letters.sendLetter.mockImplementation(async (letter: unknown) => {
      if ((letter as { firmId: string }).firmId === flakyFirm) {
        throw new Error('Lob address check failed with status 503');
      }
      return { letterId: 'letter-ok', status: 'created' };
    });

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await dispatchAccountOutreach({ accountId: account.accountId });
    letters.sendLetter.mockReset();
    letters.sendLetter.mockImplementation(async () => ({ letterId: 'letter-1', status: 'created' }));

    expect(result.sent).toBe(2);
    expect(mailbox.sendAs).toHaveBeenCalledTimes(1);
    expect(await progress(flaky)).toMatchObject({ status: 'queued', current_step: 2, sent_count: 0 });
    expect(await progress(steady)).toMatchObject({ status: 'sent', sent_count: 1 });
    expect(await failure(flaky)).toBe('Lob address check failed with status 503');
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`${flaky}.*Lob address check failed with status 503`)),
    );
    warn.mockRestore();

    await dispatchAccountOutreach({ accountId: account.accountId });

    expect(await progress(flaky)).toMatchObject({ status: 'sent', sent_count: 1 });
    expect(await failure(flaky)).toBeNull();
  });

  async function failure(id: string) {
    const { data } = await account.admin
      .from('outreach_enrollment')
      .select('error')
      .eq('id', id)
      .single()
      .throwOnError();
    return data.error as string | null;
  }

  it('holds every due letter queued with the reason when the team\'s letter setup is missing', async () => {
    await setSetting(10, 5);
    await addStep(2, 0, 'letter');
    const first = await enrollFirm(await approvedFirm('First Firm LLC'), 'owner@first.test', 2);
    const second = await enrollFirm(await approvedFirm('Second Firm LLC'), 'owner@second.test', 2);
    letters.sendLetter.mockRejectedValue(new letters.LetterSetupMissing('Connect a letter provider first'));

    await dispatchAccountOutreach({ accountId: account.accountId });
    const attempts = letters.sendLetter.mock.calls.length;
    letters.sendLetter.mockReset();
    letters.sendLetter.mockImplementation(async () => ({ letterId: 'letter-1', status: 'created' }));

    expect(await progress(first)).toMatchObject({ status: 'queued', current_step: 2 });
    expect(await progress(second)).toMatchObject({ status: 'queued', current_step: 2 });
    expect(await failure(first)).toBe('Connect a letter provider first');
    expect(await failure(second)).toBe('Connect a letter provider first');
    expect(attempts).toBe(1);
  });

  it('signs as the buyer profile name for the team company', async () => {
    await setSetting(10, 5);
    await account.admin
      .from('outreach_step')
      .update({ body: 'From {{ sender.name }} at {{ sender.company }}' })
      .eq('sequence_id', sequenceId)
      .throwOnError();
    await account.admin
      .from('buyer_profile')
      .insert({ account_id: account.accountId, version: 1, display_name: 'Jordan Buyer' })
      .throwOnError();
    await enroll('signed@target.test');

    await dispatchAccountOutreach({ accountId: account.accountId });

    const { data: team } = await account.admin
      .from('accounts')
      .select('name')
      .eq('id', account.accountId)
      .single()
      .throwOnError();
    const email = mailbox.sendAs.mock.calls[0]![1] as { text: string };
    expect(email.text).toMatch(new RegExp(`^From Jordan Buyer at ${team.name}\\n`));
  });

  it('greets a recipient whose contact has no name naturally', async () => {
    await setSetting(10, 5);
    await account.admin
      .from('outreach_step')
      .update({ body: 'Hi {{ recipient.name | there }},' })
      .eq('sequence_id', sequenceId)
      .throwOnError();
    const { data: contact } = await account.admin
      .from('contact')
      .insert({ account_id: account.accountId, name: null, email: 'found@target.test' })
      .select('id')
      .single()
      .throwOnError();
    const enrollmentId = await enroll('found@target.test');
    await account.admin
      .from('outreach_enrollment')
      .update({ contact_id: contact.id })
      .eq('id', enrollmentId)
      .throwOnError();

    await dispatchAccountOutreach({ accountId: account.accountId });

    const email = mailbox.sendAs.mock.calls[0]![1] as { text: string };
    expect(email.text).toMatch(/^Hi there,\n/);
  });

  it('signs as the team owner when the team has no buyer profile name', async () => {
    await setSetting(10, 5);
    await account.admin
      .from('outreach_step')
      .update({ body: 'From {{ sender.name }}' })
      .eq('sequence_id', sequenceId)
      .throwOnError();
    const { data: owner } = await account.admin
      .from('accounts')
      .select('name')
      .eq('primary_owner_user_id', account.userId)
      .eq('is_personal_account', true)
      .single()
      .throwOnError();
    await enroll('owner-signed@target.test');

    await dispatchAccountOutreach({ accountId: account.accountId });

    const email = mailbox.sendAs.mock.calls[0]![1] as { text: string };
    expect(email.text).toMatch(new RegExp(`^From ${owner.name}\\n`));
  });

  it('fails a letter enrollment that has no firm to mail without calling sendLetter', async () => {
    await setSetting(10, 5);
    await addStep(2, 0, 'letter');
    const enrollmentId = await enroll('nofirm@target.test', 'queued', 2);

    await dispatchAccountOutreach({ accountId: account.accountId });

    expect(letters.sendLetter).not.toHaveBeenCalled();
    const { data } = await account.admin
      .from('outreach_enrollment')
      .select('status, error')
      .eq('id', enrollmentId)
      .single()
      .throwOnError();
    expect(data).toEqual({ status: 'failed', error: 'This enrollment has no firm to mail' });
  });

  it('does not mail a letter to a firm whose email opted out', async () => {
    await setSetting(10, 5);
    await addStep(2, 0, 'letter');
    const firmId = await approvedFirm('Opted Firm LLC');
    await account.admin
      .from('outreach_suppression')
      .insert({ account_id: account.accountId, email: 'Owner@Opted.test', reason: 'opt_out' })
      .throwOnError();
    const enrollmentId = await enrollFirm(firmId, 'owner@opted.test', 2);

    await dispatchAccountOutreach({ accountId: account.accountId });

    expect(letters.sendLetter).not.toHaveBeenCalled();
    expect(await progress(enrollmentId)).toMatchObject({ status: 'suppressed' });
  });

  it('still mails a letter to an address that only bounced', async () => {
    await setSetting(10, 5);
    await addStep(2, 0, 'letter');
    const firmId = await approvedFirm('Bounced Firm LLC');
    await account.admin
      .from('outreach_suppression')
      .insert({ account_id: account.accountId, email: 'owner@bounced.test', reason: 'bounce' })
      .throwOnError();
    const enrollmentId = await enrollFirm(firmId, 'owner@bounced.test', 2);

    await dispatchAccountOutreach({ accountId: account.accountId });

    expect(letters.sendLetter).toHaveBeenCalledTimes(1);
    expect(await progress(enrollmentId)).toMatchObject({ status: 'sent', sent_count: 1 });
  });

  it('holds letters with the reason while the team has no active mailbox', async () => {
    await setSetting(10, 5);
    await addStep(2, 0, 'letter');
    await account.admin
      .from('mailbox_connection')
      .update({ status: 'revoked' })
      .eq('account_id', account.accountId)
      .throwOnError();
    const enrollmentId = await enrollFirm(await approvedFirm('Quiet Firm LLC'), 'owner@quiet.test', 2);

    await dispatchAccountOutreach({ accountId: account.accountId });

    expect(letters.sendLetter).not.toHaveBeenCalled();
    expect(await progress(enrollmentId)).toMatchObject({ status: 'queued' });
    expect(await failure(enrollmentId)).toBe('Connect a mailbox first');
  });

  it('counts a mailed letter toward the target\'s max touches', async () => {
    await setSetting(10, 1);
    await account.admin
      .from('outreach_setting')
      .update({ letter_monthly_cap: 5 })
      .eq('account_id', account.accountId)
      .throwOnError();
    const earlier = await enroll('lettered@target.test', 'sent');
    await account.admin
      .from('outreach_letter')
      .insert({
        account_id: account.accountId,
        enrollment_id: earlier,
        step_ordinal: 1,
        provider: 'lob',
        address_line1: '1 Main St',
        city: 'Springfield',
        state: 'IL',
        postal_code: '62701',
        status: 'mailed',
      })
      .throwOnError();
    await enroll('lettered@target.test');

    const result = await dispatchAccountOutreach({ accountId: account.accountId });

    expect(result.sent).toBe(0);
    expect(mailbox.sendAs).not.toHaveBeenCalled();
  });
});

describe('dispatchAccountOutreach for a locked team (integration)', () => {
  async function switchToTeam(): Promise<void> {
    const { data: team, error } = await account.admin.rpc('create_team_account', {
      account_name: `Outreach ${crypto.randomUUID().slice(0, 8)}`,
      user_id: account.userId,
    });
    if (error) {
      throw error;
    }
    account = { ...account, accountId: (team as { id: string }).id };
    await seedSequence();
  }

  async function setTrialEnd(offsetMs: number): Promise<void> {
    const { error } = await account.admin
      .from('accounts')
      .update({ trial_ends_at: new Date(Date.now() + offsetMs).toISOString() })
      .eq('id', account.accountId);
    if (error) {
      throw error;
    }
  }

  it('holds a locked team\'s sequence and resumes it once the lock lifts', async () => {
    await switchToTeam();
    await setSetting(10, 5);
    await enroll('held@target.test');
    await turnTeamBillingOn(account.admin);
    await setTrialEnd(-86_400_000);

    const whileLocked = await dispatchAccountOutreach({ accountId: account.accountId });

    expect(whileLocked.sent).toBe(0);
    expect(mailbox.sendAs).not.toHaveBeenCalled();

    await setTrialEnd(86_400_000);

    const afterUnlock = await dispatchAccountOutreach({ accountId: account.accountId });

    expect(afterUnlock.sent).toBe(1);
    const counts = await messagesFor(['held@target.test']);
    expect(counts['held@target.test']).toBe(1);
  });
});
