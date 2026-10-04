import type {
  BuyerProfileContact,
  BuyerProfileExpertise,
  BuyerProfileFinancing,
  BuyerProfileSensitive,
} from '@odb/buyer-profile/server';
import { loadBuyerProfile } from '@odb/buyer-profile/server';
import { buyerProfilePhotoSignedUrl } from '@odb/buyer-profile/storage';
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

  const expertise = profile?.expertise_json as BuyerProfileExpertise | null;
  const financing = profile?.financing_json as BuyerProfileFinancing | null;
  const contact = profile?.contact_json as BuyerProfileContact | null;
  const interested = profile?.interested_json as string[] | null;
  const notInterested = profile?.not_interested_json as string[] | null;
  const sensitive = profile?.sensitive_json as BuyerProfileSensitive | null;

  const photoPath = profile?.photo_path ?? null;
  const photoUrl = photoPath
    ? await buyerProfilePhotoSignedUrl(client, photoPath)
    : null;

  const initial = {
    display_name: profile?.display_name ?? '',
    headline: profile?.headline ?? '',
    about: profile?.about ?? '',
    experience: profile?.experience ?? '',
    motivation: profile?.motivation ?? '',
    target_statement: profile?.target_statement ?? '',
    value_proposition: profile?.value_proposition ?? '',
    expertise_areas: expertise?.areas ?? [],
    financing: financing ?? {
      cash_available: '',
      max_purchase_price: '',
      sba_prequalified: false,
    },
    contact: contact ?? { email: '', phone: '', website: '' },
    interested: interested ?? [],
    not_interested: notInterested ?? [],
    photo_path: photoPath,
    photo_url: photoUrl,
    include_sensitive: profile?.include_sensitive ?? false,
    sensitive: sensitive ?? {
      credit_score: '',
      pre_approval: '',
      phone: '',
    },
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
