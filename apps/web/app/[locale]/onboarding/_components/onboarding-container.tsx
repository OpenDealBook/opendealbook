'use client';

import { useRouter } from 'next/navigation';

import { OnboardingWizard } from '@odb/onboarding/components';

import type { CompleteOnboarding } from '@odb/onboarding';

export function OnboardingContainer(props: { onComplete: CompleteOnboarding }) {
  const router = useRouter();

  const handleComplete: CompleteOnboarding = async (submission) => {
    const result = await props.onComplete(submission);
    router.replace(result.redirectTo);
    return result;
  };

  return <OnboardingWizard onComplete={handleComplete} />;
}
