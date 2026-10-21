import { describe, expect, it } from 'vitest';

import { stubBootEnv } from '../../../../test-env';

stubBootEnv({});
const { teamNavigationFor } =
  await import('../../../../config/team-account-navigation.config');

function labelsIn(group: string, permissions: string[]) {
  return teamNavigationFor('team-one', permissions)
    .filter((item) => item.group === group)
    .map((item) => item.label);
}

const everyPermission = ['deals.manage', 'api_keys.manage'];

describe('the team workspace nav', () => {
  it('puts daily work in the Work group', () => {
    expect(labelsIn('work', everyPermission)).toEqual([
      'common.home',
      'common.todos',
      'common.deals',
      'common.lenders',
      'common.outreach',
      'common.reports',
      'common.workflows',
      'common.approvals',
    ]);
  });

  it('puts team administration in the Settings group, starting with the deal box', () => {
    expect(labelsIn('settings', everyPermission)).toEqual([
      'account.dealBox',
      'account.members',
      'account.teamSettings',
      'billing.title',
      'account.lenderSettings',
      'account.contractReview',
      'account.templates',
      'account.checklists',
      'account.buyerProfile',
      'account.dealCalcDefaults',
      'common.compsImport',
      'account.apiKeys',
    ]);
    expect(
      teamNavigationFor('team-one', []).find(
        (item) => item.label === 'account.members',
      )?.path,
    ).toBe('/home/team-one/members');
    expect(
      teamNavigationFor('team-one', []).find(
        (item) => item.label === 'account.dealBox',
      )?.path,
    ).toBe('/home/team-one/underwriting');
  });

  it('shows Lenders and Lender settings only to people who can manage deals', () => {
    expect(labelsIn('work', ['api_keys.manage'])).not.toContain(
      'common.lenders',
    );
    expect(labelsIn('settings', ['members.manage'])).not.toContain(
      'account.lenderSettings',
    );
    expect(labelsIn('settings', ['members.manage'])).not.toContain(
      'account.contractReview',
    );
    expect(
      teamNavigationFor('team-one', ['deals.manage']).find(
        (item) => item.label === 'common.lenders',
      )?.path,
    ).toBe('/home/team-one/lenders');
    expect(
      teamNavigationFor('team-one', ['deals.manage']).find(
        (item) => item.label === 'account.lenderSettings',
      )?.path,
    ).toBe('/home/team-one/settings/lenders');
  });

  it('shows Approvals only to people who can manage deals', () => {
    expect(labelsIn('work', ['api_keys.manage'])).not.toContain(
      'common.approvals',
    );
    expect(
      teamNavigationFor('team-one', ['deals.manage']).find(
        (item) => item.label === 'common.approvals',
      )?.path,
    ).toBe('/home/team-one/approvals');
  });

  it('shows API keys only to people who can manage API keys', () => {
    expect(
      labelsIn('settings', ['deals.manage', 'members.manage']),
    ).not.toContain('account.apiKeys');
    expect(
      teamNavigationFor('team-one', ['api_keys.manage']).find(
        (item) => item.label === 'account.apiKeys',
      )?.path,
    ).toBe('/home/team-one/settings/api-keys');
  });
});
