import { describe, expect, it } from 'vitest';

import { trialDripDecision } from './eligibility';

describe('trialDripDecision', () => {
  it('sends while the trial is active and the user has not unsubscribed', () => {
    expect(trialDripDecision({ trialActive: true, unsubscribed: false })).toBe(
      'send',
    );
  });

  it('stops once the trial is no longer active', () => {
    expect(trialDripDecision({ trialActive: false, unsubscribed: false })).toBe(
      'stop',
    );
  });

  it('stops when the user has unsubscribed', () => {
    expect(trialDripDecision({ trialActive: true, unsubscribed: true })).toBe(
      'stop',
    );
  });
});
