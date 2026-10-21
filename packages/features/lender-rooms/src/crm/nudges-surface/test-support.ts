import pg from 'pg';

import {
  admin,
  provisionPerson,
  seedRoom,
  seedTeamDeal,
} from '../../asks/integration-harness';

export const DB_URL =
  process.env.SUPABASE_DB_URL ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const DAY = 86_400_000;

export async function backdateRoom(roomId: string, daysAgo: number) {
  const db = new pg.Client({ connectionString: DB_URL });
  await db.connect();
  try {
    await db.query('begin');
    await db.query('set local session_replication_role = replica');
    await db.query(
      'update public.lender_room set created_at = now() - make_interval(days => $2) where id = $1',
      [roomId, daysAgo],
    );
    await db.query('commit');
  } finally {
    await db.end();
  }
}

export async function seedQuietTeam(daysQuiet = 30) {
  const owner = await provisionPerson();
  const colleague = await provisionPerson();
  const deal = await seedTeamDeal(owner, colleague);
  const { roomId } = await seedRoom(deal, 'Quiet Bank', []);

  await admin
    .from('lender_room_outreach')
    .insert({
      room_id: roomId,
      account_id: deal.accountId,
      sent_by: owner.userId,
      sent_at: new Date(Date.now() - daysQuiet * DAY).toISOString(),
      status: 'sent',
      to_email: 'banker@quiet.test',
      subject: 'Our deal',
      body: 'Take a look',
    })
    .throwOnError();
  await backdateRoom(roomId, daysQuiet);

  return { owner, colleague, teamId: deal.accountId, dealId: deal.dealId, roomId };
}
