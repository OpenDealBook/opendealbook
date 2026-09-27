import { describe, expect, it, vi } from 'vitest';

vi.mock('@tuckin/next/actions', () => ({
  enhanceAction: (fn: unknown) => fn,
}));

const eq = vi.fn().mockResolvedValue({ error: null });
const update = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ update }));

vi.mock('@tuckin/supabase/server', () => ({
  getSupabaseServerClient: () => ({ from }),
}));

import { dismissNotification } from './dismiss-notification';

describe('dismissNotification', () => {
  it('updates the notification with dismissed true for the given id', async () => {
    await dismissNotification({ id: 42 });

    expect(from).toHaveBeenCalledWith('notifications');
    expect(update).toHaveBeenCalledWith({ dismissed: true });
    expect(eq).toHaveBeenCalledWith('id', 42);
  });
});
