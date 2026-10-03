import type { DealBoxCriteria } from '@odb/deals/schema';
import { fetchDealBox } from '@odb/deals/shared';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { UnderwritingForm } from '../../_components/underwriting-form';
import { loadTeamWorkspace } from '../layout';

interface TeamUnderwritingPageProps {
  params: Promise<{ locale: string; account: string }>;
}

export default async function TeamUnderwritingPage({
  params,
}: TeamUnderwritingPageProps) {
  const { account } = await params;
  const { team } = await loadTeamWorkspace(account);

  const client = getSupabaseServerClient();
  const dealBox = await fetchDealBox(client, team.id);

  return (
    <main className={'flex flex-col gap-6 p-8'}>
      <h1 className={'text-2xl font-semibold'}>Underwriting</h1>
      <UnderwritingForm
        accountId={team.id}
        criteria={(dealBox?.criteria_json ?? {}) as DealBoxCriteria}
        brokerSummary={dealBox?.broker_summary ?? null}
        minDscr={dealBox?.min_dscr ?? null}
        requiredPersonalCashFlow={dealBox?.required_personal_cash_flow ?? null}
      />
    </main>
  );
}
