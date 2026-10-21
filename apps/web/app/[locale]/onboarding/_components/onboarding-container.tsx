'use client';

import { useRouter } from 'next/navigation';

import type { CompleteOnboarding, OnboardingFlow } from '@odb/onboarding';
import { OnboardingWizard } from '@odb/onboarding/components';

export function OnboardingContainer(props: {
  flow: OnboardingFlow;
  onComplete: CompleteOnboarding;
}) {
  const router = useRouter();

  const handleComplete: CompleteOnboarding = async (submission) => {
    const result = await props.onComplete(submission);
    router.replace(result.redirectTo);
    return result;
  };

  return <OnboardingWizard flow={props.flow} onComplete={handleComplete} />;
}
