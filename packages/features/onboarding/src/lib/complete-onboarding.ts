import type { OnboardingSubmission } from '../schema/onboarding.schema';

export type OnboardingResult = { redirectTo: string };

export type CompleteOnboarding = (
  submission: OnboardingSubmission,
) => Promise<OnboardingResult>;
