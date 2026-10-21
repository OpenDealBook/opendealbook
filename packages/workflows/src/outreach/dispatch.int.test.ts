import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { turnTeamBillingOn } from '@odb/supabase/test-support/team-billing';

import {
  provisionAccount,
  type IntegrationAccount,
} from '../../test-support/integration-harness';

const mailbox = vi.hoisted(() => ({
  sendAs: vi.fn(async () => ({ providerMessageId: 'mock-provider-message-id' })),
}));

vi.mock('@odb/mailbox', () => ({ sendAs: mailbox.sendAs }));

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

async function setSetting(dailyCap: number, maxTouches: number): Promise<void> {
  const { error } = await account.admin.from('outreach_setting').insert({
    account_id: account.accountId,
    daily_cap: dailyCap,
    max_touches: maxTouches,
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

beforeEach(async () => {
  mailbox.sendAs.mockClear();
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

  it('honors the suppression list', async () => {
    await setSetting(10, 5);
    await account.admin.from('outreach_suppression').insert({
      account_id: account.accountId,
      email: 'blocked@target.test',
      reason: 'opt_out',
    });

    await enroll('blocked@target.test');
    await enroll('allowed@target.test');

    const result = await dispatchAccountOutreach({ accountId: account.accountId });

    expect(result.sent).toBe(1);
    const counts = await messagesFor(['blocked@target.test', 'allowed@target.test']);
    expect(counts['blocked@target.test']).toBe(0);
    expect(counts['allowed@target.test']).toBe(1);
  });

  it('does not resend when a retry follows a crash after the provider accepted the email', async () => {
    await setSetting(10, 5);
    await enroll('once@target.test');
    mailbox.sendAs.mockImplementationOnce(async () => {
      database.reachable = false;
      return { providerMessageId: 'accepted-before-crash' };
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
    mailbox.sendAs.mockRejectedValueOnce(new Error('smtp down'));

    await dispatchAccountOutreach({ accountId: account.accountId });

    const { data } = await account.admin
      .from('outreach_message')
      .select('status, error')
      .eq('enrollment_id', enrollmentId)
      .single();
    expect(data).toEqual({ status: 'failed', error: 'smtp down' });
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
      return { providerMessageId: 'pm-started' };
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

  it('keeps a letter step out of the daily cap and queued', async () => {
    await setSetting(1, 5);
    await account.admin
      .from('outreach_step')
      .insert({
        account_id: account.accountId,
        sequence_id: sequenceId,
        ordinal: 2,
        channel: 'letter',
        body: 'Dear owner, a letter.',
      })
      .throwOnError();
    const letterEnrollment = await enroll('letter-first@target.test', 'queued', 2);
    await enroll('email-second@target.test');

    const result = await dispatchAccountOutreach({ accountId: account.accountId });

    expect(result.sent).toBe(1);
    expect(mailbox.sendAs).toHaveBeenCalledTimes(1);
    expect((await enrollment(letterEnrollment)).status).toBe('queued');
  });

  it('never sends a letter step', async () => {
    await setSetting(10, 5);
    await account.admin
      .from('outreach_step')
      .insert({
        account_id: account.accountId,
        sequence_id: sequenceId,
        ordinal: 2,
        channel: 'letter',
        body: 'Dear owner, a letter.',
      })
      .throwOnError();
    const enrollmentId = await enroll('letter@target.test', 'queued', 2);

    const result = await dispatchAccountOutreach({ accountId: account.accountId });

    expect(result.sent).toBe(0);
    expect(mailbox.sendAs).not.toHaveBeenCalled();
    const { data } = await account.admin
      .from('outreach_message')
      .select('id')
      .eq('enrollment_id', enrollmentId);
    expect(data).toEqual([]);
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
