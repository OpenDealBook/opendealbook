import type {
  DealBoxStep,
  MfaStep,
  ProfileStep,
  TermsStep,
  WorkspaceStep,
} from '../schema/onboarding.schema';

export const onboardingStepOrder = [
  'profile',
  'workspace',
  'terms',
  'dealBox',
  'mfa',
] as const;

export type OnboardingStepId = (typeof onboardingStepOrder)[number];

const skippableStepIds: ReadonlySet<OnboardingStepId> = new Set([
  'dealBox',
  'mfa',
]);

export type StepValues = {
  profile: ProfileStep;
  workspace: WorkspaceStep;
  terms: TermsStep;
  dealBox: DealBoxStep;
  mfa: MfaStep;
};

export type WizardData = Partial<StepValues>;

export type WizardState = {
  stepIndex: number;
  data: WizardData;
};

type SubmitStepActions = {
  [K in OnboardingStepId]: {
    type: 'submitStep';
    step: K;
    value: StepValues[K];
  };
};

export type WizardAction =
  | SubmitStepActions[OnboardingStepId]
  | { type: 'skipStep' }
  | { type: 'back' };

export const initialWizardState: WizardState = { stepIndex: 0, data: {} };

const lastIndex = onboardingStepOrder.length;

function withStep<K extends OnboardingStepId>(
  data: WizardData,
  step: K,
  value: StepValues[K],
): WizardData {
  return { ...data, [step]: value } as WizardData;
}

export function wizardReducer(
  state: WizardState,
  action: WizardAction,
): WizardState {
  switch (action.type) {
    case 'submitStep':
      return {
        data: withStep(state.data, action.step, action.value),
        stepIndex: Math.min(state.stepIndex + 1, lastIndex),
      };
    case 'skipStep': {
      const current = onboardingStepOrder[state.stepIndex];
      const data = { ...state.data };
      if (current) {
        delete data[current];
      }
      return { data, stepIndex: Math.min(state.stepIndex + 1, lastIndex) };
    }
    case 'back':
      return { ...state, stepIndex: Math.max(state.stepIndex - 1, 0) };
  }
}

export function currentStepId(state: WizardState): OnboardingStepId | null {
  return onboardingStepOrder[state.stepIndex] ?? null;
}

export function isComplete(state: WizardState): boolean {
  return state.stepIndex >= lastIndex;
}

export function progress(state: WizardState): number {
  return state.stepIndex / lastIndex;
}

export function isStepSkippable(step: OnboardingStepId): boolean {
  return skippableStepIds.has(step);
}
