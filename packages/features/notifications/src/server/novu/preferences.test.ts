import { describe, expect, it, vi } from 'vitest';

import type { Database } from '@odb/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

import { resolveNovuChannels } from './preferences';

function stubClient(rows: { channel: string; enabled: boolean }[]) {
  const eq = vi.fn();
  const select = vi.fn();
  const builder = {
    select,
    eq,
    then: (resolve: (value: unknown) => unknown) =>
      resolve({ data: rows, error: null }),
  };
  select.mockReturnValue(builder);
  eq.mockReturnValue(builder);
  const from = vi.fn().mockReturnValue(builder);

  return {
    client: { from } as unknown as SupabaseClient<Database>,
    from,
    eq,
  };
}

describe('resolveNovuChannels', () => {
  it('returns email when no preference row disables it', async () => {
    const { client } = stubClient([]);

    const channels = await resolveNovuChannels(
      client,
      'user-1',
      'loi.countersigned',
    );

    expect(channels).toEqual(['email']);
  });

  it('omits email when a preference row disables that channel', async () => {
    const { client } = stubClient([{ channel: 'email', enabled: false }]);

    const channels = await resolveNovuChannels(
      client,
      'user-1',
      'loi.countersigned',
    );

    expect(channels).toEqual([]);
  });

  it('reads the recipient and event_type from notification_preference', async () => {
    const { client, from, eq } = stubClient([]);

    await resolveNovuChannels(client, 'user-1', 'loi.countersigned');

    expect(from).toHaveBeenCalledWith('notification_preference');
    expect(eq).toHaveBeenCalledWith('recipient_user_id', 'user-1');
    expect(eq).toHaveBeenCalledWith('event_type', 'loi.countersigned');
  });
});
