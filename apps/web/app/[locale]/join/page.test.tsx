import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ signedIn: true }));
const liveTokens = vi.hoisted(() => new Set(['live-token']));

vi.mock('./_components/join-team', () => ({
  JoinTeam: (props: { token: string }) => `join-team:${props.token}`,
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
    auth: {
      getUser: async () => ({
        data: { user: session.signedIn ? { id: 'user-1' } : null },
      }),
    },
  }),
  getSupabaseServerAdminClient: () => ({
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return builder;
        },
        gt: () => builder,
        maybeSingle: () => builder,
        single: () => builder,
        throwOnError: () => builder,
        then: (resolve: (value: unknown) => unknown) =>
          resolve({
            data:
              table === 'accounts'
                ? { name: 'Morgan Reyes' }
                : liveTokens.has(filters.invite_token as string)
                  ? {
                      invited_by: 'inviter-1',
                      accounts: { name: 'Beacon Partners' },
                    }
                  : null,
            error: null,
          }),
      };
      return builder;
    },
  }),
}));

import JoinPage from './page';

const expiredMessage =
  'This invite has expired or was already used. Ask for a new one.';

async function render(token: string) {
  return renderToStaticMarkup(
    await JoinPage({ searchParams: Promise.resolve({ token }) }),
  );
}

describe('JoinPage', () => {
  beforeEach(() => {
    session.signedIn = true;
  });

  it('tells a signed-in user an expired or used invite cannot be accepted', async () => {
    const html = await render('dead-token');

    expect(html).toContain(expiredMessage);
    expect(html).not.toContain('join-team');
  });

  it('tells a signed-out visitor before asking them to sign in', async () => {
    session.signedIn = false;

    const html = await render('dead-token');

    expect(html).toContain(expiredMessage);
    expect(html).not.toContain('Sign in to continue');
  });

  it('offers to join when the invite is live', async () => {
    const html = await render('live-token');

    expect(html).toContain('join-team:live-token');
    expect(html).not.toContain(expiredMessage);
  });

  it('names the team and the inviter above the accept button', async () => {
    const html = await render('live-token');

    expect(html).toMatch(
      /Beacon Partners[\s\S]*Morgan Reyes[\s\S]*join-team:live-token/,
    );
  });

  it('names the team and the inviter before asking a visitor to sign in', async () => {
    session.signedIn = false;

    const html = await render('live-token');

    expect(html).toMatch(
      /Beacon Partners[\s\S]*Morgan Reyes[\s\S]*Sign in to continue/,
    );
  });
});
