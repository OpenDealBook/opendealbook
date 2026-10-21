import { notFound } from 'next/navigation';

import {
  COUNSEL_DEALS_PATH,
  safeCounselNextPath,
} from '@odb/deal-counsel/entry-rules.ts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@odb/ui/card';

import { CounselSignInForm } from './sign-in-form';

export default async function CounselSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeCounselNextPath(
    (await searchParams).next ?? COUNSEL_DEALS_PATH,
  );

  if (!next) {
    notFound();
  }

  return (
    <main>
      <Card className={'w-full max-w-sm'}>
        <CardHeader>
          <CardTitle>Sign in as counsel</CardTitle>
          <CardDescription>
            Enter the email address you were invited with and we will send you a
            sign-in link.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CounselSignInForm next={next} />
        </CardContent>
      </Card>
    </main>
  );
}
