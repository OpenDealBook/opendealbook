'use client';

import { useState } from 'react';

import type { Provider } from '@supabase/supabase-js';

import { useSupabase } from '@tuckin/supabase/hooks';
import { Button } from '@tuckin/ui/button';

import { signInWithOAuth } from '../lib/auth-flows';
import { AuthErrorAlert } from './auth-error-alert';

export function OAuthProviders({
  providers,
  redirectTo,
}: {
  providers: Provider[];
  redirectTo?: string;
}) {
  const client = useSupabase();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (providers.length === 0) {
    return null;
  }

  const onClick = async (provider: Provider) => {
    setErrorMessage(null);

    const { error } = await signInWithOAuth(client, { provider, redirectTo });

    if (error) {
      setErrorMessage(error.message);
    }
  };

  return (
    <div className={'flex flex-col gap-2'}>
      <AuthErrorAlert message={errorMessage} />

      {providers.map((provider) => (
        <Button
          key={provider}
          type={'button'}
          variant={'outline'}
          onClick={() => onClick(provider)}
        >
          Continue with {provider}
        </Button>
      ))}
    </div>
  );
}
