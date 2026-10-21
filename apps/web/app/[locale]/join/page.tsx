import Link from 'next/link';

import { getSupabaseServerClient } from '@odb/supabase/server';
import { Alert, AlertDescription, AlertTitle } from '@odb/ui/alert';
import { Button } from '@odb/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@odb/ui/card';

import { ExpiredInvite } from './_components/expired-invite';
import { JoinTeam } from './_components/join-team';
import { liveInvitation } from './_lib/live-invitation';

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

  const invitation = await liveInvitation(token);

  if (!invitation) {
    return (
      <main className={'flex min-h-screen items-center justify-center p-8'}>
        <ExpiredInvite />
      </main>
    );
  }

  const supabase = getSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const next = encodeURIComponent(`/join?token=${token}`);

  return (
    <main className={'flex min-h-screen items-center justify-center p-8'}>
      <Card className={'w-full max-w-sm'}>
        <CardHeader>
          <CardTitle>Join {invitation.teamName}</CardTitle>
          <CardDescription>
            {invitation.inviterName} invited you to join {invitation.teamName}{' '}
            on Open Deal Book.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {user ? (
            <JoinTeam token={token} />
          ) : (
            <Button asChild>
              <Link href={`/auth/sign-in?next=${next}`}>
                Sign in to continue
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
