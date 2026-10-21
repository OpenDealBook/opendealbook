'use client';

import { useState } from 'react';

import {
  acceptSchedule,
  scheduleFromLoiSigned,
  scheduleFromTemplate,
  slipUnreceived,
} from '@odb/diligence/server';
import type { Tables } from '@odb/supabase';
import { Badge } from '@odb/ui/badge';
import { Button } from '@odb/ui/button';
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

import { useRefusableAction } from '../../../../_components/use-refusable-action';

function startsOn(value: string | null): string {
  return value === null
    ? 'Not set'
    : new Date(value).toLocaleDateString('en-US');
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
  const { refusal, pending, run } = useRefusableAction();

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
                    onClick={() =>
                      run(() => slipUnreceived({ weekId: week.id }))
                    }
                  >
                    Slip unreceived
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {refusal ? (
        <p role={'alert'} className={'text-destructive text-sm'}>
          {refusal}
        </p>
      ) : null}
    </div>
  );
}

export function ScheduleStarter({
  dealId,
  templates,
}: {
  dealId: string;
  templates: { id: string; name: string }[];
}) {
  const { refusal, pending, run } = useRefusableAction();
  const today = new Date().toLocaleDateString('en-CA');
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [startDate, setStartDate] = useState(today);
  const [signedOn, setSignedOn] = useState('');

  return (
    <div className={'grid gap-6 md:grid-cols-2'}>
      <section className={'flex flex-col gap-3'}>
        <h3 className={'font-medium'}>Apply a checklist template</h3>
        {templates.length === 0 ? (
          <p className={'text-muted-foreground text-sm'}>
            This team has no diligence checklist templates yet.
          </p>
        ) : (
          <>
            <select
              aria-label={'Checklist template'}
              className={'bg-background h-9 rounded-md border px-2 text-sm'}
              value={templateId}
              onChange={(event) => setTemplateId(event.target.value)}
            >
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
            <div className={'flex flex-col gap-1'}>
              <Label htmlFor={'schedule-start'}>Schedule starts on</Label>
              <Input
                id={'schedule-start'}
                type={'date'}
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>
            <Button
              className={'self-start'}
              disabled={pending || startDate === ''}
              onClick={() =>
                run(() =>
                  scheduleFromTemplate({ dealId, templateId, startDate }),
                )
              }
            >
              Apply template
            </Button>
          </>
        )}
      </section>
      <section className={'flex flex-col gap-3'}>
        <h3 className={'font-medium'}>Set LOI signed date</h3>
        <p className={'text-muted-foreground text-sm'}>
          The six-week schedule starts on the day the LOI was signed.
        </p>
        <div className={'flex flex-col gap-1'}>
          <Label htmlFor={'loi-signed-on'}>LOI signed on</Label>
          <Input
            id={'loi-signed-on'}
            type={'date'}
            max={today}
            value={signedOn}
            onChange={(event) => setSignedOn(event.target.value)}
          />
        </div>
        <Button
          className={'self-start'}
          disabled={pending || signedOn === ''}
          onClick={() => run(() => scheduleFromLoiSigned({ dealId, signedOn }))}
        >
          Set LOI signed date
        </Button>
      </section>
      {refusal ? (
        <p role={'alert'} className={'text-destructive text-sm md:col-span-2'}>
          {refusal}
        </p>
      ) : null}
    </div>
  );
}
