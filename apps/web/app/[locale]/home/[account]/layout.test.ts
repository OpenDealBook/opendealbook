import { describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-request-path': '/fr/home/acme/members?tab=open' }),
}));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect ${url}`);
  },
  notFound: () => {
    throw new Error('not found');
  },
}));

vi.mock('server-only', () => ({}));
vi.mock('@odb/lender-rooms/members/room-gate.ts', () => ({}));
vi.mock('../_lib/trial', () => ({}));
vi.mock('../_components/trial-banner', () => ({}));
vi.mock('next-intl/server', () => ({}));
vi.mock('@odb/notifications/components', () => ({}));

vi.mock('~/config/paths.config', () => ({
  default: { auth: { signIn: '/auth/sign-in' } },
}));
vi.mock('~/config/team-account-navigation.config', () => ({}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    rpc: async (name: string, args: { former_slug?: string }) =>
      name === 'team_account_workspace'
        ? { data: [] }
        : { data: args.former_slug === 'acme' ? 'initech-partners' : null },
  }),
}));

import { loadTeamWorkspace } from './layout';

describe('loadTeamWorkspace', () => {
  it('redirects a former slug to the same path and query under the current slug', async () => {
    await expect(loadTeamWorkspace('acme')).rejects.toThrow(
      'redirect /fr/home/initech-partners/members?tab=open',
    );
  });

  it('is not found when the slug is neither current nor former', async () => {
    await expect(loadTeamWorkspace('unknown')).rejects.toThrow('not found');
  });
});
