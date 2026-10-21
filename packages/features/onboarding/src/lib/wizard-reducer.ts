import type {
  DealBoxStep,
  InviteeTermsStep,
  MfaStep,
  OnboardingFlow,
  ProfileStep,
  TermsStep,
  WorkspaceStep,
} from '../schema/onboarding.schema';

export type OnboardingStepId =
  | 'profile'
  | 'workspace'
  | 'terms'
  | 'dealBox'
  | 'mfa';

export const onboardingSteps = {
  buyer: ['profile', 'workspace', 'terms', 'dealBox', 'mfa'],
  invitee: ['profile', 'terms', 'mfa'],
} as const satisfies Record<
  OnboardingFlow['kind'],
  readonly OnboardingStepId[]
>;

const skippableStepIds: ReadonlySet<OnboardingStepId> = new Set([
  'dealBox',
  'mfa',
]);

export type StepValues = {
  profile: ProfileStep;
  workspace: WorkspaceStep;
  terms: TermsStep | InviteeTermsStep;
  dealBox: DealBoxStep;
  mfa: MfaStep;
};

export type WizardData = Partial<StepValues>;

export type WizardState = {
  steps: readonly OnboardingStepId[];
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

export function initialWizardState(
  steps: readonly OnboardingStepId[],
): WizardState {
  return { steps, stepIndex: 0, data: {} };
}

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
        ...state,
        data: withStep(state.data, action.step, action.value),
        stepIndex: Math.min(state.stepIndex + 1, state.steps.length),
      };
    case 'skipStep': {
      const current = state.steps[state.stepIndex];
      const data = { ...state.data };
      if (current) {
        delete data[current];
      }
      return {
        ...state,
        data,
        stepIndex: Math.min(state.stepIndex + 1, state.steps.length),
      };
    }
    case 'back':
      return { ...state, stepIndex: Math.max(state.stepIndex - 1, 0) };
  }
}

export function currentStepId(state: WizardState): OnboardingStepId | null {
  return state.steps[state.stepIndex] ?? null;
}

export function isComplete(state: WizardState): boolean {
  return state.stepIndex >= state.steps.length;
}

export function progress(state: WizardState): number {
  return state.stepIndex / state.steps.length;
}

export function isStepSkippable(step: OnboardingStepId): boolean {
  return skippableStepIds.has(step);
}
