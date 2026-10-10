import * as React from 'react';

import { Avatar, AvatarFallback } from '#components/avatar';
import { Button } from '#components/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#components/card';
import { cn } from '#lib/utils';
import { ClockIcon } from 'lucide-react';

// meeting.status, see public.meeting_status in 53-meeting.sql.
const meetingCardAccent: Record<string, string> = {
  scheduled: 'border-l-brass',
  held: 'border-l-success',
  skipped: 'border-l-muted-foreground/40',
  cancelled: 'border-l-destructive',
};

const meetingCardStatusTint: Record<string, string> = {
  scheduled: 'bg-brass/10 text-brass',
  held: 'bg-success/10 text-success',
  skipped: 'text-muted-foreground',
  cancelled: 'bg-destructive/10 text-destructive',
};

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function MeetingCard({
  title,
  startsAt,
  durationMins,
  attendees,
  status,
  joinUrl,
}: {
  title: string;
  startsAt: string;
  durationMins?: number;
  attendees?: string[];
  status?: string;
  joinUrl?: string;
}) {
  return (
    <Card
      data-slot="meeting-card"
      data-status={status}
      className={cn(
        'border-l-4',
        status ? meetingCardAccent[status] : undefined,
      )}
    >
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription
          data-slot="meeting-card-time"
          className="flex flex-wrap items-center gap-x-2"
        >
          <span
            data-slot="meeting-card-starts"
            className="flex items-center gap-1"
          >
            <ClockIcon />
            {startsAt}
          </span>
          {durationMins !== undefined ? (
            <span data-slot="meeting-card-duration">{durationMins}m</span>
          ) : null}
          {status ? (
            <span
              data-slot="meeting-card-status"
              data-status={status}
              className={cn(
                'rounded-sm px-1 py-0.5',
                meetingCardStatusTint[status],
              )}
            >
              {status}
            </span>
          ) : null}
        </CardDescription>
        {joinUrl ? (
          <CardAction>
            <Button asChild data-slot="meeting-card-join">
              <a href={joinUrl}>Join</a>
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      {attendees && attendees.length > 0 ? (
        <CardContent>
          <div
            data-slot="meeting-card-attendees"
            className="flex flex-wrap items-center gap-2"
          >
            {attendees.map((attendee) => (
              <Avatar key={attendee} data-slot="meeting-card-attendee">
                <AvatarFallback>{initials(attendee)}</AvatarFallback>
              </Avatar>
            ))}
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}

export { MeetingCard };
