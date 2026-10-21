import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getSupabaseServerClient } from '@odb/supabase/server';
import { Card, CardHeader, CardTitle } from '@odb/ui/card';

import { resolveTeamLanding } from './_lib/team-landing';

export default async function HomeLandingPage() {
  const client = getSupabaseServerClient();

  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    redirect('/auth/sign-in');
  }

  const landing = await resolveTeamLanding(client, user.id);

  if (landing.kind === 'go') {
    redirect(landing.path);
  }

  return (
    <main className={'mx-auto flex max-w-3xl flex-col gap-6 p-8'}>
      <h1 className={'text-2xl font-semibold'}>Choose a team</h1>

      <div className={'grid gap-4 sm:grid-cols-2'}>
        {landing.teams.map((team) => (
          <Link key={team.id} href={`/home/${team.slug}`}>
            <Card className={'hover:bg-muted/40 h-full'}>
              <CardHeader>
                <CardTitle>{team.name}</CardTitle>
              </CardHeader>
            </Card>
          </Link>
        ))}

        <Link href={'/home/create-team'}>
          <Card className={'hover:bg-muted/40 h-full border-dashed'}>
            <CardHeader>
              <CardTitle>Create a team</CardTitle>
            </CardHeader>
          </Card>
        </Link>
      </div>
    </main>
  );
}
