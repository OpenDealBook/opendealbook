import { describe, expect, it } from 'vitest';

import {
  currentStepId,
  initialWizardState,
  isComplete,
  isStepSkippable,
  onboardingSteps,
  progress,
  wizardReducer,
} from './wizard-reducer';

const buyer = initialWizardState(onboardingSteps.buyer);

function walk(steps: readonly string[]) {
  let state = initialWizardState(onboardingSteps.invitee);
  const seen = [currentStepId(state)];
  for (let i = 0; i < steps.length; i++) {
    state = wizardReducer(state, { type: 'skipStep' });
    seen.push(currentStepId(state));
  }
  return seen;
}

describe('wizardReducer', () => {
  it('starts on the first step with no data', () => {
    expect(currentStepId(buyer)).toBe('profile');
    expect(buyer.data).toEqual({});
  });

  it('advances and records the submitted step value', () => {
    const next = wizardReducer(buyer, {
      type: 'submitStep',
      step: 'profile',
      value: { name: 'Ada Lovelace', pictureUrl: undefined },
    });

    expect(currentStepId(next)).toBe('workspace');
    expect(next.data.profile).toEqual({ name: 'Ada Lovelace' });
  });

  it('walks an invitee through profile, terms, then mfa with no team or deal box step', () => {
    expect(walk(onboardingSteps.invitee)).toEqual([
      'profile',
      'terms',
      'mfa',
      null,
    ]);
  });

  it('goes back without discarding recorded data', () => {
    const advanced = wizardReducer(buyer, {
      type: 'submitStep',
      step: 'profile',
      value: { name: 'Ada Lovelace', pictureUrl: undefined },
    });
    const back = wizardReducer(advanced, { type: 'back' });

    expect(currentStepId(back)).toBe('profile');
    expect(back.data.profile).toEqual({ name: 'Ada Lovelace' });
  });

  it('does not go back past the first step', () => {
    const back = wizardReducer(buyer, { type: 'back' });
    expect(back.stepIndex).toBe(0);
  });

  it('skips a step and clears any value it held', () => {
    const atDealBox = {
      ...buyer,
      stepIndex: onboardingSteps.buyer.indexOf('dealBox'),
      data: { dealBox: { criteria: { naics: ['541211'] } } },
    };
    const skipped = wizardReducer(atDealBox, { type: 'skipStep' });

    expect(currentStepId(skipped)).toBe('mfa');
    expect(skipped.data.dealBox).toBeUndefined();
  });

  it('reports completion after the final step and clamps the index', () => {
    const atLast = { ...buyer, stepIndex: onboardingSteps.buyer.length - 1 };
    const done = wizardReducer(atLast, { type: 'skipStep' });

    expect(isComplete(done)).toBe(true);
    const past = wizardReducer(done, {
      type: 'submitStep',
      step: 'mfa',
      value: { enroll: false },
    });
    expect(past.stepIndex).toBe(onboardingSteps.buyer.length);
  });

  it('tracks progress from zero to one across the steps', () => {
    expect(progress(buyer)).toBe(0);
    expect(
      progress({ ...buyer, stepIndex: onboardingSteps.buyer.length }),
    ).toBe(1);
  });

  it('marks only the deal box and mfa steps skippable', () => {
    expect(isStepSkippable('profile')).toBe(false);
    expect(isStepSkippable('terms')).toBe(false);
    expect(isStepSkippable('dealBox')).toBe(true);
    expect(isStepSkippable('mfa')).toBe(true);
  });
});
