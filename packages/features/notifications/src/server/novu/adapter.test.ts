import { describe, expect, it, vi } from 'vitest';

import type { Database } from '@odb/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { NovuClient } from './adapter';
import { syncNovuSubscriber, triggerNotification } from './adapter';

function stubSupabase(rows: { channel: string; enabled: boolean }[]) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    then: (resolve: (value: unknown) => unknown) =>
      resolve({ data: rows, error: null }),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);

  return {
    from: vi.fn().mockReturnValue(builder),
  } as unknown as SupabaseClient<Database>;
}

function stubNovu(): NovuClient {
  return {
    trigger: vi.fn().mockResolvedValue(undefined),
    subscribers: {
      identify: vi.fn().mockResolvedValue(undefined),
    },
  };
}

describe('triggerNotification', () => {
  it('triggers the workflow for the subscriber with the payload', async () => {
    const novu = stubNovu();
    const client = stubSupabase([]);

    const channels = await triggerNotification(
      { novu, client },
      {
        eventType: 'loi.countersigned',
        recipientUserId: 'user-1',
        payload: { dealName: 'Acme' },
      },
    );

    expect(novu.trigger).toHaveBeenCalledWith('loi.countersigned', {
      to: { subscriberId: 'user-1' },
      payload: { dealName: 'Acme' },
    });
    expect(channels).toEqual(['email']);
  });

  it('does not trigger when the recipient has disabled email', async () => {
    const novu = stubNovu();
    const client = stubSupabase([{ channel: 'email', enabled: false }]);

    const channels = await triggerNotification(
      { novu, client },
      {
        eventType: 'loi.countersigned',
        recipientUserId: 'user-1',
        payload: { dealName: 'Acme' },
      },
    );

    expect(novu.trigger).not.toHaveBeenCalled();
    expect(channels).toEqual([]);
  });
});

describe('syncNovuSubscriber', () => {
  it('identifies the subscriber by the supabase user id', async () => {
    const novu = stubNovu();

    await syncNovuSubscriber(novu, {
      id: 'user-1',
      email: 'a@b.co',
      firstName: 'Ada',
      lastName: 'Lovelace',
    });

    expect(novu.subscribers.identify).toHaveBeenCalledWith('user-1', {
      email: 'a@b.co',
      firstName: 'Ada',
      lastName: 'Lovelace',
    });
  });
});
