'use client';

import { useCallback, useReducer } from 'react';

import {
  currentStepId,
  initialWizardState,
  isComplete,
  progress,
  wizardReducer,
  type OnboardingStepId,
  type StepValues,
  type WizardAction,
} from '../lib/wizard-reducer';

export function useOnboardingWizard() {
  const [state, dispatch] = useReducer(wizardReducer, initialWizardState);

  const submitStep = useCallback(
    <K extends OnboardingStepId>(step: K, value: StepValues[K]) =>
      dispatch({ type: 'submitStep', step, value } as WizardAction),
    [],
  );
  const skip = useCallback(() => dispatch({ type: 'skipStep' }), []);
  const back = useCallback(() => dispatch({ type: 'back' }), []);

  return {
    state,
    currentStep: currentStepId(state),
    progress: progress(state),
    isComplete: isComplete(state),
    submitStep,
    skip,
    back,
  };
}
