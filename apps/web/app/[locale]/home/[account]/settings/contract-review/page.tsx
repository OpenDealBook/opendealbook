import { notFound } from 'next/navigation';

import { getSupabaseServerClient } from '@odb/supabase/server';

import { TeamReviewGate } from '../../../_components/contract-review-gate';
import { loadTeamWorkspace } from '../../layout';

export default async function ContractReviewSettingsPage(props: {
  params: Promise<{ account: string }>;
}) {
  const { account } = await props.params;
  const { team, permissions } = await loadTeamWorkspace(account);

  if (!permissions.includes('deals.manage')) {
    notFound();
  }

  const client = getSupabaseServerClient();
  const required = async (type: 'loi' | 'apa') =>
    (
      await client
        .rpc('contract_review_team_required', {
          account_id: team.id,
          contract_type: type,
        })
        .throwOnError()
    ).data;
  const [loi, apa] = await Promise.all([required('loi'), required('apa')]);

  return (
    <main className={'flex max-w-3xl flex-col gap-6 p-8'}>
      <h1 className={'text-2xl font-semibold'}>Counsel sign-off</h1>
      <p className={'text-muted-foreground text-sm'}>
        Choose which contracts need both sides&apos; counsel to approve the
        exact version before it goes out for signature. Each deal starts with
        these and a deal manager can change them on the deal.
      </p>
      <TeamReviewGate accountId={team.id} gates={{ loi, apa }} />
    </main>
  );
}
