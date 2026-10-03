'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { SignUpForm } from '@odb/auth';

import { useAnalytics } from '~/components/analytics-provider';
import { AnalyticsEvents } from '~/config/analytics-events';

export function SignUpRedirect({
  emailRedirectTo,
}: {
  emailRedirectTo?: string;
}) {
  const router = useRouter();
  const analytics = useAnalytics();

  useEffect(() => {
    void analytics.trackEvent(AnalyticsEvents.signupStarted);
  }, [analytics]);

  return (
    <SignUpForm
      emailRedirectTo={emailRedirectTo}
      onSuccess={() => router.push('/home')}
    />
  );
}
