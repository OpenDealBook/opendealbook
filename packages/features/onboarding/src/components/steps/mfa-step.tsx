'use client';

import { Button } from '@odb/ui/button';

import type { MfaStep } from '../../schema/onboarding.schema';

export function MfaStepForm(props: {
  onSubmit: (value: MfaStep) => void;
  onBack?: () => void;
  onSkip?: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">
        Add an extra layer of security to your account with multi-factor
        authentication. You can always set this up later from settings.
      </p>

      <div className="flex gap-2">
        {props.onBack ? (
          <Button type="button" variant="ghost" onClick={props.onBack}>
            Back
          </Button>
        ) : null}
        {props.onSkip ? (
          <Button type="button" variant="outline" onClick={props.onSkip}>
            Skip for now
          </Button>
        ) : null}
        <Button type="button" onClick={() => props.onSubmit({ enroll: true })}>
          Set up MFA
        </Button>
      </div>
    </div>
  );
}
