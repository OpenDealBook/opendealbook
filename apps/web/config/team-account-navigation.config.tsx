import featureFlagsConfig from './feature-flags.config';

export interface TeamNavigationItem {
  group: 'work' | 'settings';
  label: string;
  path: string;
  requires?: string;
}

export function getTeamAccountNavigationConfig(
  slug: string,
): TeamNavigationItem[] {
  const prefix = `/home/${slug}`;

  return [
    { group: 'work', label: 'common.home', path: prefix },
    { group: 'work', label: 'common.todos', path: `${prefix}/todos` },
    { group: 'work', label: 'common.deals', path: `${prefix}/deals` },
    {
      group: 'work',
      label: 'common.lenders',
      path: `${prefix}/lenders`,
      requires: 'deals.manage',
    },
    { group: 'work', label: 'common.outreach', path: `${prefix}/outreach` },
    { group: 'work', label: 'common.reports', path: `${prefix}/reports` },
    {
      group: 'settings',
      label: 'account.dealBox',
      path: `${prefix}/underwriting`,
    },
    { group: 'settings', label: 'account.members', path: `${prefix}/members` },
    {
      group: 'settings',
      label: 'account.teamSettings',
      path: `${prefix}/settings`,
    },
    ...(featureFlagsConfig.enableBilling
      ? [
          {
            group: 'settings' as const,
            label: 'billing.title',
            path: `${prefix}/billing`,
          },
        ]
      : []),
    {
      group: 'settings',
      label: 'account.lenderSettings',
      path: `${prefix}/settings/lenders`,
      requires: 'deals.manage',
    },
    {
      group: 'settings',
      label: 'account.contractReview',
      path: `${prefix}/settings/contract-review`,
      requires: 'deals.manage',
    },
    {
      group: 'settings',
      label: 'account.templates',
      path: `${prefix}/settings/templates`,
    },
    {
      group: 'settings',
      label: 'account.checklists',
      path: `${prefix}/settings/checklists`,
    },
    {
      group: 'settings',
      label: 'account.buyerProfile',
      path: `${prefix}/settings/buyer-profile`,
    },
    {
      group: 'settings',
      label: 'account.dealCalcDefaults',
      path: `${prefix}/settings/deal-calc`,
    },
    {
      group: 'settings',
      label: 'common.compsImport',
      path: `${prefix}/comps/import`,
    },
    {
      group: 'settings',
      label: 'account.apiKeys',
      path: `${prefix}/settings/api-keys`,
      requires: 'api_keys.manage',
    },
  ];
}

export function teamNavigationFor(
  slug: string,
  permissions: readonly string[],
): TeamNavigationItem[] {
  return getTeamAccountNavigationConfig(slug).filter(
    (item) =>
      item.requires === undefined || permissions.includes(item.requires),
  );
}
