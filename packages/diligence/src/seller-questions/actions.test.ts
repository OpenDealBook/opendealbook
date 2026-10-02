import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const insertSpy = vi.fn();
  const updateSpy = vi.fn();
  const eqSpy = vi.fn();
  const inSpy = vi.fn();
  const triggerSpy = vi.fn();
  const permissionSpy = vi.fn();
  const state = { loiSigned: true };

  function singleFor(table: string): unknown {
    if (table === 'deal') {
      return { account_id: 'acct-1', owner_user_id: 'buyer-1' };
    }
    if (table === 'seller_question') {
      return { id: 'question-1', deal_id: 'deal-1' };
    }
    if (table === 'deal_participant') {
      return { user_id: 'seller-1' };
    }

    return { id: `${table}-1` };
  }

  function listFor(table: string): unknown[] {
    if (table === 'contract') {
      return state.loiSigned ? [{ id: 'contract-1' }] : [];
    }
    if (table === 'seller_question') {
      return [{ id: 'question-1' }, { id: 'question-2' }];
    }

    return [];
  }

  function makeBuilder(table: string) {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    let singleMode = false;

    builder.select = chain;
    builder.order = chain;
    builder.limit = chain;
    builder.throwOnError = chain;
    builder.single = () => {
      singleMode = true;
      return builder;
    };
    builder.insert = (payload: unknown) => {
      insertSpy(table, payload);
      return builder;
    };
    builder.update = (payload: unknown) => {
      updateSpy(table, payload);
      return builder;
    };
    builder.eq = (column: string, value: unknown) => {
      eqSpy(table, column, value);
      return builder;
    };
    builder.in = (column: string, values: unknown) => {
      inSpy(table, column, values);
      return builder;
    };
    builder.then = (resolve: (value: unknown) => void) =>
      resolve({
        data: singleMode ? singleFor(table) : listFor(table),
        error: null,
      });

    return builder;
  }

  const from = vi.fn((table: string) => makeBuilder(table));
  const rpc = vi.fn((name: string, args: unknown) => {
    permissionSpy(name, args);
    return Promise.resolve({ data: true, error: null });
  });
  const client = { from, rpc };

  return {
    insertSpy,
    updateSpy,
    eqSpy,
    inSpy,
    triggerSpy,
    permissionSpy,
    state,
    from,
    rpc,
    client,
  };
});

vi.mock('@odb/next/actions', () => ({
  enhanceAction: (fn: unknown) => fn,
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => mocks.client,
}));

vi.mock('@odb/notifications/server', () => ({
  createNovuClient: () => ({
    trigger: vi.fn(),
    subscribers: { identify: vi.fn() },
  }),
  triggerNotification: (deps: unknown, input: unknown) => {
    mocks.triggerSpy(input);
    return Promise.resolve(['email']);
  },
}));

import { answerSellerQuestion, poseSellerQuestion } from './actions';

type Action = (
  data: Record<string, unknown>,
  user?: Record<string, unknown>,
) => Promise<unknown>;

const runPose = poseSellerQuestion as unknown as Action;
const runAnswer = answerSellerQuestion as unknown as Action;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.loiSigned = true;
});

describe('poseSellerQuestion', () => {
  it('inserts the seller question against the deal account', async () => {
    await runPose(
      { dealId: 'deal-1', question: 'Explain the revenue dip in Q3.' },
      { id: 'analyst-1' },
    );

    const insert = mocks.insertSpy.mock.calls.find(
      ([table]) => table === 'seller_question',
    );

    expect(insert?.[1]).toMatchObject({
      account_id: 'acct-1',
      deal_id: 'deal-1',
      question: 'Explain the revenue dip in Q3.',
      asked_by: 'analyst-1',
    });
  });

  it('notifies the seller participant that a question was posed', async () => {
    await runPose(
      { dealId: 'deal-1', question: 'Explain the revenue dip in Q3.' },
      { id: 'analyst-1' },
    );

    expect(mocks.triggerSpy).toHaveBeenCalledTimes(1);
    expect(mocks.triggerSpy.mock.calls[0]?.[0]).toMatchObject({
      eventType: 'seller_question.posed',
      recipientUserId: 'seller-1',
    });
    expect(mocks.eqSpy).toHaveBeenCalledWith(
      'deal_participant',
      'party',
      'seller',
    );
  });

  it('is not gated on a signed LOI', async () => {
    mocks.state.loiSigned = false;

    await expect(
      runPose(
        { dealId: 'deal-1', question: 'Explain the revenue dip in Q3.' },
        { id: 'analyst-1' },
      ),
    ).resolves.toBeDefined();
  });
});

describe('answerSellerQuestion', () => {
  it('throws when no signed LOI exists on the deal', async () => {
    mocks.state.loiSigned = false;

    await expect(
      runAnswer({ questionId: 'question-1', answer: 'Here is the answer.' }),
    ).rejects.toThrow(/LOI/i);

    expect(mocks.updateSpy).not.toHaveBeenCalled();
    expect(mocks.triggerSpy).not.toHaveBeenCalled();
  });

  it('writes the answer and notifies the buyer when the LOI is signed', async () => {
    mocks.state.loiSigned = true;

    await runAnswer({ questionId: 'question-1', answer: 'Here is the answer.' });

    const update = mocks.updateSpy.mock.calls.find(
      ([table]) => table === 'seller_question',
    );
    expect(update?.[1]).toMatchObject({
      answer: 'Here is the answer.',
      status: 'received',
    });

    expect(mocks.triggerSpy).toHaveBeenCalledTimes(1);
    expect(mocks.triggerSpy.mock.calls[0]?.[0]).toMatchObject({
      eventType: 'seller_question.answered',
      recipientUserId: 'buyer-1',
    });

    expect(mocks.eqSpy).toHaveBeenCalledWith(
      'contract',
      'contract_version.is_signed',
      true,
    );
  });
});
