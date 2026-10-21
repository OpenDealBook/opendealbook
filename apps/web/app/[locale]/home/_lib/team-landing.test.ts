import { describe, expect, it } from 'vitest';

import { chooseTeamLanding } from './team-landing';

const acme = { id: 'team-acme', name: 'Acme', slug: 'acme' };
const globex = { id: 'team-globex', name: 'Globex', slug: 'globex' };

describe('chooseTeamLanding', () => {
  it('returns to the last-used team', () => {
    expect(chooseTeamLanding([acme, globex], globex.id)).toEqual({
      kind: 'go',
      path: '/home/globex',
    });
  });

  it('asks which team when the last-used team is no longer one of theirs', () => {
    expect(chooseTeamLanding([acme, globex], 'team-gone')).toEqual({
      kind: 'pick',
      teams: [acme, globex],
    });
  });

  it('asks which team when none is remembered and they have several', () => {
    expect(chooseTeamLanding([acme, globex], null)).toEqual({
      kind: 'pick',
      teams: [acme, globex],
    });
  });

  it('goes straight to their only team', () => {
    expect(chooseTeamLanding([acme], null)).toEqual({
      kind: 'go',
      path: '/home/acme',
    });
  });

  it('sends someone with no team to create one', () => {
    expect(chooseTeamLanding([], 'team-gone')).toEqual({
      kind: 'go',
      path: '/home/create-team',
    });
  });
});
