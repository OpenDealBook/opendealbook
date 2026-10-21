import {
  FIXED_MILESTONES,
  type MilestoneKind,
} from '@odb/deal-timeline/schema.ts';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@odb/ui/table';

type SharedMilestone = {
  kind: MilestoneKind;
  label: string | null;
  target_on: string | null;
  actual_on: string | null;
};

function dayOrNotSet(day: string | null) {
  return day === null
    ? 'Not set'
    : new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', {
        timeZone: 'UTC',
        dateStyle: 'medium',
      });
}

export function SharedTimeline({
  milestones,
}: {
  milestones: SharedMilestone[];
}) {
  if (milestones.length === 0) {
    return null;
  }

  const showsClosing = milestones.some(
    (milestone) => milestone.kind === 'closing',
  );

  return (
    <section className={'flex flex-col gap-2'}>
      <h2 className={'text-lg font-semibold'}>Timeline</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Milestone</TableHead>
            <TableHead>Target</TableHead>
            <TableHead>Actual</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {milestones.map((milestone, index) => (
            <TableRow key={index}>
              <TableCell>
                {milestone.kind === 'custom'
                  ? milestone.label
                  : FIXED_MILESTONES[milestone.kind].label}
              </TableCell>
              <TableCell>
                {milestone.kind === 'effective' &&
                milestone.target_on === null &&
                showsClosing
                  ? 'Same as closing'
                  : dayOrNotSet(milestone.target_on)}
              </TableCell>
              <TableCell>{dayOrNotSet(milestone.actual_on)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
