import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  provisionAccount,
  type IntegrationAccount,
} from '../../test-support/integration-harness';

let account: IntegrationAccount;
let other: IntegrationAccount;

async function enroll(owner: IntegrationAccount, targetEmail: string, status: string) {
  const { data: sequence } = await owner.admin
    .from('outreach_sequence')
    .insert({ account_id: owner.accountId, name: 'Cold touch' })
    .select('id')
    .single()
    .throwOnError();
  const { data } = await owner.admin
    .from('outreach_enrollment')
    .insert({
      account_id: owner.accountId,
      sequence_id: sequence.id,
      target_email: targetEmail,
      status,
    })
    .select('id, unsubscribe_token')
    .single()
    .throwOnError();
  return data as { id: string; unsubscribe_token: string };
}

async function statusOf(owner: IntegrationAccount, id: string) {
  const { data } = await owner.admin
    .from('outreach_enrollment')
    .select('status')
    .eq('id', id)
    .single()
    .throwOnError();
  return data.status as string;
}

async function suppressions(owner: IntegrationAccount) {
  const { data } = await owner.admin
    .from('outreach_suppression')
    .select('email, reason')
    .eq('account_id', owner.accountId)
    .throwOnError();
  return data;
}

beforeEach(async () => {
  account = await provisionAccount();
  other = await provisionAccount();
});

afterEach(async () => {
  await account.cleanup();
  await other.cleanup();
});

describe('unsubscribe_outreach (integration)', () => {
  it('opts the address out of the team and stops its live enrollments', async () => {
    const clicked = await enroll(account, 'owner@target.test', 'queued');
    const held = await enroll(account, 'owner@target.test', 'held');
    const finished = await enroll(account, 'owner@target.test', 'sent');
    const otherTeam = await enroll(other, 'owner@target.test', 'queued');

    const { data } = await account.admin
      .rpc('unsubscribe_outreach', { p_token: clicked.unsubscribe_token })
      .throwOnError();

    expect(data).toBe(true);
    expect(await suppressions(account)).toEqual([{ email: 'owner@target.test', reason: 'opt_out' }]);
    expect(await statusOf(account, clicked.id)).toBe('suppressed');
    expect(await statusOf(account, held.id)).toBe('suppressed');
    expect(await statusOf(account, finished.id)).toBe('suppressed');
    expect(await statusOf(other, otherTeam.id)).toBe('queued');
    expect(await suppressions(other)).toEqual([]);
  });

  it('records one opt-out when the link is clicked twice', async () => {
    const clicked = await enroll(account, 'twice@target.test', 'queued');

    await account.admin.rpc('unsubscribe_outreach', { p_token: clicked.unsubscribe_token }).throwOnError();
    await account.admin.rpc('unsubscribe_outreach', { p_token: clicked.unsubscribe_token }).throwOnError();

    expect(await suppressions(account)).toEqual([{ email: 'twice@target.test', reason: 'opt_out' }]);
  });

  it('answers false for a token that matches no enrollment', async () => {
    const { data } = await account.admin
      .rpc('unsubscribe_outreach', { p_token: 'not-a-real-token' })
      .throwOnError();

    expect(data).toBe(false);
  });
});
