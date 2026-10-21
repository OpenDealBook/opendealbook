import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';

type Side = 'buyer' | 'seller';

export interface PendingReview {
  versionId: string;
  dealId: string;
  dealName: string;
  outsideDealName: string;
  contractType: string;
  version: number;
  sellerNumber: number | null;
  shownToSeller: boolean;
  requestId: string;
  requestedAt: string;
  side: Side;
  counsel: { userId: string; email: string }[];
}

export async function listPendingReviews(
  admin: SupabaseClient<Database>,
  accountId: string,
): Promise<PendingReview[]> {
  const { data: requests } = await admin
    .from('contract_review_request')
    .select(
      'id, requested_at, contract_version!inner(id, version, seller_number, shared_at, party, contract!inner(type, current_version, deal_id, deal!inner(code_name, archived_at, resolution, firm!inner(name))))',
    )
    .eq('account_id', accountId)
    .order('requested_at', { ascending: false })
    .throwOnError();

  const latestByVersion = new Map<string, (typeof requests)[number]>();
  for (const request of requests) {
    if (!latestByVersion.has(request.contract_version.id)) {
      latestByVersion.set(request.contract_version.id, request);
    }
  }

  const open = [...latestByVersion.values()].filter(
    ({ contract_version: version }) =>
      version.version === version.contract.current_version &&
      version.contract.deal.archived_at === null &&
      version.contract.deal.resolution === null,
  );
  if (open.length === 0) {
    return [];
  }

  const versionIds = open.map((request) => request.contract_version.id);
  const [{ data: overrides }, { data: decisions }, { data: counsel }] =
    await Promise.all([
      admin
        .from('contract_signing_override')
        .select('contract_version_id')
        .in('contract_version_id', versionIds)
        .throwOnError(),
      admin
        .from('contract_review_decision')
        .select('contract_version_id, side, decided_at')
        .in('contract_version_id', versionIds)
        .throwOnError(),
      admin
        .from('deal_counsel')
        .select('deal_id, side, user_id, email')
        .in(
          'deal_id',
          open.map((request) => request.contract_version.contract.deal_id),
        )
        .throwOnError(),
    ]);
  const overridden = new Set(overrides.map((row) => row.contract_version_id));

  const pending: PendingReview[] = [];
  for (const request of open) {
    const version = request.contract_version;
    const { contract } = version;
    if (overridden.has(version.id)) {
      continue;
    }

    const { data: required } = await admin
      .rpc('contract_review_required', {
        deal_id: contract.deal_id,
        contract_type: contract.type,
      })
      .throwOnError();
    if (!required) {
      continue;
    }

    for (const side of ['buyer', 'seller'] as const) {
      const answered = decisions.some(
        (decision) =>
          decision.contract_version_id === version.id &&
          decision.side === side &&
          Date.parse(decision.decided_at) > Date.parse(request.requested_at),
      );
      if (answered) {
        continue;
      }

      pending.push({
        versionId: version.id,
        dealId: contract.deal_id,
        dealName: contract.deal.firm.name,
        outsideDealName: contract.deal.code_name ?? contract.deal.firm.name,
        contractType: contract.type,
        version: version.version,
        sellerNumber: version.seller_number,
        shownToSeller: version.shared_at !== null || version.party === 'seller',
        requestId: request.id,
        requestedAt: request.requested_at,
        side,
        counsel: counsel
          .filter((row) => row.deal_id === contract.deal_id && row.side === side)
          .map((row) => ({ userId: row.user_id, email: row.email })),
      });
    }
  }

  return pending;
}
