import { sdeMargin, sdeMultiple } from '@odb/calculators';
import { fetchAccountStages } from '@odb/deals';
import type { Tables } from '@odb/supabase';
import { getSupabaseServerClient } from '@odb/supabase/server';
import { Badge } from '@odb/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@odb/ui/table';

type DealRow = Tables<'deal'> & {
  deal_financials: Pick<Tables<'deal_financials'>, 'adopted_sde'> | null;
};

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

function formatCurrency(value: number | null): string {
  return value === null ? 'Not disclosed' : currency.format(value);
}

function dealTitle(description: string | null): string {
  if (description === null) {
    return 'Untitled deal';
  }
  return description.replace(/^Example:\s*/, '');
}

function resolutionLabel(
  resolution: string | null,
  reason: string | null,
): string | null {
  if (resolution === null) {
    return null;
  }
  const outcome = resolution === 'won' ? 'Won' : 'Lost';
  return reason === null ? outcome : `${outcome} (${reason.replace(/_/g, ' ')})`;
}

export async function DealsList({ accountId }: { accountId: string }) {
  const client = getSupabaseServerClient();

  const [dealsResult, stages] = await Promise.all([
    client
      .from('deal')
      .select('*, deal_financials(adopted_sde)')
      .eq('account_id', accountId)
      .order('updated_at', { ascending: false }),
    fetchAccountStages(client, accountId),
  ]);

  if (dealsResult.error) {
    throw dealsResult.error;
  }

  const stageLabels = new Map(stages.map((stage) => [stage.key, stage.label]));
  const rows = (dealsResult.data ?? []) as DealRow[];

  if (rows.length === 0) {
    return <p className={'text-muted-foreground text-sm'}>No deals yet</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          <TableHead>Stage</TableHead>
          <TableHead>Resolution</TableHead>
          <TableHead>Asking price</TableHead>
          <TableHead>Revenue</TableHead>
          <TableHead>SDE</TableHead>
          <TableHead>Multiple</TableHead>
          <TableHead>Margin</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((deal) => {
          const sde = deal.deal_financials?.adopted_sde ?? deal.sde_ttm;
          const stageLabel = stageLabels.get(deal.stage) ?? deal.stage;
          const resolution = resolutionLabel(
            deal.resolution,
            deal.resolution_reason,
          );
          const multiple = sdeMultiple(deal.asking_price, sde);
          const margin = sdeMargin(sde, deal.revenue_ttm);

          return (
            <TableRow key={deal.id}>
              <TableCell className={'flex items-center gap-2'}>
                {dealTitle(deal.description)}
                {deal.capture_method === 'example' ? (
                  <Badge variant={'secondary'}>Example</Badge>
                ) : null}
              </TableCell>
              <TableCell>{stageLabel}</TableCell>
              <TableCell>{resolution ?? stageLabel}</TableCell>
              <TableCell>{formatCurrency(deal.asking_price)}</TableCell>
              <TableCell>{formatCurrency(deal.revenue_ttm)}</TableCell>
              <TableCell>{formatCurrency(sde)}</TableCell>
              <TableCell>
                {multiple === null ? 'Not disclosed' : `${multiple.toFixed(1)}x`}
              </TableCell>
              <TableCell>
                {margin === null ? null : (
                  <Badge variant={'outline'}>{Math.round(margin * 100)}%</Badge>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
