import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  provisionAccount,
  type IntegrationAccount,
} from '../../test-support/integration-harness';

import { failStaleSendingOutreachMessages } from './failStaleSending';

const MINUTE = 60_000;

let account: IntegrationAccount;
let sequenceId: string;

async function stage(status: 'sending' | 'sent', ageMinutes: number): Promise<string> {
  const { data: enrollment } = await account.admin
    .from('outreach_enrollment')
    .insert({
      account_id: account.accountId,
      sequence_id: sequenceId,
      target_email: `${crypto.randomUUID().slice(0, 8)}@target.test`,
      status: status === 'sent' ? 'sent' : 'queued',
    })
    .select('id')
    .single()
    .throwOnError();

  await account.admin
    .from('outreach_message')
    .insert({
      enrollment_id: enrollment.id,
      step_id: 1,
      to_email: 'owner@target.test',
      subject: 'Hello',
      body: 'Body',
      status,
      sent_at: new Date(Date.now() - ageMinutes * MINUTE).toISOString(),
    })
    .throwOnError();

  return enrollment.id as string;
}

async function statusesOf(enrollmentId: string) {
  const { data: message } = await account.admin
    .from('outreach_message')
    .select('status')
    .eq('enrollment_id', enrollmentId)
    .single()
    .throwOnError();
  const { data: enrollment } = await account.admin
    .from('outreach_enrollment')
    .select('status')
    .eq('id', enrollmentId)
    .single()
    .throwOnError();
  return { message: message.status, enrollment: enrollment.status };
}

beforeEach(async () => {
  account = await provisionAccount();
  const { data } = await account.admin
    .from('outreach_sequence')
    .insert({ account_id: account.accountId, name: 'Cold touch' })
    .select('id')
    .single()
    .throwOnError();
  sequenceId = data.id as string;
});

afterEach(async () => {
  await account.cleanup();
});

describe('failStaleSendingOutreachMessages (integration)', () => {
  it('fails sending messages older than 15 minutes with their enrollments and leaves the rest alone', async () => {
    const stale = await stage('sending', 16);
    const fresh = await stage('sending', 5);
    const sent = await stage('sent', 60);

    await failStaleSendingOutreachMessages();
    await failStaleSendingOutreachMessages();

    expect(await statusesOf(stale)).toEqual({ message: 'failed', enrollment: 'failed' });
    expect(await statusesOf(fresh)).toEqual({ message: 'sending', enrollment: 'queued' });
    expect(await statusesOf(sent)).toEqual({ message: 'sent', enrollment: 'sent' });
  });
});
