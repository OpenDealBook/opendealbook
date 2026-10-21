import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { AppPermission } from '@odb/policies';

vi.mock('@odb/supabase/hooks', () => ({ useSupabase: () => ({}) }));
vi.mock('../../server/invitations-actions', () => ({}));

import { teamInvitationsQueryKey } from '../../hooks/use-team-invitations';
import type { TeamInvitation } from '../../lib/types';
import { InvitationsList } from './invitations-list';

const pending: TeamInvitation = {
  id: 1,
  email: 'invitee@odb.test',
  role: 'member',
  expiresAt: '2030-01-01T00:00:00Z',
  createdAt: '2029-12-25T00:00:00Z',
};

function render(invitations: TeamInvitation[], permissions: AppPermission[]) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(teamInvitationsQueryKey('team-1'), invitations);

  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <InvitationsList accountId="team-1" permissions={permissions} />
    </QueryClientProvider>,
  );
}

describe('InvitationsList', () => {
  it('says there are no pending invitations when none are left', () => {
    expect(render([], ['invites.manage'])).toContain('No pending invitations');
  });

  it('offers copy, resend and revoke to someone who manages invites', () => {
    const html = render([pending], ['invites.manage']);

    expect(html).toContain('Copy link');
    expect(html).toContain('Resend');
    expect(html).toContain('Revoke');
  });

  it('shows a member the pending invite without any actions', () => {
    const html = render([pending], ['settings.manage']);

    expect(html).toContain('invitee@odb.test');
    expect(html).not.toContain('Copy link');
    expect(html).not.toContain('Resend');
    expect(html).not.toContain('Revoke');
  });
});
