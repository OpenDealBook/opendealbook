import Link from 'next/link';
import { redirect } from 'next/navigation';

import {
  counselPortalPath,
  counselSignInPath,
} from '@odb/deal-counsel/entry-rules.ts';
import { loadCounselThread } from '@odb/deal-counsel/thread.ts';
import { dealDisplayName, outsideDealName } from '@odb/deals/shared';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@odb/ui/table';

import {
  byWaitingThenActivity,
  closedSellerCounselDeals,
  openCounselDealIds,
  otherSide,
  unreadTeamMessages,
} from '../home/_lib/counsel-deals';
import { lastCounselVisits } from './[dealId]/counsel-visit';
import { counselOpenReviews } from './[dealId]/open-reviews';
import { ClosedDeals } from './closed-deals';

function day(timestamp: string) {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export default async function CounselDealsPage() {
  const client = getSupabaseServerClient();

  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    redirect(counselSignInPath('/counsel'));
  }

  const [dealIds, closedDeals] = await Promise.all([
    openCounselDealIds(client, user.id),
    closedSellerCounselDeals(client, user.id),
  ]);

  // Service role: counsel are not deal members and cannot read deal rows.
  // openCounselDealIds and closedSellerCounselDeals proved the caller is
  // counsel on each of these deals.
  const admin = getSupabaseServerAdminClient();
  const [{ data: rows }, messageVisits, { data: closedRows }] =
    await Promise.all([
      admin
        .from('deal_counsel')
        .select(
          'side, deal!inner(id, code_name, firm!inner(name), pipeline_stage!inner(label), accounts!deal_account_id_fkey(name))',
        )
        .eq('user_id', user.id)
        .in('deal_id', dealIds)
        .throwOnError(),
      lastCounselVisits(client, 'messages'),
      admin
        .from('deal')
        .select('id, firm!inner(name), accounts!deal_account_id_fkey(name)')
        .in(
          'id',
          closedDeals.map(({ dealId }) => dealId),
        )
        .throwOnError(),
    ]);

  const deals = (
    await Promise.all(
      rows.map(async ({ side, deal }) => {
        const [reviews, messages, { data: sellers }] = await Promise.all([
          counselOpenReviews(client, admin, deal.id, side),
          loadCounselThread(deal.id, side),
          admin.rpc('seller_room_names', { deal_id: deal.id }).throwOnError(),
        ]);
        const lastActivityAt =
          [
            ...messages.map((message) => message.created_at),
            ...reviews.map((review) => review.requestedAt),
          ]
            .sort()
            .at(-1) ?? null;

        return {
          id: deal.id,
          name:
            side === 'buyer' ? outsideDealName(deal) : dealDisplayName(deal),
          counterparty: otherSide(
            side,
            sellers.map((seller) => seller.name),
            deal.accounts.name,
          ),
          stage: deal.pipeline_stage.label,
          waiting:
            reviews.length +
            unreadTeamMessages(messages, messageVisits.get(deal.id) ?? null)
              .length,
          lastActivityAt,
        };
      }),
    )
  ).sort(byWaitingThenActivity);

  return (
    <main className={'flex flex-col gap-6'}>
      <h1 className={'font-serif text-3xl font-medium'}>Your deals</h1>

      {deals.length === 0 ? (
        <p className={'text-muted-foreground'}>You have no open deals.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Deal</TableHead>
              <TableHead>Other side</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead className={'text-right'}>Waiting on you</TableHead>
              <TableHead>Last activity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deals.map((deal) => (
              <TableRow key={deal.id}>
                <TableCell>
                  <Link
                    href={counselPortalPath(deal.id)}
                    className={'font-medium hover:underline'}
                  >
                    {deal.name}
                  </Link>
                </TableCell>
                <TableCell>{deal.counterparty}</TableCell>
                <TableCell>{deal.stage}</TableCell>
                <TableCell
                  className={
                    deal.waiting > 0
                      ? 'text-right font-semibold tabular-nums'
                      : 'text-muted-foreground text-right tabular-nums'
                  }
                >
                  {deal.waiting}
                </TableCell>
                <TableCell className={'text-muted-foreground'}>
                  {deal.lastActivityAt ? day(deal.lastActivityAt) : 'None yet'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {closedRows.length > 0 ? (
        <ClosedDeals
          deals={closedRows.map((deal) => ({
            id: deal.id,
            name: dealDisplayName(deal),
            teamName: deal.accounts.name,
            readUntil: closedDeals.find(({ dealId }) => dealId === deal.id)!
              .readUntil,
          }))}
        />
      ) : null}
    </main>
  );
}
