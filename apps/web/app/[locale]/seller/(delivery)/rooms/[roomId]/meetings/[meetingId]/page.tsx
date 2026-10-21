import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { z } from 'zod';

import { isSignedIn } from '@odb/lender-rooms/members/room-gate.ts';
import { meetingLabel } from '@odb/seller-rooms/meetings/meeting-label.ts';
import { openSellerMeeting } from '@odb/seller-rooms/meetings/queries.ts';
import {
  sellerRoomPath,
  sellerSignInPath,
} from '@odb/seller-rooms/members/entry-rules.ts';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

export default async function SellerMeetingPage({
  params,
}: {
  params: Promise<{ roomId: string; meetingId: string }>;
}) {
  const { roomId, meetingId } = await params;

  if (
    !z.uuid().safeParse(roomId).success ||
    !z.uuid().safeParse(meetingId).success
  ) {
    notFound();
  }

  const client = getSupabaseServerClient();

  if (!(await isSignedIn(client))) {
    redirect(sellerSignInPath(sellerRoomPath(roomId)));
  }

  const meeting = await openSellerMeeting(
    client,
    getSupabaseServerAdminClient(),
    roomId,
    meetingId,
  );

  if (!meeting) {
    notFound();
  }

  return (
    <main className={'flex flex-col gap-4'}>
      <Link href={sellerRoomPath(roomId)} className={'text-sm underline'}>
        Back to the room
      </Link>
      <h1 className={'text-2xl font-semibold'}>{meetingLabel(meeting)}</h1>
      {meeting.summary ? (
        <section className={'flex flex-col gap-2'}>
          <h2 className={'text-lg font-semibold'}>Summary</h2>
          <p className={'whitespace-pre-wrap'}>{meeting.summary}</p>
        </section>
      ) : null}
      {meeting.transcript_text ? (
        <section className={'flex flex-col gap-2'}>
          <h2 className={'text-lg font-semibold'}>Transcript</h2>
          <p className={'whitespace-pre-wrap'}>{meeting.transcript_text}</p>
        </section>
      ) : null}
    </main>
  );
}
