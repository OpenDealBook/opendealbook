import type { getSupabaseServerClient } from '@odb/supabase/server';

import type { VersionReview } from '../../counsel/[dealId]/contracts/contract-review';

const CONTRACT_LABEL: Record<string, string> = {
  loi: 'LOI',
  apa: 'APA',
  loi_extension: 'LOI extension',
};

export interface OpenReview {
  contract: string;
  version: number;
  requestedBy: string;
  requestedAt: string;
}

export async function openCounselDealIds(
  client: ReturnType<typeof getSupabaseServerClient>,
  userId: string,
): Promise<string[]> {
  const { data: rows } = await client
    .from('deal_counsel')
    .select('deal_id, side')
    .eq('user_id', userId)
    .throwOnError();

  const open = await Promise.all(
    rows.map((row) =>
      client
        .rpc('is_deal_counsel', { deal_id: row.deal_id, side: row.side })
        .throwOnError(),
    ),
  );

  return rows.filter((_, index) => open[index]!.data).map((row) => row.deal_id);
}

// Seller's counsel keep reading a deal for a year after it ended.
export async function closedSellerCounselDeals(
  client: ReturnType<typeof getSupabaseServerClient>,
  userId: string,
): Promise<{ dealId: string; readUntil: string }[]> {
  const { data: rows } = await client
    .from('deal_counsel')
    .select('deal_id')
    .eq('user_id', userId)
    .eq('side', 'seller')
    .throwOnError();

  const deals = await Promise.all(
    rows.map(async ({ deal_id }) => {
      const [{ data: isOpen }, { data: reads }, { data: readUntil }] =
        await Promise.all([
          client
            .rpc('is_deal_counsel', { deal_id, side: 'seller' })
            .throwOnError(),
          client
            .rpc('is_deal_seller_counsel_reader', { deal_id })
            .throwOnError(),
          client.rpc('seller_counsel_read_until', { deal_id }).throwOnError(),
        ]);

      return !isOpen && reads ? [{ dealId: deal_id, readUntil }] : [];
    }),
  );

  return deals.flat();
}

export function openReviews(
  contracts: { type: string; versions: { id: string; version: number }[] }[],
  reviews: Record<string, VersionReview>,
): OpenReview[] {
  return contracts.flatMap((contract) => {
    if (contract.versions.length === 0) {
      return [];
    }

    const latest = contract.versions.reduce((a, b) =>
      b.version > a.version ? b : a,
    );
    const { requests, decisions } = reviews[latest.id]!;
    const request = requests.at(-1);

    return request &&
      !decisions.some(
        (decision) =>
          Date.parse(decision.decidedAt) > Date.parse(request.requestedAt),
      )
      ? [
          {
            contract: CONTRACT_LABEL[contract.type]!,
            version: latest.version,
            requestedBy: request.requestedBy,
            requestedAt: request.requestedAt,
          },
        ]
      : [];
  });
}

export function byWaitingThenActivity(
  a: { waiting: number; lastActivityAt: string | null },
  b: { waiting: number; lastActivityAt: string | null },
): number {
  return (
    b.waiting - a.waiting ||
    Date.parse(b.lastActivityAt ?? '1970-01-01') -
      Date.parse(a.lastActivityAt ?? '1970-01-01')
  );
}

export function isNewSince(at: string, since: string | null): boolean {
  return since === null || Date.parse(at) > Date.parse(since);
}

export function unreadTeamMessages<
  Message extends { from_team: boolean; created_at: string },
>(messages: Message[], since: string | null): Message[] {
  return messages
    .filter(
      (message) => message.from_team && isNewSince(message.created_at, since),
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function otherSide(
  side: 'buyer' | 'seller',
  sellerNames: string[],
  teamName: string,
): string {
  if (side === 'seller') {
    return teamName;
  }

  return sellerNames.length > 0 ? sellerNames.join(', ') : 'Not invited yet';
}
