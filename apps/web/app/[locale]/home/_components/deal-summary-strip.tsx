import type { ReactNode } from 'react';

import { earningsMultiple } from '@odb/calculators';
import type { TimelineMilestone } from '@odb/deal-timeline/queries.ts';
import { multipleText } from '@odb/deals/shared';
import { plainDate } from '@odb/shared/utils';
import { StageChip } from '@odb/ui/stage-chip';

interface Deadline {
  label: string;
  on: string;
}

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

function money(value: number | null): string {
  return value === null ? 'Not disclosed' : currency.format(value);
}

export function nextDeadline(
  milestones: TimelineMilestone[],
  mustCloseBy: string | null,
): Deadline | null {
  const open = milestones.flatMap((milestone) =>
    milestone.targetOn === null || milestone.actualOn !== null
      ? []
      : [{ label: milestone.label, on: milestone.targetOn }],
  );
  const candidates =
    mustCloseBy === null
      ? open
      : [...open, { label: 'Must close by', on: mustCloseBy }];

  return candidates.reduce<Deadline | null>(
    (earliest, candidate) =>
      earliest === null || candidate.on < earliest.on ? candidate : earliest,
    null,
  );
}

function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={'flex min-w-0 flex-col gap-1'}>
      <dt className={'text-muted-foreground text-xs'}>{label}</dt>
      <dd className={'text-base font-semibold tabular-nums'}>{children}</dd>
    </div>
  );
}

export function DealSummaryStrip({
  stage,
  asking,
  adoptedSde,
  deadline,
  waitingOnUs,
}: {
  stage: { key: string; label: string };
  asking: number | null;
  adoptedSde: number | null;
  deadline: Deadline | null;
  waitingOnUs: number;
}) {
  const multiple = earningsMultiple('sde', asking, adoptedSde, null);

  return (
    <dl
      className={
        'bg-card grid grid-cols-2 gap-x-6 gap-y-4 rounded-xl border px-5 py-4 sm:grid-cols-3 lg:grid-cols-6'
      }
    >
      <Figure label={'Stage'}>
        <StageChip stage={stage.key}>{stage.label}</StageChip>
      </Figure>
      <Figure label={'Asking'}>{money(asking)}</Figure>
      <Figure label={'Adopted SDE'}>{money(adoptedSde)}</Figure>
      <Figure label={'Asking multiple (SDE)'}>
        {multiple === null ? 'Not disclosed' : multipleText(multiple)}
      </Figure>
      <Figure label={'Next deadline'}>
        {deadline === null
          ? 'Not set'
          : `${deadline.label}, ${plainDate(deadline.on)}`}
      </Figure>
      <Figure label={'Waiting on us'}>{waitingOnUs}</Figure>
    </dl>
  );
}
