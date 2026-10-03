import { redirect } from 'next/navigation';

import type { DealBoxCriteria } from '@odb/deals/schema';
import { fetchDealBox } from '@odb/deals/shared';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { UnderwritingForm } from '../../_components/underwriting-form';

export default async function UserUnderwritingPage(props: {
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

  const dealBox = await fetchDealBox(client, user.id);

  return (
    <main className={'flex flex-col gap-6 p-8'}>
      <h1 className={'text-2xl font-semibold'}>Underwriting</h1>
      <UnderwritingForm
        accountId={user.id}
        criteria={(dealBox?.criteria_json ?? {}) as DealBoxCriteria}
        brokerSummary={dealBox?.broker_summary ?? null}
        minDscr={dealBox?.min_dscr ?? null}
        requiredPersonalCashFlow={dealBox?.required_personal_cash_flow ?? null}
      />
    </main>
  );
}
