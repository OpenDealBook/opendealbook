import type { SupabaseClient } from '@supabase/supabase-js';

import { sellerSideContracts, visibleContracts } from '@odb/contracts';
import type { CounselSide } from '@odb/deal-counsel/portal-gate.ts';
import type { Database } from '@odb/supabase';

import { type OpenReview, openReviews } from '../../home/_lib/counsel-deals';
import { versionReviews } from './contracts/version-reviews';

export async function counselOpenReviews(
  client: SupabaseClient<Database>,
  admin: SupabaseClient<Database>,
  dealId: string,
  side: CounselSide,
): Promise<OpenReview[]> {
  const readContracts =
    side === 'buyer' ? visibleContracts : sellerSideContracts;
  const contracts = await readContracts(client, dealId);
  const reviews = await versionReviews(
    admin,
    contracts.flatMap((contract) => contract.versions.map(({ id }) => id)),
    side,
  );

  return openReviews(contracts, reviews);
}
