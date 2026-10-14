import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@odb/ui/card';

import { safeNextPath } from '@odb/lender-rooms/members/entry-rules.ts';

import { LenderSignInForm } from './sign-in-form';

export default async function LenderSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main>
      <Card className={'w-full max-w-sm'}>
        <CardHeader>
          <CardTitle>Sign in to your lender room</CardTitle>
          <CardDescription>
            Enter the email address you were invited with and we will send you
            a sign-in link.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LenderSignInForm next={safeNextPath(next ?? null)} />
        </CardContent>
      </Card>
    </main>
  );
}
