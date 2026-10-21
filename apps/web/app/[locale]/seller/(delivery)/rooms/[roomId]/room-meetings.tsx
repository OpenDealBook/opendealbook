import Link from 'next/link';

import { meetingLabel } from '@odb/seller-rooms/meetings/meeting-label.ts';
import type { SellerMeeting } from '@odb/seller-rooms/meetings/queries.ts';
import { sellerRoomPath } from '@odb/seller-rooms/members/entry-rules.ts';

export function RoomMeetings({
  roomId,
  meetings,
}: {
  roomId: string;
  meetings: SellerMeeting[];
}) {
  if (meetings.length === 0) {
    return null;
  }

  return (
    <section className={'flex flex-col gap-2'}>
      <h2 className={'text-lg font-semibold'}>Meetings</h2>
      <ul className={'flex flex-col gap-1'}>
        {meetings.map((meeting) => (
          <li key={meeting.id}>
            <Link
              href={`${sellerRoomPath(roomId)}/meetings/${meeting.id}`}
              className={'underline'}
            >
              {meetingLabel(meeting)}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
