import { describe, expect, it, vi } from 'vitest';

const personal = vi.hoisted(() => ({ onboarded: true }));
const accepted = vi.hoisted(() => [] as string[]);

vi.mock('@odb/team-accounts/schema', () => ({ acceptInvitationSchema: {} }));
vi.mock('@odb/team-accounts/server', () => ({
  acceptInvitationAction: async ({ token }: { token: string }) => {
    accepted.push(token);
    return { accountId: token === 'acme-token' ? 'team-1' : 'unknown' };
  },
}));
vi.mock('@odb/next/actions', () => ({
  enhanceAction:
    (fn: (input: unknown, user: { id: string }) => Promise<unknown>) =>
    (input: unknown) =>
      fn(input, { id: 'user-1' }),
}));

function accountsQuery(): unknown {
  const filters: Record<string, unknown> = {};
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      filters[column] = value;
      return builder;
    },
    single: () => builder,
    throwOnError: () => builder,
    then: (resolve: (value: unknown) => unknown) =>
      resolve({
        data:
          filters.id === 'team-1'
            ? { slug: 'acme' }
            : filters.primary_owner_user_id === 'user-1' &&
                filters.is_personal_account === true
              ? personal
              : null,
        error: null,
      }),
  };
  return builder;
}

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({ from: () => accountsQuery() }),
  getSupabaseServerAdminClient: () => ({
    from: () => {
      const filters: Record<string, unknown> = {};
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return builder;
        },
        gt: () => builder,
        maybeSingle: () => builder,
        throwOnError: () => builder,
        then: (resolve: (value: unknown) => unknown) =>
          resolve({
            data: filters.invite_token === 'acme-token' ? { id: 1 } : null,
            error: null,
          }),
      };
      return builder;
    },
  }),
}));

describe('joinTeamAction', () => {
  it("sends an onboarded user into the joined team's home", async () => {
    personal.onboarded = true;
    const { joinTeamAction } = await import('./join-team-action');

    await expect(joinTeamAction({ token: 'acme-token' })).resolves.toEqual({
      redirectTo: '/home/acme',
    });
  });

  it('sends a brand-new user to onboarding for the joined team', async () => {
    personal.onboarded = false;
    const { joinTeamAction } = await import('./join-team-action');

    await expect(joinTeamAction({ token: 'acme-token' })).resolves.toEqual({
      redirectTo: '/onboarding?team=acme',
    });
  });

  it('reports an invite used or expired since the page loaded, without joining', async () => {
    accepted.length = 0;
    const { joinTeamAction } = await import('./join-team-action');

    await expect(joinTeamAction({ token: 'spent-token' })).resolves.toEqual({
      expired: true,
    });
    expect(accepted).toEqual([]);
  });
});
