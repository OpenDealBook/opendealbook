import { getLocale } from 'next-intl/server';
import { z } from 'zod';

import { RoomPage } from '@odb/lender-rooms/browser/room-page.tsx';
import { enterLenderRoom } from '@odb/lender-rooms/members/enter-room.ts';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { TimelineQuestion } from '../../home/_components/lender-crm/timeline-question';
import { viewerTimeZone } from '../../home/_components/viewer-time-zone';
import { MainContacts } from './main-contacts';
import { SharedTimeline } from './shared-timeline';
import { SharedUpdates } from './shared-updates';

export default async function LenderRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  const gate = await enterLenderRoom(roomId);

  if (gate.kind === 'closed') {
    return null;
  }

  const client = getSupabaseServerClient();
  const [
    { data: contacts },
    { data: milestones },
    { data: updates },
    { data: timelineAnswer },
  ] = await Promise.all([
    client.rpc('lender_room_main_contacts', { room_id: roomId }).throwOnError(),
    client.rpc('lender_room_timeline', { room_id: roomId }).throwOnError(),
    client.rpc('lender_room_updates', { room_id: roomId }).throwOnError(),
    client
      .from('lender_room_timeline_answer')
      .select('answer, note, earliest_close_date')
      .eq('room_id', roomId)
      .maybeSingle()
      .throwOnError(),
  ]);
  const closeBy = gate.room.must_close_by ?? gate.room.target_close_date;
  const [locale, timeZone] = await Promise.all([
    getLocale(),
    viewerTimeZone(null),
  ]);

  return (
    <>
      <RoomPage
        room={gate.room}
        locale={locale}
        timeZone={timeZone}
        question={
          closeBy ? (
            <TimelineQuestion
              roomId={roomId}
              teamName={z.string().parse(gate.room.buyer_team)}
              closeBy={closeBy}
              reason={gate.room.must_close_reason}
              stored={timelineAnswer}
            />
          ) : null
        }
      />
      <MainContacts contacts={contacts} />
      <SharedTimeline milestones={milestones} />
      <SharedUpdates updates={updates} />
    </>
  );
}
