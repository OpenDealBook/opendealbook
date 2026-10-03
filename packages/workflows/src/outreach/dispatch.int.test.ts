import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  provisionAccount,
  type IntegrationAccount,
} from '../../test-support/integration-harness';

const mailbox = vi.hoisted(() => ({
  sendAs: vi.fn(async () => ({ providerMessageId: 'mock-provider-message-id' })),
}));

vi.mock('@odb/mailbox', () => ({ sendAs: mailbox.sendAs }));

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

async function enroll(targetEmail: string, status = 'queued'): Promise<string> {
  const { data, error } = await account.admin
    .from('outreach_enrollment')
    .insert({
      account_id: account.accountId,
      sequence_id: sequenceId,
      target_email: targetEmail,
      status,
      current_step: 1,
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
  const ids = (enrollments ?? []).map((row) => row.id as string);
  const { data } = await account.admin
    .from('outreach_message')
    .select('to_email, status')
    .in('enrollment_id', ids);
  const counts: Record<string, number> = {};
  for (const email of emails) {
    counts[email] = (data ?? []).filter(
      (row) => row.to_email === email && row.status === 'sent',
    ).length;
  }
  return counts;
}

beforeEach(async () => {
  mailbox.sendAs.mockClear();
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
});
