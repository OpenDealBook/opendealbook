import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  appendDealEvent,
  provisionAccount,
  seedDeal,
  seedSignedLoi,
  type IntegrationAccount,
} from '../../test-support/integration-harness';

const harness = vi.hoisted(() => ({
  client: null as unknown,
  triggerNotification: vi.fn(async () => ['email']),
  createNovuClient: vi.fn(() => ({})),
}));

vi.mock('@odb/next/actions', () => ({
  enhanceAction: (fn: unknown) => fn,
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => harness.client,
}));

vi.mock('@odb/notifications/server', () => ({
  createNovuClient: harness.createNovuClient,
  triggerNotification: harness.triggerNotification,
}));

import { answerSellerQuestion, poseSellerQuestion } from './actions';

type Action = (
  data: Record<string, unknown>,
  user?: Record<string, unknown>,
) => Promise<{ id: string }>;

const runPose = poseSellerQuestion as unknown as Action;
const runAnswer = answerSellerQuestion as unknown as Action;

let account: IntegrationAccount;

async function addSellerParticipant(dealId: string): Promise<void> {
  const participantId = crypto.randomUUID();
  await appendDealEvent(account.admin, {
    dealId,
    aggregateType: 'deal_participant',
    aggregateId: participantId,
    eventType: 'deal_participant.added',
    payload: { user_id: account.userId, party: 'seller', role: 'seller' },
  });
}

beforeEach(async () => {
  harness.triggerNotification.mockClear();
  account = await provisionAccount();
  harness.client = account.user;
});

afterEach(async () => {
  await account.cleanup();
});

describe('poseSellerQuestion (integration)', () => {
  it('inserts a seller_question row and notifies the seller participant', async () => {
    const dealId = await seedDeal(
      account.admin,
      account.accountId,
      account.userId,
      { description: 'Gate deal' },
    );
    await addSellerParticipant(dealId);

    const posed = await runPose(
      { dealId, question: 'Explain the revenue dip in Q3.' },
      { id: account.userId },
    );

    const { data: row } = await account.admin
      .from('seller_question')
      .select('question, asked_by, answer, status, account_id')
      .eq('id', posed.id)
      .single();

    expect(row).toMatchObject({
      question: 'Explain the revenue dip in Q3.',
      asked_by: account.userId,
      answer: null,
      status: 'not_started',
      account_id: account.accountId,
    });

    expect(harness.triggerNotification).toHaveBeenCalledTimes(1);
    expect(harness.triggerNotification.mock.calls[0]?.[1]).toMatchObject({
      eventType: 'seller_question.posed',
    });
  });
});

describe('answerSellerQuestion signed-LOI gate (integration)', () => {
  it('blocks the answer until the deal has a signed LOI, then writes it', async () => {
    const dealId = await seedDeal(
      account.admin,
      account.accountId,
      account.userId,
      { description: 'Answer deal' },
    );
    await addSellerParticipant(dealId);

    const posed = await runPose(
      { dealId, question: 'Share the customer concentration.' },
      { id: account.userId },
    );
    harness.triggerNotification.mockClear();

    await expect(
      runAnswer({ questionId: posed.id, answer: 'Top client is 12%.' }),
    ).rejects.toThrow(/LOI/i);

    const { data: blocked } = await account.admin
      .from('seller_question')
      .select('answer, answered_at, status')
      .eq('id', posed.id)
      .single();
    expect(blocked).toMatchObject({
      answer: null,
      answered_at: null,
      status: 'not_started',
    });
    expect(harness.triggerNotification).not.toHaveBeenCalled();

    await seedSignedLoi(account.admin, account.accountId, dealId);

    const answered = await runAnswer({
      questionId: posed.id,
      answer: 'Top client is 12%.',
    });
    expect(answered.id).toBe(posed.id);

    const { data: resolved } = await account.admin
      .from('seller_question')
      .select('answer, answered_at, status')
      .eq('id', posed.id)
      .single();
    expect(resolved?.answer).toBe('Top client is 12%.');
    expect(resolved?.status).toBe('received');
    expect(resolved?.answered_at).not.toBeNull();

    expect(harness.triggerNotification).toHaveBeenCalledTimes(1);
    expect(harness.triggerNotification.mock.calls[0]?.[1]).toMatchObject({
      eventType: 'seller_question.answered',
    });
  });
});
