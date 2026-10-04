'use client';

import { useRef, useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import Nango from '@nangohq/frontend';

import {
  attachMeetingRecording,
  connectCalendar,
  createCalendarConnectSession,
  createMeetingRecordingUploadUrl,
  pushMeetingToCalendars,
  scheduleMeeting,
  summarizeMeeting,
} from '@odb/meetings/server';
import { useSupabase } from '@odb/supabase/hooks';
import { Badge } from '@odb/ui/badge';
import { Button } from '@odb/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@odb/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@odb/ui/table';
import { Textarea } from '@odb/ui/textarea';

type CalendarProvider = 'google' | 'microsoft';
type MeetingType = 'weekly' | 'site_visit';

interface MeetingRow {
  id: string;
  type: string;
  scheduled_at: string | null;
  status: string | null;
  summary: string | null;
  recording_path: string | null;
}

interface ConnectionRow {
  id: string;
  provider: string;
  email: string | null;
}

const RECORDING_BUCKET = 'meeting-recordings';

export function MeetingsManager({
  accountId,
  dealId,
  meetings,
  connections,
}: {
  accountId: string;
  dealId: string;
  meetings: MeetingRow[];
  connections: ConnectionRow[];
}) {
  const router = useRouter();

  return (
    <div className={'flex flex-col gap-6'}>
      <ConnectCalendarCard
        accountId={accountId}
        connections={connections}
        onConnected={() => router.refresh()}
      />
      <ScheduleMeetingCard
        accountId={accountId}
        dealId={dealId}
        onScheduled={() => router.refresh()}
      />
      <MeetingsListCard
        accountId={accountId}
        dealId={dealId}
        meetings={meetings}
        onChanged={() => router.refresh()}
      />
    </div>
  );
}

function ConnectCalendarCard({
  accountId,
  connections,
  onConnected,
}: {
  accountId: string;
  connections: ConnectionRow[];
  onConnected: () => void;
}) {
  const [provider, setProvider] = useState<CalendarProvider>('google');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onConnect() {
    setError(null);
    startTransition(async () => {
      try {
        const token = await createCalendarConnectSession({
          accountId,
          provider,
        });

        new Nango({ connectSessionToken: token }).openConnectUI({
          onEvent: async (event) => {
            if (event.type !== 'connect') {
              return;
            }

            await connectCalendar({
              accountId,
              provider,
              nangoConnectionId: event.payload.connectionId,
              providerConfigKey: event.payload.providerConfigKey,
            });

            onConnected();
          },
        });
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'Could not start the calendar connection',
        );
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connected calendars</CardTitle>
      </CardHeader>
      <CardContent className={'flex flex-col gap-4'}>
        {connections.length === 0 ? (
          <p className={'text-muted-foreground text-sm'}>
            No participant calendars connected yet
          </p>
        ) : (
          <ul className={'flex flex-wrap gap-2'}>
            {connections.map((connection) => (
              <li key={connection.id}>
                <Badge variant={'outline'}>
                  {connection.provider}
                  {connection.email ? ` · ${connection.email}` : ''}
                </Badge>
              </li>
            ))}
          </ul>
        )}

        <div className={'flex items-end gap-2'}>
          <div className={'flex flex-col gap-2'}>
            <Label htmlFor={'calendar-provider'}>Provider</Label>
            <Select
              value={provider}
              onValueChange={(value) => setProvider(value as CalendarProvider)}
            >
              <SelectTrigger id={'calendar-provider'} className={'w-48'}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={'google'}>Google</SelectItem>
                <SelectItem value={'microsoft'}>Microsoft</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type={'button'} disabled={pending} onClick={onConnect}>
            {pending ? 'Connecting...' : 'Connect calendar'}
          </Button>
        </div>

        {error === null ? null : (
          <p className={'text-destructive text-sm'}>{error}</p>
        )}
      </CardContent>
    </Card>
  );
}

function ScheduleMeetingCard({
  accountId,
  dealId,
  onScheduled,
}: {
  accountId: string;
  dealId: string;
  onScheduled: () => void;
}) {
  const [type, setType] = useState<MeetingType>('weekly');
  const [scheduledAt, setScheduledAt] = useState('');
  const [notes, setNotes] = useState('');
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const iso = new Date(scheduledAt).toISOString();

    startTransition(async () => {
      await scheduleMeeting({
        account_id: accountId,
        deal_id: dealId,
        type,
        scheduled_at: iso,
        notes: notes === '' ? undefined : notes,
      });

      await pushMeetingToCalendars({
        accountId,
        dealId,
        title: type === 'weekly' ? 'Weekly diligence sync' : 'Site visit',
        start: iso,
        end: new Date(new Date(iso).getTime() + 30 * 60 * 1000).toISOString(),
      });

      setScheduledAt('');
      setNotes('');
      onScheduled();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Schedule a meeting</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className={'flex max-w-xl flex-col gap-4'}>
          <div className={'flex flex-col gap-2'}>
            <Label htmlFor={'meeting-type'}>Type</Label>
            <Select
              value={type}
              onValueChange={(value) => setType(value as MeetingType)}
            >
              <SelectTrigger id={'meeting-type'} className={'w-48'}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={'weekly'}>Weekly sync</SelectItem>
                <SelectItem value={'site_visit'}>Site visit</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className={'flex flex-col gap-2'}>
            <Label htmlFor={'meeting-at'}>When</Label>
            <Input
              id={'meeting-at'}
              type={'datetime-local'}
              required
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)}
            />
          </div>

          <div className={'flex flex-col gap-2'}>
            <Label htmlFor={'meeting-notes'}>Notes</Label>
            <Textarea
              id={'meeting-notes'}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>

          <div>
            <Button type={'submit'} disabled={pending}>
              {pending ? 'Scheduling...' : 'Schedule meeting'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function MeetingsListCard({
  accountId,
  dealId,
  meetings,
  onChanged,
}: {
  accountId: string;
  dealId: string;
  meetings: MeetingRow[];
  onChanged: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Scheduled meetings</CardTitle>
      </CardHeader>
      <CardContent>
        {meetings.length === 0 ? (
          <p className={'text-muted-foreground text-sm'}>
            No meetings scheduled for this deal yet
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>When</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Recording & transcript</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {meetings.map((meeting) => (
                <TableRow key={meeting.id}>
                  <TableCell>{meeting.type}</TableCell>
                  <TableCell>
                    {meeting.scheduled_at === null
                      ? 'Not set'
                      : new Date(meeting.scheduled_at).toLocaleString('en-US')}
                  </TableCell>
                  <TableCell>{meeting.status ?? 'scheduled'}</TableCell>
                  <TableCell>
                    <RecordingPanel
                      accountId={accountId}
                      dealId={dealId}
                      meeting={meeting}
                      onChanged={onChanged}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function RecordingPanel({
  accountId,
  dealId,
  meeting,
  onChanged,
}: {
  accountId: string;
  dealId: string;
  meeting: MeetingRow;
  onChanged: () => void;
}) {
  const supabase = useSupabase();
  const fileRef = useRef<HTMLInputElement>(null);
  const [transcript, setTranscript] = useState('');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onUpload() {
    const file = fileRef.current?.files?.[0];

    if (!file) {
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const { path, token } = await createMeetingRecordingUploadUrl({
          deal_id: dealId,
          meeting_id: meeting.id,
          filename: file.name,
        });

        const { error: uploadError } = await supabase.storage
          .from(RECORDING_BUCKET)
          .uploadToSignedUrl(path, token, file);

        if (uploadError) {
          throw uploadError;
        }

        await attachMeetingRecording({
          id: meeting.id,
          deal_id: dealId,
          recording_path: path,
        });

        onChanged();
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : 'Could not upload recording',
        );
      }
    });
  }

  function onSaveTranscript() {
    if (transcript === '') {
      return;
    }

    setError(null);
    startTransition(async () => {
      await attachMeetingRecording({
        id: meeting.id,
        deal_id: dealId,
        transcript_text: transcript,
      });
      onChanged();
    });
  }

  function onSummarize() {
    if (transcript === '') {
      return;
    }

    setError(null);
    startTransition(async () => {
      await summarizeMeeting({
        id: meeting.id,
        deal_id: dealId,
        account_id: accountId,
        transcript_text: transcript,
      });
      onChanged();
    });
  }

  return (
    <div className={'flex flex-col gap-2'}>
      {meeting.recording_path ? (
        <Badge variant={'outline'}>Recording uploaded</Badge>
      ) : null}

      <div className={'flex items-center gap-2'}>
        <Input ref={fileRef} type={'file'} className={'w-56'} />
        <Button
          type={'button'}
          size={'sm'}
          variant={'outline'}
          disabled={pending}
          onClick={onUpload}
        >
          Upload
        </Button>
      </div>

      <Textarea
        placeholder={'Paste transcript'}
        value={transcript}
        onChange={(event) => setTranscript(event.target.value)}
      />
      <div className={'flex gap-2'}>
        <Button
          type={'button'}
          size={'sm'}
          variant={'outline'}
          disabled={pending}
          onClick={onSaveTranscript}
        >
          Save transcript
        </Button>
        <Button
          type={'button'}
          size={'sm'}
          disabled={pending}
          onClick={onSummarize}
        >
          Summarize
        </Button>
      </div>

      {meeting.summary ? (
        <p className={'text-muted-foreground text-sm'}>{meeting.summary}</p>
      ) : null}

      {error === null ? null : (
        <p className={'text-destructive text-sm'}>{error}</p>
      )}
    </div>
  );
}
