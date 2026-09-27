import { describe, expect, it } from 'vitest';

import { canTransition, nextStates } from './state-machine';

describe('firm state machine', () => {
  it('allows each forward step along the sourcing path', () => {
    expect(canTransition('imported', 'enriched')).toBe(true);
    expect(canTransition('enriched', 'scored')).toBe(true);
    expect(canTransition('scored', 'contacted')).toBe(true);
    expect(canTransition('contacted', 'responded')).toBe(true);
  });

  it('branches from responded to deal_created or disqualified', () => {
    expect(nextStates('responded')).toEqual(['deal_created', 'disqualified']);
  });

  it('rejects skipping a step', () => {
    expect(canTransition('imported', 'scored')).toBe(false);
  });

  it('rejects moving backward', () => {
    expect(canTransition('scored', 'imported')).toBe(false);
  });

  it('treats deal_created and disqualified as terminal', () => {
    expect(nextStates('deal_created')).toEqual([]);
    expect(nextStates('disqualified')).toEqual([]);
  });
});
