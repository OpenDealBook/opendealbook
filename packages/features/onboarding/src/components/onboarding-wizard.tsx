'use client';

import { useEffect, useRef, useState } from 'react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@odb/ui/card';

import { useOnboardingWizard } from '../hooks/use-onboarding-wizard';
import type { CompleteOnboarding } from '../lib/complete-onboarding';
import { assembleSubmission } from '../lib/submission';
import { ProfileStepForm } from './steps/profile-step';
import { WorkspaceStepForm } from './steps/workspace-step';
import { TermsStepForm } from './steps/terms-step';
import { DealBoxStepForm } from './steps/deal-box-step';
import { MfaStepForm } from './steps/mfa-step';

const stepTitles: Record<string, { title: string; description: string }> = {
  profile: { title: 'Your profile', description: 'Tell us who you are.' },
  workspace: {
    title: 'Your workspace',
    description: 'Work on your own or with a team.',
  },
  terms: {
    title: 'Terms and comparables',
    description: 'Accept the hosted terms and choose your data preferences.',
  },
  dealBox: {
    title: 'Acquisition criteria',
    description: 'Define the kind of deals you are looking for.',
  },
  mfa: {
    title: 'Secure your account',
    description: 'Optionally set up multi-factor authentication.',
  },
};

export function OnboardingWizard(props: { onComplete: CompleteOnboarding }) {
  const wizard = useOnboardingWizard();
  const { state, currentStep, submitStep, skip, back, isComplete } = wizard;
  const [submitting, setSubmitting] = useState(false);
  const completed = useRef(false);

  useEffect(() => {
    if (!isComplete || completed.current) {
      return;
    }
    completed.current = true;
    setSubmitting(true);
    void props.onComplete(assembleSubmission(state.data));
  }, [isComplete, props, state.data]);

  const meta = currentStep ? stepTitles[currentStep] : undefined;

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
          <div
            className="bg-primary h-full transition-all"
            style={{ width: `${Math.round(wizard.progress * 100)}%` }}
          />
        </div>
        {meta ? (
          <>
            <CardTitle>{meta.title}</CardTitle>
            <CardDescription>{meta.description}</CardDescription>
          </>
        ) : null}
      </CardHeader>
      <CardContent>
        {submitting || isComplete ? (
          <p className="text-muted-foreground text-sm">Setting things up…</p>
        ) : null}

        {currentStep === 'profile' ? (
          <ProfileStepForm
            value={state.data.profile}
            onSubmit={(value) => submitStep('profile', value)}
          />
        ) : null}

        {currentStep === 'workspace' ? (
          <WorkspaceStepForm
            value={state.data.workspace}
            onSubmit={(value) => submitStep('workspace', value)}
            onBack={back}
          />
        ) : null}

        {currentStep === 'terms' ? (
          <TermsStepForm
            value={state.data.terms}
            onSubmit={(value) => submitStep('terms', value)}
            onBack={back}
          />
        ) : null}

        {currentStep === 'dealBox' ? (
          <DealBoxStepForm
            value={state.data.dealBox}
            onSubmit={(value) => submitStep('dealBox', value)}
            onBack={back}
            onSkip={skip}
          />
        ) : null}

        {currentStep === 'mfa' ? (
          <MfaStepForm
            onSubmit={(value) => submitStep('mfa', value)}
            onBack={back}
            onSkip={skip}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
