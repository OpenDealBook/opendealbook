import type { NavigationItem } from '~/config/personal-account-navigation.config';

export function getTeamAccountNavigationConfig(slug: string): NavigationItem[] {
  const prefix = `/home/${slug}`;

  return [
    { label: 'common.home', path: prefix, icon: 'home' },
    { label: 'common.deals', path: `${prefix}/deals`, icon: 'briefcase' },
    { label: 'common.outreach', path: `${prefix}/outreach`, icon: 'send' },
    {
      label: 'common.underwriting',
      path: `${prefix}/underwriting`,
      icon: 'calculator',
    },
    { label: 'account.settings', path: `${prefix}/settings`, icon: 'settings' },
    {
      label: 'account.apiKeys',
      path: `${prefix}/settings/api-keys`,
      icon: 'key',
    },
    {
      label: 'account.templates',
      path: `${prefix}/settings/templates`,
      icon: 'file-text',
    },
    {
      label: 'account.buyerProfile',
      path: `${prefix}/settings/buyer-profile`,
      icon: 'user',
    },
    { label: 'billing.title', path: `${prefix}/billing`, icon: 'credit-card' },
  ];
}

export default getTeamAccountNavigationConfig;
