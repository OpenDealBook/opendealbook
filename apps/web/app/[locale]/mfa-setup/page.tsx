import Link from 'next/link';
import { redirect } from 'next/navigation';

import { MultiFactorAuthSection } from '@odb/accounts/mfa';
import { getSupabaseServerClient } from '@odb/supabase/server';
import { Button } from '@odb/ui/button';

export const dynamic = 'force-dynamic';

export default async function MfaSetupPage(props: {
  searchParams: Promise<{ team?: string }>;
}) {
  const { team } = await props.searchParams;
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
          <p className={'text-muted-foreground text-sm'}>
            Enroll a verified authenticator app to access the admin area.
          </p>
        </div>
        <MultiFactorAuthSection />
        {team ? (
          <Button asChild variant={'outline'}>
            <Link href={`/home/${encodeURIComponent(team)}`}>
              Continue to your team
            </Link>
          </Button>
        ) : null}
      </div>
    </main>
  );
}
