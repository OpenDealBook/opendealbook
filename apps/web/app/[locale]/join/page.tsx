import Link from 'next/link';

import { getSupabaseServerClient } from '@odb/supabase/server';
import { AcceptInvitation } from '@odb/team-accounts';
import { Alert, AlertDescription, AlertTitle } from '@odb/ui/alert';
import { Button } from '@odb/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@odb/ui/card';

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <main className={'flex min-h-screen items-center justify-center p-8'}>
        <Alert className={'w-full max-w-sm'}>
          <AlertTitle>Invalid invitation</AlertTitle>
          <AlertDescription>
            This invitation link is not valid.
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  const supabase = getSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const next = encodeURIComponent(`/join?token=${token}`);

    return (
      <main className={'flex min-h-screen items-center justify-center p-8'}>
        <Card className={'w-full max-w-sm'}>
          <CardHeader>
            <CardTitle>Accept invitation</CardTitle>
            <CardDescription>
              Sign in to accept this invitation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href={`/auth/sign-in?next=${next}`}>
                Sign in to continue
              </Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return <AcceptInvitation token={token} />;
}
