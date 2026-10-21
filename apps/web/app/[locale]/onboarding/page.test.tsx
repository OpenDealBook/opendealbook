import type { ReactElement } from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  memberSlugs: [] as string[],
  ownedTeam: null as { id: string; slug: string } | null,
  joinedNotOwned: [] as { slug: string }[],
  onboarded: false,
  landing: { kind: 'pick', teams: [] } as
    | { kind: 'go'; path: string }
    | { kind: 'pick'; teams: [] },
}));

vi.mock('../home/_lib/team-landing', () => ({
  resolveTeamLanding: async () => db.landing,
}));

vi.mock('./_components/onboarding-container', () => ({
  OnboardingContainer: () => null,
}));
vi.mock('./_lib/complete-onboarding-action', () => ({
  completeOnboardingAction: async () => ({ redirectTo: '/' }),
}));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
  notFound: () => {
    throw new Error('not-found');
  },
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: () => {
      const filters: Record<string, unknown> = {};
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return builder;
        },
        neq: (column: string, value: unknown) => {
          filters[`not.${column}`] = value;
          return builder;
        },
        single: () => builder,
        maybeSingle: () => builder,
        throwOnError: () => builder,
        then: (resolve: (value: unknown) => unknown) =>
          resolve({
            data:
              filters.is_personal_account === true
                ? { onboarded: db.onboarded }
                : filters['not.primary_owner_user_id'] === 'user-1'
                  ? db.joinedNotOwned
                  : 'slug' in filters
                    ? db.memberSlugs.includes(filters.slug as string)
                      ? { id: `id-${filters.slug}`, slug: filters.slug }
                      : null
                    : db.ownedTeam,
            error: null,
          }),
      };
      return builder;
    },
  }),
}));

import OnboardingPage from './page';

async function flowFor(searchParams: { team?: string }) {
  const element = (await OnboardingPage({
    params: Promise.resolve({ locale: 'en' }),
    searchParams: Promise.resolve(searchParams),
  })) as ReactElement<{ flow: unknown }>;
  return element.props.flow;
}

describe('OnboardingPage', () => {
  beforeEach(() => {
    db.memberSlugs = [];
    db.ownedTeam = null;
    db.joinedNotOwned = [];
    db.onboarded = false;
    db.landing = { kind: 'pick', teams: [] };
  });

  it('sends an onboarded person to their team landing', async () => {
    db.onboarded = true;
    db.landing = { kind: 'go', path: '/home/acme' };

    await expect(flowFor({})).rejects.toThrow('redirect:/home/acme');
  });

  it('sends an onboarded person with several teams and none remembered to the team picker', async () => {
    db.onboarded = true;

    await expect(flowFor({})).rejects.toThrow('redirect:/home');
  });

  it('runs the invitee flow for a team the user was invited into', async () => {
    db.memberSlugs = ['globex'];

    expect(await flowFor({ team: 'globex' })).toEqual({
      kind: 'invitee',
      teamSlug: 'globex',
    });
  });

  it('runs the buyer flow without an invite, even when a failed attempt left the user owning a team', async () => {
    db.ownedTeam = { id: 'team-old', slug: 'acme' };

    expect(await flowFor({})).toEqual({ kind: 'buyer' });
  });

  it('resumes the invitee flow when the invite link is gone and the user joined exactly one team they do not own', async () => {
    db.joinedNotOwned = [{ slug: 'globex' }];

    await expect(flowFor({})).rejects.toThrow(
      'redirect:/onboarding?team=globex',
    );
  });

  it('runs the buyer flow when the user joined several teams they do not own', async () => {
    db.joinedNotOwned = [{ slug: 'globex' }, { slug: 'initech' }];

    expect(await flowFor({})).toEqual({ kind: 'buyer' });
  });

  it('refuses a team the user is not a member of', async () => {
    await expect(flowFor({ team: 'globex' })).rejects.toThrow('not-found');
  });
});
