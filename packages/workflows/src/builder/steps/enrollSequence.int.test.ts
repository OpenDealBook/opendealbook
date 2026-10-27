import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { provisionAccount, type IntegrationAccount } from '../../../test-support/integration-harness';
import { enrollSequence } from './enrollSequence';

let owner: IntegrationAccount;
let sequenceId: string;

async function firmWithContact(name: string, email: string): Promise<string> {
  const { data: firm } = await owner.admin
    .from('firm')
    .insert({ account_id: owner.accountId, name })
    .select('id')
    .single()
    .throwOnError();
  await owner.admin
    .from('contact')
    .insert({ account_id: owner.accountId, firm_id: firm.id, name: `${name} Owner`, email })
    .throwOnError();
  return firm.id;
}

async function approve(firmId: string): Promise<string> {
  const { data: verdict } = await owner.admin
    .from('firm_verdict')
    .insert({ account_id: owner.accountId, firm_id: firmId, fit: true, reasons: ['fits'], model: 'test' })
    .select('id')
    .single()
    .throwOnError();
  await owner.admin
    .from('firm_verdict_approval')
    .insert({ verdict_id: verdict.id, account_id: owner.accountId, approved_by: owner.userId })
    .throwOnError();
  return verdict.id;
}

function enroll(firmId: string, idempotencyKey: string, sequence = sequenceId) {
  return enrollSequence.execute({
    context: { accountId: owner.accountId, runId: crypto.randomUUID(), idempotencyKey },
    config: { firmId, sequenceId: sequence },
    input: {},
  });
}

async function enrollmentsOf(firmId: string) {
  const { data } = await owner.admin
    .from('outreach_enrollment')
    .select('id, sequence_id, target_email, status, current_step')
    .eq('firm_id', firmId)
    .order('created_at')
    .throwOnError();
  return data;
}

beforeAll(async () => {
  owner = await provisionAccount();
  const { data: sequence } = await owner.admin
    .from('outreach_sequence')
    .insert({ account_id: owner.accountId, name: 'Cold touch' })
    .select('id')
    .single()
    .throwOnError();
  sequenceId = sequence.id;
});

afterAll(async () => {
  await owner.admin.from('accounts').delete().eq('id', owner.accountId);
  await owner.cleanup();
});

describe('enroll_sequence', () => {
  it('queues an approved firm in the sequence at its contact email', async () => {
    const firmId = await firmWithContact('Approved Plumbing', 'owner@approved.test');
    await approve(firmId);

    const { enrollmentId } = await enroll(firmId, 'run-a:seq:0');

    expect(await enrollmentsOf(firmId)).toEqual([
      {
        id: enrollmentId,
        sequence_id: sequenceId,
        target_email: 'owner@approved.test',
        status: 'queued',
        current_step: 1,
      },
    ]);
  });

  it('holds an unapproved firm until a deal manager approves it', async () => {
    const firmId = await firmWithContact('Waiting Roofing', 'owner@waiting.test');

    const { enrollmentId } = await enroll(firmId, 'run-b:seq:0');

    expect(await enrollmentsOf(firmId)).toMatchObject([{ id: enrollmentId, status: 'held' }]);
  });

  it('enrolls once when the step runs again with the same key', async () => {
    const firmId = await firmWithContact('Twice Electric', 'owner@twice.test');
    await approve(firmId);

    const first = await enroll(firmId, 'run-c:seq:0');
    const second = await enroll(firmId, 'run-c:seq:0');

    expect(second).toEqual(first);
    expect(await enrollmentsOf(firmId)).toHaveLength(1);
  });

  it('fails at once when the firm has no email contact', async () => {
    const { data: firm } = await owner.admin
      .from('firm')
      .insert({ account_id: owner.accountId, name: 'Silent Masonry' })
      .select('id')
      .single()
      .throwOnError();
    await owner.admin
      .from('contact')
      .insert({ account_id: owner.accountId, firm_id: firm.id, name: 'No Email Owner' })
      .throwOnError();

    await expect(enroll(firm.id, 'run-d:seq:0')).rejects.toMatchObject({
      message: 'This firm has no email',
      nonRetryable: true,
    });
    expect(await enrollmentsOf(firm.id)).toEqual([]);
  });

  it("fails when the firm's approval was revoked", async () => {
    const firmId = await firmWithContact('Revoked Hvac', 'owner@revoked.test');
    const verdictId = await approve(firmId);
    await owner.admin
      .from('firm_verdict_revocation')
      .insert({ verdict_id: verdictId, account_id: owner.accountId, revoked_by: owner.userId, reason: 'sold already' })
      .throwOnError();

    await expect(enroll(firmId, 'run-e:seq:0')).rejects.toMatchObject({
      message: "This firm's approval was revoked.",
      nonRetryable: true,
    });
    expect(await enrollmentsOf(firmId)).toEqual([]);
  });

  it('returns the existing enrollment when the firm is already in the sequence', async () => {
    const firmId = await firmWithContact('Again Landscaping', 'owner@again.test');
    await approve(firmId);

    const first = await enroll(firmId, 'run-f:seq:0');
    const second = await enroll(firmId, 'run-g:seq:0');

    expect(second).toEqual(first);
    expect(await enrollmentsOf(firmId)).toHaveLength(1);
  });

  it('refuses a sequence that is turned off', async () => {
    const firmId = await firmWithContact('Off Painting', 'owner@off.test');
    await approve(firmId);
    const { data: off } = await owner.admin
      .from('outreach_sequence')
      .insert({ account_id: owner.accountId, name: 'Paused', enabled: false })
      .select('id')
      .single()
      .throwOnError();

    await expect(enroll(firmId, 'run-h:seq:0', off.id)).rejects.toMatchObject({
      message: 'This sequence is turned off',
      nonRetryable: true,
    });
    expect(await enrollmentsOf(firmId)).toEqual([]);
  });

  it("enrolls the firm's oldest contact with an email", async () => {
    const firmId = await firmWithContact('Elder Glazing', 'first@elder.test');
    await owner.admin
      .from('contact')
      .insert({ account_id: owner.accountId, firm_id: firmId, name: 'Later Owner', email: 'later@elder.test' })
      .throwOnError();
    await owner.admin
      .from('contact')
      .update({ phone: '555-0100' })
      .eq('email', 'first@elder.test')
      .throwOnError();
    await approve(firmId);

    await enroll(firmId, 'run-m:seq:0');

    expect(await enrollmentsOf(firmId)).toMatchObject([{ target_email: 'first@elder.test' }]);
  });

  it('starts a new enrollment when the earlier one was stopped', async () => {
    const firmId = await firmWithContact('Restarted Fencing', 'owner@restarted.test');
    await approve(firmId);
    const first = await enroll(firmId, 'run-i:seq:0');
    await owner.admin.from('outreach_enrollment').update({ status: 'stopped' }).eq('id', first.enrollmentId).throwOnError();

    const second = await enroll(firmId, 'run-i:seq:0');

    expect(second.enrollmentId).not.toBe(first.enrollmentId);
    expect(await enrollmentsOf(firmId)).toMatchObject([
      { id: first.enrollmentId, status: 'stopped' },
      { id: second.enrollmentId, status: 'queued' },
    ]);
  });

  it('enrolls a firm once when two runs enroll it at the same time', async () => {
    const firmId = await firmWithContact('Racing Tile', 'owner@racing.test');
    await approve(firmId);

    const [first, second] = await Promise.all([enroll(firmId, 'run-j:seq:0'), enroll(firmId, 'run-k:seq:0')]);

    expect(second).toEqual(first);
    expect(await enrollmentsOf(firmId)).toHaveLength(1);
  });

  it.each([
    ['another team', async () => (await otherTeamSequence())],
    ['nowhere', async () => crypto.randomUUID()],
    ['not an id', async () => 'default-letter-email-email'],
  ])('refuses a sequence from %s', async (_where, sequence) => {
    const firmId = await firmWithContact(`Lost Sequence ${crypto.randomUUID().slice(0, 6)}`, 'owner@lost.test');

    await expect(enroll(firmId, `run-l:${crypto.randomUUID()}`, await sequence())).rejects.toMatchObject({
      message: 'That sequence is not on this team',
      nonRetryable: true,
    });
  });
});

let other: IntegrationAccount | undefined;

async function otherTeamSequence(): Promise<string> {
  other ??= await provisionAccount();
  const { data } = await other.admin
    .from('outreach_sequence')
    .insert({ account_id: other.accountId, name: 'Theirs' })
    .select('id')
    .single()
    .throwOnError();
  return data.id;
}

afterAll(async () => {
  if (other) {
    await other.admin.from('accounts').delete().eq('id', other.accountId);
    await other.cleanup();
  }
});
