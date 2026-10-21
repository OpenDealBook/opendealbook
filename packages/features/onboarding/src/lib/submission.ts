import {
  onboardingSubmissionSchema,
  type OnboardingFlow,
  type OnboardingSubmission,
} from '../schema/onboarding.schema';
import type { WizardData } from './wizard-reducer';

export function assembleSubmission(
  flow: OnboardingFlow,
  data: WizardData,
): OnboardingSubmission {
  return onboardingSubmissionSchema.parse({ ...flow, ...data });
}
