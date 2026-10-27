import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() =>
  vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
);

vi.mock('next/navigation', () => ({ redirect }));
vi.mock('next-intl/server', () => ({ getLocale: async () => 'fr' }));
vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerAdminClient: () => ({ rpc }),
}));

import { unsubscribe } from './actions';

function answers(unsubscribed: boolean) {
  rpc.mockReturnValue({ throwOnError: async () => ({ data: unsubscribed, error: null }) });
}

describe('unsubscribe', () => {
  beforeEach(() => rpc.mockReset());

  it('opts the token out and shows the confirmation in the visitor\'s locale', async () => {
    answers(true);

    await expect(unsubscribe('live-token')).rejects.toThrow('redirect:/fr/unsubscribe?status=done');
    expect(rpc).toHaveBeenCalledWith('unsubscribe_outreach', { p_token: 'live-token' });
  });

  it('shows the invalid link message when the token matches nothing', async () => {
    answers(false);

    await expect(unsubscribe('dead-token')).rejects.toThrow('redirect:/fr/unsubscribe?status=invalid');
  });
});
