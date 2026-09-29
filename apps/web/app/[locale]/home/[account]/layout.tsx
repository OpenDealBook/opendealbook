import type { ReactNode } from 'react';

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { getTranslations } from 'next-intl/server';

import { isAccountOwner, type Role } from '@odb/policies';
import { getSupabaseServerClient } from '@odb/supabase/server';

import pathsConfig from '~/config/paths.config';
import { getTeamAccountNavigationConfig } from '~/config/team-account-navigation.config';

import { TrialBanner } from '../_components/trial-banner';
import { loadTrialState } from '../_lib/trial';

interface TeamAccountLayoutProps {
  children: ReactNode;
  params: Promise<{ locale: string; account: string }>;
}

export async function loadTeamWorkspace(slug: string) {
  const client = getSupabaseServerClient();

  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    redirect(pathsConfig.auth.signIn);
  }

  const { data: workspaceRows } = await client.rpc('team_account_workspace', {
    account_slug: slug,
  });

  const workspace = workspaceRows?.[0];

  if (!workspace) {
    notFound();
  }

  const actorRole: Role = {
    name: workspace.role,
    hierarchyLevel: workspace.role_hierarchy_level,
  };

  return {
    user,
    team: { id: workspace.id, name: workspace.name, slug: workspace.slug },
    actorRole,
    permissions: workspace.permissions,
    isOwner: isAccountOwner(workspace.primary_owner_user_id, user.id),
    subscriptionStatus: workspace.subscription_status,
  };
}

async function loadTeamAccounts(userId: string) {
  const client = getSupabaseServerClient();

  const { data: memberships } = await client
    .from('accounts_memberships')
    .select('account_id')
    .eq('user_id', userId);

  const accountIds = (memberships ?? []).map((entry) => entry.account_id);

  const { data: teams } = await client
    .from('accounts')
    .select('id, name, slug')
    .eq('is_personal_account', false)
    .in('id', accountIds);

  return teams ?? [];
}

export default async function TeamAccountLayout({
  children,
  params,
}: TeamAccountLayoutProps) {
  const { locale, account } = await params;

  const t = await getTranslations({ locale });

  const { user, team } = await loadTeamWorkspace(account);
  const teams = await loadTeamAccounts(user.id);
  const navigation = getTeamAccountNavigationConfig(account);
  const trial = await loadTrialState(team.id);

  return (
    <div className={'flex min-h-screen'}>
      <aside className={'flex w-64 flex-col gap-6 border-r p-4'}>
        <section className={'flex flex-col gap-1'}>
          <span className={'text-muted-foreground text-xs uppercase'}>
            {team.name}
          </span>

          {teams.map((entry) => (
            <Link
              key={entry.id}
              href={`/home/${entry.slug}`}
              className={'rounded px-3 py-1.5 text-sm'}
            >
              {entry.name}
            </Link>
          ))}

          <Link
            href={'/home/create-team'}
            className={'rounded px-3 py-1.5 text-sm font-medium'}
          >
            Create team
          </Link>
        </section>

        <nav className={'flex flex-col gap-1'}>
          {navigation.map((item) => (
            <Link
              key={item.path}
              href={item.path}
              className={'rounded px-3 py-2 text-sm'}
            >
              {t(item.label)}
            </Link>
          ))}
        </nav>
      </aside>

      <main className={'flex flex-1 flex-col'}>
        <TrialBanner
          accountId={team.id}
          isActive={trial.isActive}
          endsAt={trial.endsAt}
          billingHref={`/home/${account}/billing`}
        />
        <div className={'flex-1'}>{children}</div>
      </main>
    </div>
  );
}
