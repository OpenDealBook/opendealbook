import { notFound, redirect } from 'next/navigation';

import { decideSellerConfirmPage } from '@odb/seller-rooms/members/entry-rules.ts';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';

import { ConfirmSellerSignInForm } from './confirm-form';

export default async function ConfirmSellerSignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const decision = decideSellerConfirmPage(
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
          <ConfirmSellerSignInForm
            tokenHash={decision.tokenHash}
            next={decision.next}
          />
        </CardContent>
      </Card>
    </main>
  );
}
