import { loadBuyerProfile } from '@odb/buyer-profile/server';
import { getSupabaseServerClient } from '@odb/supabase/server';
import { Button } from '@odb/ui/button';

import { loadTeamWorkspace } from '../../layout';
import { BuyerProfileForm } from './_components/buyer-profile-form';

interface BuyerProfilePageProps {
  params: Promise<{ locale: string; account: string }>;
}

export default async function BuyerProfilePage({
  params,
}: BuyerProfilePageProps) {
  const { account } = await params;
  const { team } = await loadTeamWorkspace(account);

  const client = getSupabaseServerClient();
  const profile = await loadBuyerProfile(client, team.id);

  const initial = {
    display_name: profile?.display_name ?? '',
    headline: profile?.headline ?? '',
    about: profile?.about ?? '',
    experience: profile?.experience ?? '',
    motivation: profile?.motivation ?? '',
    target_statement: profile?.target_statement ?? '',
    value_proposition: profile?.value_proposition ?? '',
  };

  return (
    <main className={'flex flex-col gap-6 p-8'}>
      <div className={'flex items-center justify-between'}>
        <h1 className={'text-2xl font-semibold'}>Buyer profile</h1>
        {profile ? (
          <Button asChild variant={'outline'}>
            <a href={`/home/${account}/settings/buyer-profile/pdf`}>
              Download PDF
            </a>
          </Button>
        ) : null}
      </div>

      <BuyerProfileForm accountId={team.id} initial={initial} />
    </main>
  );
}
