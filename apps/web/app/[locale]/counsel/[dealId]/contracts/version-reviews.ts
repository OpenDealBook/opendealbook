import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';

import type { VersionReview } from './contract-review';

// The version ids come from a read under the viewer's own access, which is
// what entitles the service role to read their sign-off.
export async function versionReviews(
  admin: SupabaseClient<Database>,
  contractVersionIds: string[],
  side: Database['public']['Enums']['counsel_side'],
): Promise<Record<string, VersionReview>> {
  const [{ data: requests }, { data: decisions }] = await Promise.all([
    admin
      .from('contract_review_request')
      .select('id, contract_version_id, requested_by, requested_at')
      .in('contract_version_id', contractVersionIds)
      .order('requested_at')
      .throwOnError(),
    admin
      .from('contract_review_decision')
      .select(
        'id, contract_version_id, decision, note, decided_at, without_counsel',
      )
      .in('contract_version_id', contractVersionIds)
      .eq('side', side)
      .order('decided_at', { ascending: false })
      .throwOnError(),
  ]);
  const { data: requesters } = await admin
    .from('accounts')
    .select('primary_owner_user_id, name')
    .eq('is_personal_account', true)
    .in(
      'primary_owner_user_id',
      requests.map((request) => request.requested_by),
    )
    .throwOnError();

  return Object.fromEntries(
    contractVersionIds.map((versionId) => [
      versionId,
      {
        requests: requests
          .filter((request) => request.contract_version_id === versionId)
          .map((request) => ({
            id: request.id,
            requestedBy: requesters.find(
              (account) =>
                account.primary_owner_user_id === request.requested_by,
            )!.name,
            requestedAt: request.requested_at,
          })),
        decisions: decisions
          .filter((decision) => decision.contract_version_id === versionId)
          .map((decision) => ({
            id: decision.id,
            decision: decision.decision,
            note: decision.note,
            decidedAt: decision.decided_at,
            withoutCounsel: decision.without_counsel,
          })),
      },
    ]),
  );
}
