'use client';

import { useId, useState, useSyncExternalStore, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { removeMilestone, setMilestone } from '@odb/deal-timeline/actions.ts';
import type {
  DealTimeline,
  TimelineChange,
  TimelineMilestone,
} from '@odb/deal-timeline/queries.ts';
import { draftTimelineUpdate } from '@odb/deal-updates/actions.ts';
import { LocalTime } from '@odb/lender-rooms/requests-ui/local-time.tsx';
import { itemAnchor } from '@odb/notifications/relay';
import { plainDate } from '@odb/shared/utils';
import { Badge } from '@odb/ui/badge';
import { Button } from '@odb/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';
import { Checkbox } from '@odb/ui/checkbox';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@odb/ui/table';

const neverChanges = () => () => {};

const twoDigits = (value: number) => String(value).padStart(2, '0');

function localToday() {
  const now = new Date();

  return `${now.getFullYear()}-${twoDigits(now.getMonth() + 1)}-${twoDigits(now.getDate())}`;
}

function utcToday() {
  return new Date().toISOString().slice(0, 10);
}

function dayOrNotSet(day: string | null) {
  return day === null ? 'Not set' : plainDate(day);
}

function targetFlag(
  milestone: TimelineMilestone,
  today: string,
  timeline: DealTimeline,
) {
  if (
    milestone.id !== null &&
    timeline.lapsedExtensions.includes(milestone.id)
  ) {
    return 'Lapsed';
  }

  if (milestone.targetOn === null) {
    return null;
  }

  if (milestone.kind === 'exclusivity_end') {
    return milestone.targetOn < timeline.teamToday && !timeline.exclusivityOver
      ? 'Lapsed'
      : null;
  }

  return milestone.targetOn < today && milestone.actualOn === null
    ? 'Overdue'
    : null;
}

function describeChange(change: TimelineChange) {
  if (change.change === 'removed') {
    return `${change.milestone} removed`;
  }

  const parts = [
    change.targetOn === null
      ? 'no target'
      : `target ${plainDate(change.targetOn)}`,
    change.actualOn === null
      ? 'no actual'
      : `actual ${plainDate(change.actualOn)}`,
    ...(change.shared === null ? [] : [change.shared ? 'shared' : 'team only']),
  ];

  return `${change.milestone} set: ${parts.join(', ')}`;
}

function announcesTarget(before: TimelineMilestone, after: TimelineMilestone) {
  return (
    after.shared &&
    (before.shared
      ? before.targetOn !== after.targetOn
      : after.targetOn !== null)
  );
}

const newCustomMilestone: TimelineMilestone = {
  id: null,
  kind: 'custom',
  label: '',
  targetOn: null,
  actualOn: null,
  shared: false,
};

export function DealTimelineSection({
  dealId,
  timeline,
}: {
  dealId: string;
  timeline: DealTimeline;
}) {
  const router = useRouter();
  const today = useSyncExternalStore(neverChanges, localToday, utcToday);
  const [editing, setEditing] = useState<TimelineMilestone | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [offer, setOffer] = useState<{
    milestone: string;
    from: string | null;
    to: string | null;
  } | null>(null);

  function edit(milestone: TimelineMilestone | null) {
    setEditing(milestone);
    setRefusal(null);
  }

  async function save(draft: TimelineMilestone) {
    const result = await setMilestone({
      dealId,
      milestoneId: draft.id ?? crypto.randomUUID(),
      targetOn: draft.targetOn,
      actualOn: draft.actualOn,
      shared: draft.shared,
      ...(draft.kind === 'custom'
        ? { kind: 'custom', label: draft.label }
        : { kind: draft.kind }),
    });

    if (!result.ok) {
      setRefusal(result.refusal);
      return;
    }

    setOffer(
      announcesTarget(editing!, draft)
        ? {
            milestone: draft.label,
            from: editing!.targetOn,
            to: draft.targetOn,
          }
        : null,
    );
    edit(null);
    router.refresh();
  }

  async function draftUpdate() {
    const result = await draftTimelineUpdate({ dealId, ...offer! });

    if (!result.ok) {
      setRefusal(result.refusal);
      return;
    }

    setRefusal(null);
    setOffer(null);
    router.refresh();
  }

  async function remove(milestoneId: string) {
    const result = await removeMilestone({ dealId, milestoneId });

    setRefusal(result.ok ? null : result.refusal);
    router.refresh();
  }

  function flagged(milestone: TimelineMilestone) {
    const flag = targetFlag(milestone, today, timeline);

    return flag === null ? null : <Badge variant={'destructive'}>{flag}</Badge>;
  }

  const rows =
    editing?.id === null && editing.kind === 'custom'
      ? [...timeline.milestones, editing]
      : timeline.milestones;

  return (
    <Card id={'timeline'}>
      <CardHeader>
        <CardTitle>Timeline</CardTitle>
      </CardHeader>
      <CardContent className={'flex flex-col gap-6'}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Milestone</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Actual</TableHead>
              <TableHead>Visibility</TableHead>
              {timeline.canManage ? (
                <TableHead>
                  <span className={'sr-only'}>Actions</span>
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((milestone) =>
              milestone === editing ? (
                <MilestoneEditor
                  key={milestone.id ?? `new-${milestone.kind}`}
                  milestone={milestone}
                  onSave={save}
                  onCancel={() => edit(null)}
                />
              ) : (
                <TableRow
                  key={milestone.id ?? milestone.kind}
                  id={
                    milestone.id === null
                      ? undefined
                      : itemAnchor({ kind: 'milestone', id: milestone.id })
                  }
                >
                  <TableHead scope={'row'}>{milestone.label}</TableHead>
                  <TableCell>
                    <span className={'flex items-center gap-2'}>
                      {milestone.kind === 'effective' &&
                      milestone.targetOn === null
                        ? 'Same as closing'
                        : dayOrNotSet(milestone.targetOn)}
                      {flagged(milestone)}
                    </span>
                  </TableCell>
                  <TableCell>{dayOrNotSet(milestone.actualOn)}</TableCell>
                  <TableCell className={'text-muted-foreground'}>
                    {milestone.shared ? 'Shared' : 'Team only'}
                  </TableCell>
                  {timeline.canManage ? (
                    <TableCell className={'text-right'}>
                      <Button
                        type={'button'}
                        variant={'ghost'}
                        size={'sm'}
                        onClick={() => edit(milestone)}
                      >
                        Edit
                      </Button>
                      {milestone.id === null ? null : (
                        <Button
                          type={'button'}
                          variant={'ghost'}
                          size={'sm'}
                          onClick={() => void remove(milestone.id!)}
                        >
                          Remove
                        </Button>
                      )}
                    </TableCell>
                  ) : null}
                </TableRow>
              ),
            )}
          </TableBody>
        </Table>

        {timeline.canManage ? (
          <div className={'flex items-center gap-3'}>
            <Button
              type={'button'}
              variant={'outline'}
              onClick={() => edit(newCustomMilestone)}
            >
              Add milestone
            </Button>
            {offer ? (
              <Button type={'button'} onClick={() => void draftUpdate()}>
                Draft an update
              </Button>
            ) : null}
            {refusal ? (
              <p role={'alert'} className={'text-destructive text-sm'}>
                {refusal}
              </p>
            ) : null}
          </div>
        ) : null}

        <section className={'flex flex-col gap-2'}>
          <h3 className={'text-sm font-medium'}>Change history</h3>
          {timeline.history.length === 0 ? (
            <p className={'text-muted-foreground text-sm'}>No changes yet</p>
          ) : (
            <ol className={'flex flex-col gap-1'}>
              {timeline.history.map((change) => (
                <li
                  key={change.id}
                  data-timeline-change
                  className={'flex flex-wrap items-baseline gap-x-2 text-sm'}
                >
                  <span>{describeChange(change)}</span>
                  <span className={'text-muted-foreground text-xs'}>
                    <LocalTime at={change.at} />
                    {` · ${change.by}`}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

function MilestoneEditor({
  milestone,
  onSave,
  onCancel,
}: {
  milestone: TimelineMilestone;
  onSave: (draft: TimelineMilestone) => Promise<void>;
  onCancel: () => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(milestone);
  const [isSaving, startSaving] = useTransition();

  function change(values: Partial<TimelineMilestone>) {
    setDraft((current) => ({ ...current, ...values }));
  }

  return (
    <TableRow className={'bg-muted/40 hover:bg-muted/40'}>
      <TableCell className={'align-top'}>
        {milestone.kind === 'custom' ? (
          <div className={'flex flex-col gap-1'}>
            <Label htmlFor={`${id}-name`}>Name</Label>
            <Input
              id={`${id}-name`}
              maxLength={200}
              value={draft.label}
              onChange={(event) => change({ label: event.target.value })}
            />
          </div>
        ) : (
          <span className={'font-medium'}>{milestone.label}</span>
        )}
      </TableCell>
      <TableCell className={'align-top'}>
        <div className={'flex flex-col gap-1'}>
          <Label htmlFor={`${id}-target`}>Target</Label>
          <Input
            id={`${id}-target`}
            type={'date'}
            value={draft.targetOn ?? ''}
            onChange={(event) =>
              change({ targetOn: event.target.value || null })
            }
          />
        </div>
      </TableCell>
      <TableCell className={'align-top'}>
        <div className={'flex flex-col gap-1'}>
          <Label htmlFor={`${id}-actual`}>Actual</Label>
          <Input
            id={`${id}-actual`}
            type={'date'}
            value={draft.actualOn ?? ''}
            onChange={(event) =>
              change({ actualOn: event.target.value || null })
            }
          />
        </div>
      </TableCell>
      <TableCell className={'align-top'}>
        <div className={'flex items-center gap-2 pt-6'}>
          <Checkbox
            id={`${id}-shared`}
            checked={draft.shared}
            onCheckedChange={(checked) => change({ shared: checked === true })}
          />
          <Label htmlFor={`${id}-shared`}>Shared</Label>
        </div>
      </TableCell>
      <TableCell className={'text-right align-top'}>
        <div className={'flex justify-end gap-2 pt-5'}>
          <Button
            type={'button'}
            size={'sm'}
            onClick={() => startSaving(() => onSave(draft))}
            disabled={isSaving}
          >
            Save
          </Button>
          <Button
            type={'button'}
            variant={'ghost'}
            size={'sm'}
            onClick={onCancel}
          >
            Cancel
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
