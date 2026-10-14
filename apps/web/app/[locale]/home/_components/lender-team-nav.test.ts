import { describe, expect, it } from 'vitest';

import {
  getTeamAccountNavigationConfig,
  teamNavigationFor,
} from '../../../../config/team-account-navigation.config';

const everyItemBefore = [
  'common.home',
  'common.todos',
  'common.deals',
  'common.reports',
  'common.outreach',
  'common.underwriting',
  'common.compsImport',
  'account.settings',
  'account.apiKeys',
  'account.templates',
  'account.buyerProfile',
  'billing.title',
];

describe('the team workspace nav', () => {
  it('shows Lenders after Deals to people who can manage deals', () => {
    const labels = teamNavigationFor('team-one', ['deals.manage']).map(
      (item) => item.label,
    );

    expect(labels).toEqual([
      'common.home',
      'common.todos',
      'common.deals',
      'common.lenders',
      ...everyItemBefore.slice(3),
    ]);
    expect(
      teamNavigationFor('team-one', ['deals.manage']).find(
        (item) => item.label === 'common.lenders',
      )?.path,
    ).toBe('/home/team-one/lenders');
  });

  it('hides Lenders from everyone else and leaves every other item as it was', () => {
    expect(
      teamNavigationFor('team-one', ['deals.create']).map((item) => item.label),
    ).toEqual(everyItemBefore);
    expect(
      getTeamAccountNavigationConfig('team-one')
        .filter((item) => item.label !== 'common.lenders')
        .map((item) => item.label),
    ).toEqual(everyItemBefore);
  });
});
