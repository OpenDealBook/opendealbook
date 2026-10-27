import { describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() =>
  vi.fn(() => ({ throwOnError: async () => ({ data: true, error: null }) })),
);

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerAdminClient: () => ({ rpc }),
}));

import { POST } from './route';

describe('POST /api/unsubscribe', () => {
  it('opts the token out on a one-click unsubscribe with no page', async () => {
    const response = await POST(
      new Request('https://app.odb.test/api/unsubscribe?token=live-token', {
        method: 'POST',
        body: 'List-Unsubscribe=One-Click',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
      }),
    );

    expect(rpc).toHaveBeenCalledWith('unsubscribe_outreach', { p_token: 'live-token' });
    expect(response.status).toBe(200);
  });

  it('answers 400 without touching the database when the link has no token', async () => {
    rpc.mockClear();

    const response = await POST(
      new Request('https://app.odb.test/api/unsubscribe', { method: 'POST' }),
    );

    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});
