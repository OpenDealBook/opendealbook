'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { MultiFactorChallenge, SignInForm } from '@tuckin/auth';
import { getSupabaseBrowserClient } from '@tuckin/supabase/client';

export function SignInMfa() {
  const router = useRouter();
  const [needsChallenge, setNeedsChallenge] = useState(false);

  const onSuccess = async () => {
    const { data } =
      await getSupabaseBrowserClient().auth.mfa.getAuthenticatorAssuranceLevel();

    if (data?.nextLevel === 'aal2' && data.currentLevel !== 'aal2') {
      setNeedsChallenge(true);
      return;
    }

    router.push('/home');
  };

  if (needsChallenge) {
    return <MultiFactorChallenge onVerified={() => router.push('/home')} />;
  }

  return <SignInForm onSuccess={onSuccess} />;
}
