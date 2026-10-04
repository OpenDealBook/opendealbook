import pathsConfig from '~/config/paths.config';

export interface NavigationItem {
  label: string;
  path: string;
  icon: string;
}

export const personalAccountNavigationConfig: NavigationItem[] = [
  { label: 'common.home', path: pathsConfig.app.home, icon: 'home' },
  { label: 'common.todos', path: '/home/todos', icon: 'check-square' },
  { label: 'common.deals', path: '/home/deals', icon: 'briefcase' },
  { label: 'common.outreach', path: '/home/outreach', icon: 'send' },
  {
    label: 'common.underwriting',
    path: '/home/underwriting',
    icon: 'calculator',
  },
  { label: 'account.settings', path: '/home/settings', icon: 'settings' },
  { label: 'billing.title', path: '/home/billing', icon: 'credit-card' },
];

export default personalAccountNavigationConfig;
