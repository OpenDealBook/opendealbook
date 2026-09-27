import { describe, expect, it, vi } from 'vitest';

const rpc = vi.fn().mockResolvedValue({ error: null });

vi.mock('@tuckin/next/actions', () => ({
  enhanceAction: (fn: unknown) => fn,
}));

vi.mock('@tuckin/supabase/server', () => ({
  getSupabaseServerClient: () => ({ rpc }),
  getSupabaseServerAdminClient: () => ({ rpc }),
}));

import { inviteMembersAction } from './invitations-actions';

type Handler = (
  data: {
    slug: string;
    invitations: { email: string; role: string }[];
  },
  user: { id: string },
) => Promise<unknown>;

describe('inviteMembersAction', () => {
  it('calls add_invitations_to_account with the mapped invites', async () => {
    await (inviteMembersAction as unknown as Handler)(
      {
        slug: 'acme',
        invitations: [{ email: 'a@example.com', role: 'member' }],
      },
      { id: 'user-1' },
    );

    expect(rpc).toHaveBeenCalledWith('add_invitations_to_account', {
      account_slug: 'acme',
      invited_by: 'user-1',
      invites: [{ email: 'a@example.com', role: 'member' }],
    });
  });
});
