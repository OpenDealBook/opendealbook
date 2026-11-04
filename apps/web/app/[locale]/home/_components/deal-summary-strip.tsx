import type { ReactNode } from 'react';

import { earningsMultiple } from '@odb/calculators';
import type { TimelineMilestone } from '@odb/deal-timeline/queries.ts';
import { plainDate } from '@odb/shared/utils';
import { FigureValue, MissingValue } from '@odb/ui/figure-value';
import { StageChip } from '@odb/ui/stage-chip';

interface Deadline {
  label: string;
  on: string;
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
      <dd className={'text-2xl font-medium tracking-tight tabular-nums'}>
        {children}
      </dd>
    </div>
  );
}

export function DealSummaryStrip({
  stage,
  lost,
  asking,
  basis,
  adoptedSde,
  adoptedEbitda,
  deadline,
  waitingOnUs,
}: {
  stage: { key: string; label: string };
  lost: boolean;
  asking: number | null;
  basis: 'sde' | 'ebitda';
  adoptedSde: number | null;
  adoptedEbitda: number | null;
  deadline: Deadline | null;
  waitingOnUs: number;
}) {
  const earningsLabel = basis === 'ebitda' ? 'EBITDA' : 'SDE';
  const earnings = basis === 'ebitda' ? adoptedEbitda : adoptedSde;
  const multiple = earningsMultiple(basis, asking, adoptedSde, adoptedEbitda);

  return (
    <dl
      className={
        'bg-card grid grid-cols-2 gap-x-6 gap-y-4 rounded-lg border px-5 py-4 sm:grid-cols-3 lg:grid-cols-6'
      }
    >
      <Figure label={'Stage'}>
        <StageChip stage={stage.key} lost={lost}>
          {stage.label}
        </StageChip>
      </Figure>
      <Figure label={'Asking'}>
        <FigureValue value={asking} format={'money'} />
      </Figure>
      <Figure label={`Adopted ${earningsLabel}`}>
        <FigureValue value={earnings} format={'money'} />
      </Figure>
      <Figure label={`Asking multiple (${earningsLabel})`}>
        <FigureValue value={multiple} format={'multiple'} calculated />
      </Figure>
      <div className={'flex min-w-0 flex-col gap-1'}>
        <dt className={'text-muted-foreground text-xs'}>Next deadline</dt>
        <dd className={'text-sm font-medium'}>
          {deadline === null ? (
            <MissingValue label={'Not set'} />
          ) : (
            `${deadline.label}, ${plainDate(deadline.on)}`
          )}
        </dd>
      </div>
      <Figure label={'Waiting on us'}>{waitingOnUs}</Figure>
    </dl>
  );
}
