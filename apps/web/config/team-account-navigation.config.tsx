import type { NavigationItem } from '~/config/personal-account-navigation.config';

export function getTeamAccountNavigationConfig(slug: string): NavigationItem[] {
  const prefix = `/home/${slug}`;

  return [
    { label: 'common:home', path: prefix, icon: 'home' },
    { label: 'account:settings', path: `${prefix}/settings`, icon: 'settings' },
    {
      label: 'account:apiKeys',
      path: `${prefix}/settings/api-keys`,
      icon: 'key',
    },
    {
      label: 'account:templates',
      path: `${prefix}/settings/templates`,
      icon: 'file-text',
    },
    { label: 'billing:title', path: `${prefix}/billing`, icon: 'credit-card' },
  ];
}

export default getTeamAccountNavigationConfig;
