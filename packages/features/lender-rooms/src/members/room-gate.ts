import {
  isAuthApiError,
  isAuthSessionMissingError,
  type SupabaseClient,
} from '@supabase/supabase-js';

import { z } from 'zod';

import type { Database } from '@odb/supabase';

import type { RoomGateDecision } from './entry-rules';

export async function isSignedIn(
  client: SupabaseClient<Database>,
): Promise<boolean> {
  const { data, error } = await client.auth.getUser();

  const signedOut =
    isAuthSessionMissingError(error) ||
    (isAuthApiError(error) && (error.status === 401 || error.status === 403));

  if (error && !signedOut) {
    throw error;
  }

  return Boolean(data.user);
}

export async function loadRoomGate(
  client: SupabaseClient<Database>,
  roomId: string,
): Promise<RoomGateDecision> {
  if (!(await isSignedIn(client))) {
    return { kind: 'sign-in', path: `/lender/sign-in?next=/lender/${roomId}` };
  }

  if (!z.uuid().safeParse(roomId).success) {
    return { kind: 'not-found' };
  }

  const { data: room } = await client
    .rpc('lender_room_view', { room_id: roomId })
    .maybeSingle()
    .throwOnError();

  if (!room) {
    return { kind: 'not-found' };
  }

  return { kind: room.is_open ? 'open' : 'closed', room };
}

export async function hasLenderRooms(
  client: SupabaseClient<Database>,
): Promise<boolean> {
  const { data: rooms } = await client.rpc('my_lender_rooms').throwOnError();

  return rooms.length > 0;
}

export async function myOpenRoomIds(
  client: SupabaseClient<Database>,
): Promise<string[]> {
  const { data: rooms } = await client.rpc('my_lender_rooms').throwOnError();

  return rooms.filter((room) => room.is_open).map((room) => room.id!);
}
