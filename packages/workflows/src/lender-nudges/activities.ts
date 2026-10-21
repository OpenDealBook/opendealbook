import { emailLendersToNudge } from '@odb/lender-rooms/crm/nudges-surface/daily-email.ts';
import { syncNudgeTodos } from '@odb/lender-rooms/crm/nudges-surface/todo-sync.ts';
import { createNovuClient } from '@odb/notifications/server';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

async function lenderRoomTeams(
  admin: ReturnType<typeof getSupabaseServerAdminClient>,
) {
  const { data: rooms } = await admin
    .from('lender_room')
    .select('account_id')
    .throwOnError();

  return new Set(rooms.map((room) => room.account_id));
}

export async function syncLenderNudgeTodos(): Promise<void> {
  const admin = getSupabaseServerAdminClient();

  for (const accountId of await lenderRoomTeams(admin)) {
    await syncNudgeTodos(admin, accountId);
  }
}

export async function emailLendersToNudgeDue(now: string): Promise<void> {
  if (!process.env.NOVU_API_KEY || !process.env.NOVU_API_URL) {
    return;
  }

  const admin = getSupabaseServerAdminClient();
  const novu = createNovuClient();

  for (const accountId of await lenderRoomTeams(admin)) {
    await emailLendersToNudge({ admin, novu }, accountId, new Date(now));
  }
}
