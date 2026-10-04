import { redirect } from 'next/navigation';

import { getSupabaseServerClient } from '@odb/supabase/server';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@odb/ui/card';

import { ensureTrialSampleData } from '../_lib/ensure-trial-sample-data';

export default async function UserHomePage(props: {
  params: Promise<{ locale: string }>;
}) {
  await props.params;

  const client = getSupabaseServerClient();

  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    redirect('/auth/sign-in');
  }

  await ensureTrialSampleData(client, { accountId: user.id, userId: user.id });

  return (
    <main className={'flex flex-col gap-6 p-8'}>
      <div className={'flex flex-col gap-1'}>
        <h1 className={'text-2xl font-semibold'}>Home</h1>
        <p className={'text-muted-foreground text-sm'}>{user.email}</p>
      </div>

      <div className={'grid gap-4 sm:grid-cols-2 lg:grid-cols-3'}>
        <Card>
          <CardHeader>
            <CardTitle>Activity</CardTitle>
            <CardDescription>Your recent workspace activity</CardDescription>
          </CardHeader>
          <CardContent className={'text-muted-foreground text-sm'}>
            Nothing here yet.
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Settings</CardTitle>
            <CardDescription>Manage your personal account</CardDescription>
          </CardHeader>
          <CardContent className={'text-muted-foreground text-sm'}>
            Update your profile, password, and avatar.
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Billing</CardTitle>
            <CardDescription>Review your plan and invoices</CardDescription>
          </CardHeader>
          <CardContent className={'text-muted-foreground text-sm'}>
            Choose a plan that fits your workflow.
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
