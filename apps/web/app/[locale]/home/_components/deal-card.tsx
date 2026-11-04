import type { ReactNode } from 'react';

import Link from 'next/link';

import { useLocale } from 'next-intl';

import {
  FIXED_MILESTONES,
  type MilestoneKind,
} from '@odb/deal-timeline/schema.ts';
import type { DealListItem, NextMilestone } from '@odb/deals';
import { Badge } from '@odb/ui/badge';
import { Button } from '@odb/ui/button';
import { Card } from '@odb/ui/card';
import { FigureValue, MissingValue } from '@odb/ui/figure-value';
import { formatDate } from '@odb/ui/format';
import { StageChip, type StageTone, stageTone } from '@odb/ui/stage-chip';

import { DealRowActions } from './deal-row-actions';

const STRIP: Record<StageTone, string> = {
  early: 'bg-stage-early-foreground',
  diligence: 'bg-stage-diligence-foreground',
  close: 'bg-stage-close-foreground',
  lost: 'bg-stage-lost-foreground',
};

function nextStep(milestone: NextMilestone | null, locale: string): string {
  if (milestone === null) {
    return 'Not set';
  }
  const kind = milestone.kind as MilestoneKind;
  const name =
    kind === 'custom' ? milestone.label! : FIXED_MILESTONES[kind].label;
  return `${name}, ${formatDate(milestone.targetOn, locale)}`;
}

function resolutionText(
  resolution: string | null,
  reason: string | null,
): string | null {
  if (resolution === null) {
    return null;
  }
  const outcome = resolution === 'won' ? 'Won' : 'Lost';
  return reason === null
    ? outcome
    : `${outcome} (${reason.replace(/_/g, ' ')})`;
}

export function DealCard({
  deal,
  ownerName,
  isOwner,
  detailBasePath,
}: {
  deal: DealListItem;
  ownerName: string | null;
  isOwner: boolean;
  detailBasePath: string;
}) {
  const locale = useLocale();
  const lost = deal.resolution === 'lost';
  const archived = deal.archivedAt !== null;
  const href = `${detailBasePath}/${deal.id}`;
  const resolution = resolutionText(deal.resolution, deal.resolutionReason);
  const subtitle = [deal.locationName, deal.industryName]
    .filter((value) => value !== null)
    .join(' · ');

  return (
    <Card
      className={`relative overflow-hidden py-0 ${archived ? 'bg-muted/40' : ''}`}
    >
      <div
        className={`absolute inset-y-0 left-0 w-1 ${archived ? 'bg-muted-foreground' : STRIP[stageTone(deal.stage, lost)]}`}
        aria-hidden
      />
      <div className={'flex flex-col gap-4 py-5 pr-4 pl-5'}>
        <div className={'flex flex-col gap-1'}>
          <div className={'flex items-start gap-2'}>
            <Link
              href={href}
              className={'font-semibold break-words hover:underline'}
            >
              {deal.title}
            </Link>
            {deal.isExample ? (
              <Badge variant={'secondary'}>Example</Badge>
            ) : null}
            {archived ? <Badge variant={'outline'}>Archived</Badge> : null}
          </div>
          {subtitle.length > 0 ? (
            <p className={'text-muted-foreground text-sm'}>{subtitle}</p>
          ) : null}
        </div>

        <dl className={'grid grid-cols-2 gap-x-2 gap-y-3 text-sm'}>
          <Fact
            label={'Next step'}
            value={nextStep(deal.nextMilestone, locale)}
          />
          <Fact label={'Owner'} value={ownerName ?? 'Unassigned'} />
          <Fact
            label={'Checklist'}
            value={
              <>
                {deal.openItems} open,{' '}
                <span
                  className={
                    deal.overdueItems > 0 ? 'text-destructive' : undefined
                  }
                >
                  {deal.overdueItems} overdue
                </span>
              </>
            }
          />
          <Fact
            label={'Last activity'}
            value={formatDate(deal.lastActivityAt, locale)}
          />
        </dl>

        <div className={'flex flex-wrap items-center gap-2'}>
          <StageChip
            stage={deal.stage}
            lost={lost}
            className={archived ? 'bg-muted text-muted-foreground' : undefined}
          >
            {deal.stageLabel ?? deal.stage}
          </StageChip>
          {resolution !== null ? (
            <Badge variant={'secondary'}>{resolution}</Badge>
          ) : null}
          {deal.listingStatus === 'pulled' ? (
            <Badge variant={'destructive'}>Pulled</Badge>
          ) : null}
        </div>

        <div
          className={
            'grid grid-cols-[repeat(auto-fill,minmax(6rem,1fr))] gap-2 text-sm'
          }
        >
          <Metric label={'Ask'} value={deal.askingPrice} />
          <Metric label={'Revenue'} value={deal.revenue} />
          <Metric label={'SDE'} value={deal.sde} />
          {deal.yourOffer !== null ? (
            <Metric label={'Your offer'} value={deal.yourOffer} />
          ) : null}
        </div>

        <div className={'flex flex-wrap gap-2'}>
          <Badge variant={'outline'}>
            <FigureValue value={deal.multiple} format={'multiple'} calculated />
          </Badge>
          <Badge variant={'outline'}>
            <FigureValue value={deal.margin} format={'percent'} calculated />{' '}
            margin
          </Badge>
        </div>

        <div className={'flex items-center justify-between gap-2'}>
          <span className={'text-muted-foreground text-xs'}>
            {deal.daysInStage ?? <MissingValue calculated />} days in stage
          </span>
          <div className={'flex items-center gap-1'}>
            <Button asChild variant={'ghost'} size={'sm'}>
              <Link href={href}>Open</Link>
            </Button>
            <DealRowActions
              dealId={deal.id}
              dealName={deal.title}
              starred={deal.starred}
              archived={deal.archivedAt !== null}
              isOwner={isOwner}
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

function Metric({ label, value }: { label: string; value: number | null }) {
  return (
    <div className={'flex flex-col'}>
      <span className={'text-muted-foreground text-xs'}>{label}</span>
      <FigureValue value={value} format={'money'} className={'font-medium'} />
    </div>
  );
}
