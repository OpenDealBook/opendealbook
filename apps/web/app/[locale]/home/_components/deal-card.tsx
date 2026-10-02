import Link from 'next/link';

import type { DealListGroup, DealListItem } from '@odb/deals';
import { Badge } from '@odb/ui/badge';
import { Button } from '@odb/ui/button';
import { Card } from '@odb/ui/card';

import { DealRowActions } from './deal-row-actions';

const GROUP_ACCENT: Record<DealListGroup, string> = {
  actively_pursuing: 'bg-emerald-500',
  early_funnel: 'bg-sky-500',
  closed_off_track: 'bg-amber-500',
  archived: 'bg-muted-foreground',
};

const compactCurrency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});

function money(value: number | null): string {
  return value === null ? 'Not disclosed' : compactCurrency.format(value);
}

function dealTitle(title: string | null): string {
  return title === null ? 'Untitled deal' : title.replace(/^Example:\s*/, '');
}

function resolutionText(
  resolution: string | null,
  reason: string | null,
): string | null {
  if (resolution === null) {
    return null;
  }
  const outcome = resolution === 'won' ? 'Won' : 'Lost';
  return reason === null ? outcome : `${outcome} (${reason.replace(/_/g, ' ')})`;
}

function monogram(name: string | null): string {
  return name === null ? '#' : name.charAt(0).toUpperCase();
}

export function DealCard({
  deal,
  detailBasePath,
}: {
  deal: DealListItem;
  detailBasePath: string;
}) {
  const href = `${detailBasePath}/${deal.id}`;
  const resolution = resolutionText(deal.resolution, deal.resolutionReason);
  const subtitle = [deal.locationName, deal.industryName]
    .filter((value) => value !== null)
    .join(' · ');

  return (
    <Card className={'relative overflow-hidden py-0'}>
      <div
        className={`absolute inset-y-0 left-0 w-1 ${GROUP_ACCENT[deal.group]}`}
        aria-hidden
      />
      <div className={'flex flex-col gap-4 py-5 pr-4 pl-5'}>
        <div className={'flex items-start gap-3'}>
          <span
            className={
              'bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-md text-sm font-semibold'
            }
            aria-hidden
          >
            {monogram(deal.industryName)}
          </span>
          <div className={'min-w-0 flex-1'}>
            <div className={'flex items-center gap-2'}>
              <Link href={href} className={'truncate font-semibold hover:underline'}>
                {dealTitle(deal.title)}
              </Link>
              {deal.captureMethod === 'example' ? (
                <Badge variant={'secondary'}>Example</Badge>
              ) : null}
            </div>
            {subtitle.length > 0 ? (
              <p className={'text-muted-foreground truncate text-sm'}>{subtitle}</p>
            ) : null}
          </div>
        </div>

        <div className={'flex flex-wrap items-center gap-2'}>
          <Badge variant={'outline'}>{deal.stageLabel ?? deal.stage}</Badge>
          {resolution !== null ? (
            <Badge variant={'secondary'}>{resolution}</Badge>
          ) : null}
          {deal.listingStatus === 'pulled' ? (
            <Badge variant={'destructive'}>Pulled</Badge>
          ) : null}
        </div>

        <div className={'grid grid-cols-3 gap-2 text-sm'}>
          <Metric label={'Ask'} value={money(deal.askingPrice)} />
          <Metric label={'Revenue'} value={money(deal.revenue)} />
          <Metric label={'SDE'} value={money(deal.sde)} />
        </div>

        {deal.multiple !== null || deal.margin !== null ? (
          <div className={'flex flex-wrap gap-2'}>
            {deal.multiple !== null ? (
              <Badge variant={'outline'}>{deal.multiple.toFixed(1)}x</Badge>
            ) : null}
            {deal.margin !== null ? (
              <Badge variant={'outline'}>{Math.round(deal.margin * 100)}% margin</Badge>
            ) : null}
          </div>
        ) : null}

        <div className={'flex items-center justify-between gap-2'}>
          <span className={'text-muted-foreground text-xs'}>
            {deal.daysInStage === null ? '' : `${deal.daysInStage} days in stage`}
          </span>
          <div className={'flex items-center gap-1'}>
            <Button asChild variant={'ghost'} size={'sm'}>
              <Link href={href}>Open</Link>
            </Button>
            <DealRowActions
              dealId={deal.id}
              starred={deal.starred}
              archived={deal.archivedAt !== null}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className={'flex flex-col'}>
      <span className={'text-muted-foreground text-xs'}>{label}</span>
      <span className={'font-medium'}>{value}</span>
    </div>
  );
}
