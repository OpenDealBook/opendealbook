import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';

type Admin = SupabaseClient<Database>;

export type RoomKind = 'seller' | 'lender';

export interface ClosingRoom {
  kind: RoomKind;
  roomId: string;
}

export interface CloseState {
  ready: boolean;
  hasOwnTodo: boolean;
}

export async function closeState(
  admin: Admin,
  room: ClosingRoom,
  userId: string,
): Promise<CloseState> {
  const [{ data: ready }, { data: own }] = await Promise.all([
    admin
      .rpc('room_close_ready', { room_kind: room.kind, room_id: room.roomId })
      .throwOnError(),
    admin
      .from('room_closing_todo')
      .select('todo_id')
      .eq('room_kind', room.kind)
      .eq('room_id', room.roomId)
      .eq('user_id', userId)
      .maybeSingle()
      .throwOnError(),
  ]);

  return { ready, hasOwnTodo: own !== null };
}

export async function prepareRoomClose(
  admin: Admin,
  room: ClosingRoom & { accountId: string; dealId: string; title: string },
  userId: string,
): Promise<void> {
  if ((await closeState(admin, room, userId)).hasOwnTodo) {
    return;
  }

  const { data: todo } = await admin
    .from('personal_todo')
    .insert({
      account_id: room.accountId,
      deal_id: room.dealId,
      user_id: userId,
      title: room.title,
    })
    .select('id')
    .single()
    .throwOnError();

  await admin
    .from('room_closing_todo')
    .insert({
      room_kind: room.kind,
      room_id: room.roomId,
      user_id: userId,
      todo_id: todo.id,
    })
    .throwOnError();
}

export async function forgetRoomClosing(
  admin: Admin,
  room: ClosingRoom,
): Promise<void> {
  await admin
    .from('room_closing_todo')
    .delete()
    .eq('room_kind', room.kind)
    .eq('room_id', room.roomId)
    .throwOnError();
}
