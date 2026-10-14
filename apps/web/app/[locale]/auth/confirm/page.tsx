import { redirect } from 'next/navigation';

import { decideConfirmPage } from '@odb/lender-rooms/members/entry-rules.ts';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';

import { ConfirmSignInForm } from './confirm-form';

export const dynamic = 'force-dynamic';

export default async function ConfirmSignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const decision = decideConfirmPage(new URLSearchParams(await searchParams));

  if (decision.kind === 'sign-in') {
    redirect(decision.path);
  }

  return (
    <main className={'flex min-h-screen items-center justify-center p-8'}>
      <Card className={'w-full max-w-sm'}>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
        </CardHeader>
        <CardContent>
          <ConfirmSignInForm
            tokenHash={decision.tokenHash}
            next={decision.next}
            destination={decision.destination}
          />
        </CardContent>
      </Card>
    </main>
  );
}
