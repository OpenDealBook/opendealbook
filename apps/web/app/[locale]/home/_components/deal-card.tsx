import type { ReactNode } from 'react';

import Link from 'next/link';

import { FIXED_MILESTONES, type MilestoneKind } from '@odb/deal-timeline/schema.ts';
import type { DealListGroup, DealListItem, NextMilestone } from '@odb/deals';
import { multipleText } from '@odb/deals/shared';
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

const shortDate = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  dateStyle: 'medium',
});

function nextStep(milestone: NextMilestone | null): string {
  if (milestone === null) {
    return 'Not set';
  }
  const kind = milestone.kind as MilestoneKind;
  const name = kind === 'custom' ? milestone.label! : FIXED_MILESTONES[kind].label;
  return `${name}, ${shortDate.format(new Date(milestone.targetOn))}`;
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

export function DealCard({
  deal,
  ownerName,
  detailBasePath,
}: {
  deal: DealListItem;
  ownerName: string | null;
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
        <div className={'flex flex-col gap-1'}>
          <div className={'flex items-start gap-2'}>
            <Link href={href} className={'font-semibold break-words hover:underline'}>
              {deal.title}
            </Link>
            {deal.isExample ? (
              <Badge variant={'secondary'}>Example</Badge>
            ) : null}
          </div>
          {subtitle.length > 0 ? (
            <p className={'text-muted-foreground text-sm'}>{subtitle}</p>
          ) : null}
        </div>

        <dl className={'grid grid-cols-2 gap-x-2 gap-y-3 text-sm'}>
          <Fact label={'Next step'} value={nextStep(deal.nextMilestone)} />
          <Fact label={'Owner'} value={ownerName ?? 'Unassigned'} />
          <Fact
            label={'Checklist'}
            value={
              <>
                {deal.openItems} open,{' '}
                <span className={deal.overdueItems > 0 ? 'text-destructive' : undefined}>
                  {deal.overdueItems} overdue
                </span>
              </>
            }
          />
          <Fact
            label={'Last activity'}
            value={shortDate.format(new Date(deal.lastActivityAt))}
          />
        </dl>

        <div className={'flex flex-wrap items-center gap-2'}>
          <Badge variant={'outline'}>{deal.stageLabel ?? deal.stage}</Badge>
          {resolution !== null ? (
            <Badge variant={'secondary'}>{resolution}</Badge>
          ) : null}
          {deal.listingStatus === 'pulled' ? (
            <Badge variant={'destructive'}>Pulled</Badge>
          ) : null}
        </div>

        <div className={'grid grid-cols-[repeat(auto-fill,minmax(6rem,1fr))] gap-2 text-sm'}>
          <Metric label={'Ask'} value={money(deal.askingPrice)} />
          <Metric label={'Revenue'} value={money(deal.revenue)} />
          <Metric label={'SDE'} value={money(deal.sde)} />
          {deal.yourOffer !== null ? (
            <Metric label={'Your offer'} value={money(deal.yourOffer)} />
          ) : null}
        </div>

        {deal.multiple !== null || deal.margin !== null ? (
          <div className={'flex flex-wrap gap-2'}>
            {deal.multiple !== null ? (
              <Badge variant={'outline'}>{multipleText(deal.multiple)}</Badge>
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

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className={'flex flex-col'}>
      <dt className={'text-muted-foreground text-xs'}>{label}</dt>
      <dd className={'font-medium'}>{value}</dd>
    </div>
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
