import {
  onboardingSubmissionSchema,
  type OnboardingSubmission,
} from '../schema/onboarding.schema';
import type { WizardData } from './wizard-reducer';

export function assembleSubmission(data: WizardData): OnboardingSubmission {
  return onboardingSubmissionSchema.parse({
    profile: data.profile,
    workspace: data.workspace,
    terms: data.terms,
    dealBox: data.dealBox,
    mfa: data.mfa,
  });
}
