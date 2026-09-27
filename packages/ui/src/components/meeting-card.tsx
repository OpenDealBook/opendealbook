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
import { ClockIcon } from 'lucide-react';

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
    <Card data-slot="meeting-card" data-status={status}>
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
            <span data-slot="meeting-card-status" data-status={status}>
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
