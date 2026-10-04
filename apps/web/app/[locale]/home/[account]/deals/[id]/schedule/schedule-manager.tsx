'use client';

import { useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { acceptSchedule, slipUnreceived } from '@odb/diligence/server';
import type { Tables } from '@odb/supabase';
import { Badge } from '@odb/ui/badge';
import { Button } from '@odb/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@odb/ui/table';

function startsOn(value: string | null): string {
  return value === null ? 'Not set' : new Date(value).toLocaleDateString('en-US');
}

export function ScheduleManager({
  scheduleId,
  status,
  weeks,
}: {
  scheduleId: string;
  status: string;
  weeks: Tables<'schedule_week'>[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<unknown>) {
    startTransition(async () => {
      await action();
      router.refresh();
    });
  }

  const lastWeekId = weeks.at(-1)?.id ?? null;

  return (
    <div className={'flex flex-col gap-4'}>
      <div className={'flex flex-wrap items-center gap-2'}>
        <Badge variant={'outline'}>{status}</Badge>
        {status === 'active' ? null : (
          <Button
            size={'sm'}
            disabled={pending}
            onClick={() => run(() => acceptSchedule({ scheduleId }))}
          >
            Activate schedule
          </Button>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Week</TableHead>
            <TableHead>Theme</TableHead>
            <TableHead>Starts</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {weeks.map((week) => (
            <TableRow key={week.id}>
              <TableCell>{week.week_no ?? '-'}</TableCell>
              <TableCell>{week.theme ?? '-'}</TableCell>
              <TableCell>{startsOn(week.starts_on)}</TableCell>
              <TableCell>{week.status ?? 'planned'}</TableCell>
              <TableCell className={'text-right'}>
                {week.id === lastWeekId ? null : (
                  <Button
                    variant={'outline'}
                    size={'sm'}
                    disabled={pending}
                    onClick={() => run(() => slipUnreceived({ weekId: week.id }))}
                  >
                    Slip unreceived
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
