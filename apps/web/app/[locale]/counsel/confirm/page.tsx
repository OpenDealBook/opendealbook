import { notFound, redirect } from 'next/navigation';

import { decideCounselConfirmPage } from '@odb/deal-counsel/entry-rules.ts';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';

import { ConfirmCounselSignInForm } from './confirm-form';

export default async function ConfirmCounselSignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const decision = decideCounselConfirmPage(
    new URLSearchParams(await searchParams),
  );

  if (decision.kind === 'not-found') {
    notFound();
  }

  if (decision.kind === 'sign-in') {
    redirect(decision.path);
  }

  return (
    <main>
      <Card className={'w-full max-w-sm'}>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
        </CardHeader>
        <CardContent>
          <ConfirmCounselSignInForm
            tokenHash={decision.tokenHash}
            next={decision.next}
          />
        </CardContent>
      </Card>
    </main>
  );
}
