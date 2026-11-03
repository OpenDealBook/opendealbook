import { describe, expect, it } from 'vitest';

import { stubBootEnv } from '../../../../../test-env';

stubBootEnv({});
const { getTeamAccountNavigationConfig, teamNavigationFor } =
  await import('../../../../../config/team-account-navigation.config');

function work(permissions: string[]) {
  return teamNavigationFor('team-one', permissions).filter(
    (item) => item.group === 'work',
  );
}

describe('the team AI page in the workspace nav', () => {
  it('links the AI page in the Work group for those who can work on deals', () => {
    expect(
      getTeamAccountNavigationConfig('team-one').find(
        (item) => item.label === 'aiHome.nav',
      ),
    ).toEqual({
      group: 'work',
      label: 'aiHome.nav',
      path: '/home/team-one/ai',
      requires: 'deals.work',
    });
  });

  it('is hidden from someone who cannot work on deals', () => {
    expect(work([]).map((item) => item.label)).not.toContain('aiHome.nav');
  });
});
