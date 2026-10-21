import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';

type Client = SupabaseClient<Database>;

export interface TeamMeeting {
  id: string;
  type: string;
  scheduled_at: string | null;
  shared: boolean;
}

export type SellerMeeting =
  Database['public']['Functions']['seller_room_meetings']['Returns'][number];

export async function loadSellerMeetings(
  client: Client,
  dealId: string,
): Promise<TeamMeeting[]> {
  const [{ data: meetings }, { data: room }] = await Promise.all([
    client
      .from('meeting')
      .select('id, type, scheduled_at')
      .eq('deal_id', dealId)
      .order('scheduled_at', { ascending: false, nullsFirst: false })
      .throwOnError(),
    client
      .from('seller_room')
      .select('seller_room_meeting(meeting_id)')
      .eq('deal_id', dealId)
      .maybeSingle()
      .throwOnError(),
  ]);

  const shared = new Set(
    room?.seller_room_meeting.map((row) => row.meeting_id),
  );

  return meetings.map((meeting) => ({
    ...meeting,
    shared: shared.has(meeting.id),
  }));
}

export async function listSharedMeetings(
  client: Client,
  roomId: string,
): Promise<SellerMeeting[]> {
  const { data } = await client
    .rpc('seller_room_meetings', { room_id: roomId })
    .throwOnError();

  return data;
}

export async function openSellerMeeting(
  client: Client,
  admin: Client,
  roomId: string,
  meetingId: string,
): Promise<SellerMeeting | null> {
  const [{ data: member }, { data: user }] = await Promise.all([
    client.rpc('is_seller_room_member', { room_id: roomId }).throwOnError(),
    client.auth.getUser(),
  ]);

  if (!member || !user.user) {
    return null;
  }

  const meeting = (await listSharedMeetings(client, roomId)).find(
    (shared) => shared.id === meetingId,
  );

  if (!meeting) {
    return null;
  }

  const { data: room } = await admin
    .from('seller_room')
    .select('account_id')
    .eq('id', roomId)
    .single()
    .throwOnError();

  await admin
    .from('seller_room_activity')
    .insert({
      room_id: roomId,
      account_id: room.account_id,
      user_id: user.user.id,
      side: 'seller',
      action: 'meeting_opened',
      payload: { meeting_id: meetingId },
    })
    .throwOnError();

  return meeting;
}
