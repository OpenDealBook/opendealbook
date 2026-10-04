import { afterEach, describe, expect, it, vi } from 'vitest';

import { notifyDealEvent } from './relay';

const state = vi.hoisted(() => ({
  client: null as unknown,
  novu: null as unknown,
  createNovuCalls: 0,
}));

vi.mock('@odb/supabase/admin', () => ({
  getSupabaseServerAdminClient: () => state.client,
}));

vi.mock('@odb/notifications/server', () => ({
  createNovuClient: () => {
    state.createNovuCalls += 1;
    return state.novu;
  },
  triggerNotification: (
    deps: { novu: { trigger: (id: string, args: unknown) => Promise<unknown> } },
    input: { eventType: string; recipientUserId: string; payload: unknown },
  ) => deps.novu.trigger(input.eventType, {
    to: { subscriberId: input.recipientUserId },
    payload: input.payload,
  }),
}));

function makeClient(members: string[], dealName: string | null) {
  return {
    from(table: string) {
      if (table === 'deal') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { description: dealName }, error: null }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: async () => ({
            data: members.map((user_id) => ({ user_id })),
            error: null,
          }),
        }),
      };
    },
  };
}

const input = {
  workflowId: 'deal.offer_submitted',
  dealId: 'deal-1',
  accountId: 'acct-1',
  actorRef: 'user-actor',
  eventType: 'offer.submitted',
};

afterEach(() => {
  vi.restoreAllMocks();
  state.client = null;
  state.novu = null;
  state.createNovuCalls = 0;
  delete process.env.NOVU_API_KEY;
  delete process.env.NOVU_API_URL;
});

describe('notifyDealEvent', () => {
  it('triggers the mapped Novu workflow for every account member with a deal payload', async () => {
    process.env.NOVU_API_KEY = 'secret';
    process.env.NOVU_API_URL = 'https://novu.test';
    const trigger = vi.fn().mockResolvedValue(undefined);
    state.novu = { trigger, subscribers: { identify: vi.fn() } };
    state.client = makeClient(['member-1', 'member-2'], 'Acme Tax');

    await notifyDealEvent(input);

    expect(trigger).toHaveBeenCalledTimes(2);
    expect(trigger).toHaveBeenCalledWith('deal.offer_submitted', {
      to: { subscriberId: 'member-1' },
      payload: {
        dealId: 'deal-1',
        dealName: 'Acme Tax',
        actor: 'user-actor',
        event: 'offer.submitted',
      },
    });
    expect(trigger).toHaveBeenCalledWith('deal.offer_submitted', {
      to: { subscriberId: 'member-2' },
      payload: {
        dealId: 'deal-1',
        dealName: 'Acme Tax',
        actor: 'user-actor',
        event: 'offer.submitted',
      },
    });
  });

  it('is a no-op that never builds a Novu client when Novu is not configured', async () => {
    state.client = makeClient(['member-1'], 'Acme Tax');

    await notifyDealEvent(input);

    expect(state.createNovuCalls).toBe(0);
  });

  it('does not break when a Novu trigger throws; it warns and continues to the next member', async () => {
    process.env.NOVU_API_KEY = 'secret';
    process.env.NOVU_API_URL = 'https://novu.test';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const trigger = vi
      .fn()
      .mockRejectedValueOnce(new Error('novu down'))
      .mockResolvedValueOnce(undefined);
    state.novu = { trigger, subscribers: { identify: vi.fn() } };
    state.client = makeClient(['member-1', 'member-2'], 'Acme Tax');

    await expect(notifyDealEvent(input)).resolves.toBeUndefined();

    expect(trigger).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalled();
  });
});
