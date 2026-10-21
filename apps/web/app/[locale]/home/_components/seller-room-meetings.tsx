'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import {
  shareSellerRoomMeeting,
  unshareSellerRoomMeeting,
} from '@odb/seller-rooms/meetings/actions.ts';
import { meetingLabel } from '@odb/seller-rooms/meetings/meeting-label.ts';
import type { TeamMeeting } from '@odb/seller-rooms/meetings/queries.ts';

export function SellerRoomMeetings({
  dealId,
  meetings,
}: {
  dealId: string;
  meetings: TeamMeeting[];
}) {
  const router = useRouter();
  const [refusal, setRefusal] = useState<string | null>(null);

  async function toggle(meeting: TeamMeeting) {
    const change = meeting.shared
      ? unshareSellerRoomMeeting
      : shareSellerRoomMeeting;
    const result = await change({ dealId, meetingId: meeting.id });

    setRefusal(result.ok ? null : result.refusal);
    router.refresh();
  }

  return (
    <fieldset className={'flex flex-col gap-1'}>
      <legend className={'text-sm font-medium'}>
        Meetings sellers see (transcript and summary)
      </legend>
      <p className={'text-muted-foreground text-sm'}>
        Sellers see the full transcript and summary of every meeting you share.
      </p>
      {meetings.map((meeting) => (
        <label key={meeting.id} className={'flex items-center gap-2 text-sm'}>
          <input
            type={'checkbox'}
            checked={meeting.shared}
            onChange={() => void toggle(meeting)}
          />
          {meetingLabel(meeting)}
        </label>
      ))}
      {refusal ? (
        <p role={'alert'} className={'text-destructive text-sm'}>
          {refusal}
        </p>
      ) : null}
    </fieldset>
  );
}
