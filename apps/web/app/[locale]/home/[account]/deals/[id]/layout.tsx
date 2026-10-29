import type { ReactNode } from 'react';

import { notFound } from 'next/navigation';

import { acceptedOffer, fetchAccountStages, fetchDealOffers } from '@odb/deals';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { DealHeader } from '../../../_components/deal-header';
import { DealSubnav } from '../../../_components/deal-subnav';
import { ItemFocus } from '../../../_components/item-focus';
import { managesDeal } from '../../../_components/lender-manages-deal';
import { loadTeamWorkspace } from '../../layout';

export default async function TeamDealLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ account: string; id: string }>;
}) {
  const { account, id } = await params;
  const { user, team, permissions, isOwner } = await loadTeamWorkspace(account);
  const client = getSupabaseServerClient();

  const [
    { data: deal },
    { data: financials },
    stages,
    showLenders,
    offers,
    { data: industries },
    { data: otherDeals },
  ] = await Promise.all([
    client
      .from('deal')
      .select(
        '*, firm!inner(name, name_confirmed), deal_profile!inner(industry_id, industry, location_raw, employee_band, website, owner_role, reason_for_sale, year_established), deal_star(user_id)',
      )
      .eq('id', id)
      .eq('account_id', team.id)
      .maybeSingle(),
    client
      .from('deal_financials')
      .select('adopted_revenue, adopted_sde, adopted_ebitda')
      .eq('deal_id', id)
      .maybeSingle(),
    fetchAccountStages(client, team.id),
    managesDeal(id, team.id),
    fetchDealOffers(client, { deal_id: id }),
    client
      .from('industry')
      .select('id, name')
      .eq('account_id', team.id)
      .order('name')
      .throwOnError(),
    client
      .from('deal')
      .select('firm:firm_id!inner(name)')
      .eq('account_id', team.id)
      .neq('id', id)
      .throwOnError(),
  ]);

  if (!deal) {
    notFound();
  }

  return (
    <div className={'flex flex-col'}>
      <DealHeader
        deal={deal}
        financials={financials}
        stages={stages}
        starred={deal.deal_star.some((star) => star.user_id === user.id)}
        canManage={permissions.includes('deals.manage')}
        isOwner={isOwner}
        dealsHref={`/home/${account}/deals`}
        industries={industries}
        otherBusinessNames={otherDeals.map((other) => other.firm.name)}
        tabs={
          <DealSubnav
            showLenders={showLenders}
            offerAccepted={acceptedOffer(offers) !== null}
          />
        }
      />
      <ItemFocus />
      {children}
    </div>
  );
}
