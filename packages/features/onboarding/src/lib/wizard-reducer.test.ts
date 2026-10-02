import { describe, expect, it } from 'vitest';

import {
  currentStepId,
  initialWizardState,
  isComplete,
  isStepSkippable,
  onboardingStepOrder,
  progress,
  wizardReducer,
} from './wizard-reducer';

describe('wizardReducer', () => {
  it('starts on the first step with no data', () => {
    expect(currentStepId(initialWizardState)).toBe('profile');
    expect(initialWizardState.data).toEqual({});
  });

  it('advances and records the submitted step value', () => {
    const next = wizardReducer(initialWizardState, {
      type: 'submitStep',
      step: 'profile',
      value: { name: 'Ada Lovelace', pictureUrl: undefined },
    });

    expect(currentStepId(next)).toBe('workspace');
    expect(next.data.profile).toEqual({ name: 'Ada Lovelace' });
  });

  it('goes back without discarding recorded data', () => {
    const advanced = wizardReducer(initialWizardState, {
      type: 'submitStep',
      step: 'profile',
      value: { name: 'Ada Lovelace', pictureUrl: undefined },
    });
    const back = wizardReducer(advanced, { type: 'back' });

    expect(currentStepId(back)).toBe('profile');
    expect(back.data.profile).toEqual({ name: 'Ada Lovelace' });
  });

  it('does not go back past the first step', () => {
    const back = wizardReducer(initialWizardState, { type: 'back' });
    expect(back.stepIndex).toBe(0);
  });

  it('skips a step and clears any value it held', () => {
    const atDealBox: typeof initialWizardState = {
      stepIndex: onboardingStepOrder.indexOf('dealBox'),
      data: { dealBox: { criteria: { naics: ['541211'] } } },
    };
    const skipped = wizardReducer(atDealBox, { type: 'skipStep' });

    expect(currentStepId(skipped)).toBe('mfa');
    expect(skipped.data.dealBox).toBeUndefined();
  });

  it('reports completion after the final step and clamps the index', () => {
    const atLast: typeof initialWizardState = {
      stepIndex: onboardingStepOrder.length - 1,
      data: {},
    };
    const done = wizardReducer(atLast, { type: 'skipStep' });

    expect(isComplete(done)).toBe(true);
    const past = wizardReducer(done, {
      type: 'submitStep',
      step: 'mfa',
      value: { enroll: false },
    });
    expect(past.stepIndex).toBe(onboardingStepOrder.length);
  });

  it('tracks progress from zero to one across the steps', () => {
    expect(progress(initialWizardState)).toBe(0);
    expect(
      progress({ stepIndex: onboardingStepOrder.length, data: {} }),
    ).toBe(1);
  });

  it('marks only the deal box and mfa steps skippable', () => {
    expect(isStepSkippable('profile')).toBe(false);
    expect(isStepSkippable('terms')).toBe(false);
    expect(isStepSkippable('dealBox')).toBe(true);
    expect(isStepSkippable('mfa')).toBe(true);
  });
});
