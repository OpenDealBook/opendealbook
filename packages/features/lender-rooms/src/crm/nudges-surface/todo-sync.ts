import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';

import { createHash } from 'node:crypto';

import { dealManagerIds } from '../../actions/deal-manager-ids';
import { listLendersToNudge } from '../nudges/nudges';

// A retry after a crash between the two inserts must find the to-do it already
// made, so its id is derived from the room, the teammate and the quiet spell.
function todoId(roomId: string, userId: string, dueSince: string): string {
  const hex = createHash('sha256')
    .update(`${roomId}/${userId}/${Date.parse(dueSince)}`)
    .digest('hex');
  const variant = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export async function syncNudgeTodos(
  admin: SupabaseClient<Database>,
  accountId: string,
): Promise<void> {
  const { data: locked } = await admin
    .rpc('is_account_locked', { target_account_id: accountId })
    .throwOnError();
  if (locked) {
    return;
  }

  const dueRooms = (await listLendersToNudge(admin, accountId)).flatMap(
    (lender) => lender.deals.map((deal) => ({ ...deal, lender })),
  );
  const dueRoomIds = new Set(dueRooms.map((room) => room.roomId));

  const managerIds = await dealManagerIds(admin, accountId);
  const managers = new Set(managerIds);

  const { data: links } = await admin
    .from('lender_nudge_todo')
    .select(
      'room_id, user_id, todo_id, personal_todo(done), lender_room!inner(account_id)',
    )
    .eq('lender_room.account_id', accountId)
    .throwOnError();

  const quietOver = links.filter((link) => !dueRoomIds.has(link.room_id));
  const cleared = links.filter(
    (link) =>
      !dueRoomIds.has(link.room_id) ||
      (!managers.has(link.user_id) && link.personal_todo?.done === false),
  );
  const clearedTodoIds = cleared.flatMap((link) => link.todo_id ?? []);
  if (clearedTodoIds.length > 0) {
    await admin
      .from('personal_todo')
      .delete()
      .in('id', clearedTodoIds)
      .throwOnError();
  }
  if (quietOver.length > 0) {
    await admin
      .from('lender_nudge_todo')
      .delete()
      .in(
        'room_id',
        quietOver.map((link) => link.room_id),
      )
      .throwOnError();
  }

  const linked = new Set(links.map((link) => `${link.room_id}/${link.user_id}`));

  for (const userId of managerIds) {
    for (const room of dueRooms) {
      if (linked.has(`${room.roomId}/${userId}`)) {
        continue;
      }

      const id = todoId(room.roomId, userId, room.dueSince);
      await admin
        .from('personal_todo')
        .upsert(
          {
            id,
            account_id: accountId,
            deal_id: room.dealId,
            user_id: userId,
            title: `Nudge ${room.lender.lenderName}, quiet ${room.daysSilent} days`,
          },
          { onConflict: 'id', ignoreDuplicates: true },
        )
        .throwOnError();
      await admin
        .from('lender_nudge_todo')
        .insert({ room_id: room.roomId, user_id: userId, todo_id: id })
        .throwOnError();
    }
  }
}
