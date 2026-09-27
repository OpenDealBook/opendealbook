import { redirect } from 'next/navigation';

import { MultiFactorAuthSection } from '@tuckin/accounts/mfa';
import { getSupabaseServerClient } from '@tuckin/supabase/server';

export default async function MfaSetupPage() {
  const supabase = getSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/sign-in');
  }

  return (
    <main className={'flex min-h-screen items-start justify-center p-8'}>
      <div className={'flex w-full max-w-lg flex-col gap-4'}>
        <div className={'flex flex-col gap-1'}>
          <h1 className={'text-2xl font-semibold'}>
            Set up two-factor authentication
          </h1>
          <p className={'text-sm text-muted-foreground'}>
            Enroll a verified authenticator app to access the admin area.
          </p>
        </div>
        <MultiFactorAuthSection />
      </div>
    </main>
  );
}
