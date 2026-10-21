import type { ReactNode } from 'react';

import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { getTranslations } from 'next-intl/server';

import { hasLenderRooms } from '@odb/lender-rooms/members/room-gate.ts';
import { NotificationsPopover } from '@odb/notifications/components';
import { isAccountOwner, type Role } from '@odb/policies';
import { getSupabaseServerClient } from '@odb/supabase/server';
import { rememberLastTeam } from '@odb/team-accounts/last-team';

import pathsConfig from '~/config/paths.config';
import { teamNavigationFor } from '~/config/team-account-navigation.config';

import { AccountDropdown } from '../(user)/_components/account-dropdown';
import { BillingBanner } from '../_components/billing-banner';
import { TeamMenuButton, TeamSidebar } from '../_components/team-sidebar';
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
    const { data: currentSlug } = await client.rpc(
      'team_account_current_slug',
      { former_slug: slug },
    );

    if (!currentSlug) {
      notFound();
    }

    const requestPath = (await headers()).get('x-request-path')!;

    redirect(requestPath.replace(`/home/${slug}`, `/home/${currentSlug}`));
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

  const { user, team, permissions } = await loadTeamWorkspace(account);
  await rememberLastTeam(getSupabaseServerClient(), user.id, team.id);
  const teams = await loadTeamAccounts(user.id);
  const navigation = teamNavigationFor(account, permissions);
  const trial = await loadTrialState(team.id);
  const { data: standing } = await getSupabaseServerClient()
    .rpc('team_billing_standing', { target_account_id: team.id })
    .throwOnError();

  const showLenderRooms = await hasLenderRooms(getSupabaseServerClient());

  const linksIn = (group: 'work' | 'settings') =>
    navigation
      .filter((item) => item.group === group)
      .map((item) => ({ label: t(item.label), path: item.path }));

  const groups = [
    {
      heading: t('common.work'),
      links: [
        ...linksIn('work'),
        ...(showLenderRooms
          ? [{ label: t('common.lenderRooms'), path: '/lender' }]
          : []),
      ],
    },
    {
      heading: t('account.settings'),
      links: linksIn('settings'),
    },
  ];

  return (
    <div className={'flex min-h-screen'}>
      <TeamSidebar team={team} teams={teams} groups={groups} />

      <main className={'flex min-w-0 flex-1 flex-col'}>
        <header
          className={'flex items-center gap-2 border-b px-4 py-3 lg:px-6'}
        >
          <TeamMenuButton team={team} teams={teams} groups={groups} />
          <div className={'ml-auto flex items-center gap-2'}>
            <NotificationsPopover accountId={team.id} />
            <AccountDropdown email={user.email!} />
          </div>
        </header>
        {standing === 'good' ? (
          <TrialBanner
            isActive={trial.isActive}
            endsAt={trial.endsAt}
            billingHref={`/home/${account}/billing`}
          />
        ) : (
          <BillingBanner
            standing={standing}
            canManageBilling={permissions.includes('billing.manage')}
            billingHref={`/home/${account}/billing`}
          />
        )}
        <div id={'main-content'} tabIndex={-1} className={'flex-1'}>
          {children}
        </div>
      </main>
    </div>
  );
}
