import pathsConfig from '~/config/paths.config';

export interface NavigationItem {
  label: string;
  path: string;
  icon: string;
}

export const personalAccountNavigationConfig: NavigationItem[] = [
  { label: 'common:home', path: pathsConfig.app.home, icon: 'home' },
  { label: 'account:settings', path: '/home/settings', icon: 'settings' },
  { label: 'billing:title', path: '/home/billing', icon: 'credit-card' },
];

export default personalAccountNavigationConfig;
