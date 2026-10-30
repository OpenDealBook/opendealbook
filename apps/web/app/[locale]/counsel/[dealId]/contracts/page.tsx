import {
  contractVersionViews,
  decideContractReview,
  sellerSideContracts,
  versionComments,
  visibleContracts,
} from '@odb/contracts';
import { enterCounselPortal } from '@odb/deal-counsel/portal-gate.ts';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { nestLoiExtensions } from '../../../home/_lib/loi-extensions';
import { ContractList } from './contract-list';
import { versionReviews } from './version-reviews';

export default async function CounselContractsPage(props: {
  params: Promise<{ dealId: string }>;
}) {
  const { dealId } = await props.params;

  const sides = await enterCounselPortal(dealId);

  const client = getSupabaseServerClient();
  const admin = getSupabaseServerAdminClient();
  const side = sides.includes('buyer') ? 'buyer' : 'seller';
  const readContracts =
    side === 'buyer' ? visibleContracts : sellerSideContracts;
  const summaries = await readContracts(client, dealId);
  const { data: deal } = await admin
    .from('deal')
    .select('account_id')
    .eq('id', dealId)
    .single()
    .throwOnError();
  const versionIds = summaries.flatMap((contract) =>
    contract.versions.map(({ id }) => id),
  );
  const [comments, reviews, { data: locked }] = await Promise.all([
    versionComments(client, versionIds),
    versionReviews(admin, versionIds, side),
    admin
      .rpc('is_account_locked', { target_account_id: deal.account_id })
      .throwOnError(),
  ]);
  const contracts = await nestLoiExtensions(
    admin,
    await Promise.all(
      summaries.map(async (contract) => ({
        ...contract,
        versions: (await contractVersionViews(admin, contract.versions)).map(
          (version) => ({
            ...version,
            comments: comments[version.id]!,
            review: reviews[version.id]!,
          }),
        ),
      })),
    ),
    side,
  );

  return (
    <main className={'flex flex-col gap-6'}>
      <h2 className={'font-serif text-2xl font-medium'}>Contracts</h2>
      <ContractList
        dealId={dealId}
        filesPath={`/counsel/${dealId}/contracts/files`}
        redlineUpload
        contracts={contracts}
        viewer={locked ? null : { side }}
        decide={locked ? null : decideContractReview}
      />
    </main>
  );
}
