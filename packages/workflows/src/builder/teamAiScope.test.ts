import { describe, expect, it } from 'vitest';

import * as webEntry from './teamAiScope';

describe('the web-facing team AI entry', () => {
  it('reaches team AI only through a verified scope', () => {
    expect(webEntry).toHaveProperty('resolveScopedTeamAi');
    expect(webEntry).toHaveProperty('dealAiScope');
    expect(webEntry).toHaveProperty('accountAiScope');
    expect(webEntry).not.toHaveProperty('resolveTeamAi');
  });
});
