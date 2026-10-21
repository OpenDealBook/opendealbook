import { notFound } from 'next/navigation';

import {
  SELLER_ROOMS_PATH,
  safeSellerNextPath,
} from '@odb/seller-rooms/members/entry-rules.ts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@odb/ui/card';

import { SellerSignInForm } from './sign-in-form';

export default async function SellerSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeSellerNextPath(
    (await searchParams).next ?? SELLER_ROOMS_PATH,
  );

  if (!next) {
    notFound();
  }

  return (
    <main>
      <Card className={'w-full max-w-sm'}>
        <CardHeader>
          <CardTitle>Sign in to your room</CardTitle>
          <CardDescription>
            Enter the email address your room invite was sent to and we will
            email you a sign-in link.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SellerSignInForm next={next} />
        </CardContent>
      </Card>
    </main>
  );
}
