import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

import { turnTeamBillingOn } from '@odb/supabase/test-support/team-billing';

import {
  admin,
  removeEverythingSeeded,
} from '../../asks/integration-harness';
import { syncNudgeTodos } from './todo-sync';
import { DB_URL, seedQuietTeam } from './test-support';

const DAY = 86_400_000;

async function todosOf(userId: string, dealId: string) {
  const { data } = await admin
    .from('personal_todo')
    .select('id, title, done')
    .eq('user_id', userId)
    .eq('deal_id', dealId)
    .order('created_at')
    .throwOnError();

  return data;
}

async function hearFromLender(roomId: string, accountId: string, daysAgo: number) {
  const db = new pg.Client({ connectionString: DB_URL });
  await db.connect();
  try {
    await db.query('delete from public.lender_room_email_reply where room_id = $1', [
      roomId,
    ]);
    await db.query(
      `insert into public.lender_room_email_reply (room_id, account_id, received_at, provider_message_id)
       values ($1, $2, now() - make_interval(days => $3), gen_random_uuid()::text)`,
      [roomId, accountId, daysAgo],
    );
  } finally {
    await db.end();
  }
}

afterAll(removeEverythingSeeded);

describe('syncNudgeTodos (integration)', () => {
  it('gives each deal manager one to-do on the deal for a room due a nudge, however often it runs', async () => {
    const { owner, colleague, teamId, dealId } = await seedQuietTeam(30);

    await syncNudgeTodos(admin, teamId);
    await syncNudgeTodos(admin, teamId);

    expect(await todosOf(owner.userId, dealId)).toEqual([
      { id: expect.any(String), title: 'Nudge Quiet Bank, quiet 30 days', done: false },
    ]);
    expect(await todosOf(colleague.userId, dealId)).toEqual([]);
  });

  it('converges to one to-do after a run that made the to-do but died before linking it', async () => {
    const { owner, teamId, dealId, roomId } = await seedQuietTeam(30);
    await syncNudgeTodos(admin, teamId);
    await admin
      .from('lender_nudge_todo')
      .delete()
      .eq('room_id', roomId)
      .throwOnError();

    await syncNudgeTodos(admin, teamId);

    expect(await todosOf(owner.userId, dealId)).toHaveLength(1);
  });

  it('removes the to-do once the room is no longer due, and makes a new one when it goes quiet again', async () => {
    const { owner, teamId, dealId, roomId } = await seedQuietTeam(30);
    await syncNudgeTodos(admin, teamId);
    const [first] = await todosOf(owner.userId, dealId);

    await hearFromLender(roomId, teamId, 0);
    await syncNudgeTodos(admin, teamId);
    expect(await todosOf(owner.userId, dealId)).toEqual([]);

    await hearFromLender(roomId, teamId, 9);
    await syncNudgeTodos(admin, teamId);
    const again = await todosOf(owner.userId, dealId);
    expect(again).toEqual([
      { id: expect.any(String), title: 'Nudge Quiet Bank, quiet 9 days', done: false },
    ]);
    expect(again[0]!.id).not.toBe(first!.id);
  });

  it('leaves a ticked to-do ticked while the room is still due', async () => {
    const { owner, teamId, dealId } = await seedQuietTeam(30);
    await syncNudgeTodos(admin, teamId);
    const [todo] = await todosOf(owner.userId, dealId);
    await admin
      .from('personal_todo')
      .update({ done: true })
      .eq('id', todo!.id)
      .throwOnError();

    await syncNudgeTodos(admin, teamId);

    expect(await todosOf(owner.userId, dealId)).toEqual([
      { id: todo!.id, title: 'Nudge Quiet Bank, quiet 30 days', done: true },
    ]);
  });

  it('keeps a to-do the teammate deleted gone for the rest of that quiet spell, and makes one for the next spell', async () => {
    const { owner, teamId, dealId, roomId } = await seedQuietTeam(30);
    await syncNudgeTodos(admin, teamId);
    const [todo] = await todosOf(owner.userId, dealId);
    await owner.client
      .from('personal_todo')
      .delete()
      .eq('id', todo!.id)
      .throwOnError();

    await syncNudgeTodos(admin, teamId);
    expect(await todosOf(owner.userId, dealId)).toEqual([]);

    await hearFromLender(roomId, teamId, 0);
    await syncNudgeTodos(admin, teamId);
    await hearFromLender(roomId, teamId, 9);
    await syncNudgeTodos(admin, teamId);

    expect(await todosOf(owner.userId, dealId)).toEqual([
      { id: expect.any(String), title: 'Nudge Quiet Bank, quiet 9 days', done: false },
    ]);
  });

  it('removes the open to-do of a teammate who no longer manages deals', async () => {
    const { colleague, teamId, dealId } = await seedQuietTeam(30);
    const setRole = (account_role: string) =>
      admin
        .from('accounts_memberships')
        .update({ account_role })
        .eq('account_id', teamId)
        .eq('user_id', colleague.userId)
        .throwOnError();
    await setRole('owner');
    await syncNudgeTodos(admin, teamId);
    expect(await todosOf(colleague.userId, dealId)).toHaveLength(1);

    await setRole('member');
    await syncNudgeTodos(admin, teamId);

    expect(await todosOf(colleague.userId, dealId)).toEqual([]);
  });

  it('makes no to-do for a team locked for billing', async () => {
    await turnTeamBillingOn(admin);
    const { owner, teamId, dealId } = await seedQuietTeam(30);
    await admin
      .from('accounts')
      .update({ trial_ends_at: new Date(Date.now() - DAY).toISOString() })
      .eq('id', teamId)
      .throwOnError();

    await syncNudgeTodos(admin, teamId);

    expect(await todosOf(owner.userId, dealId)).toEqual([]);
  });
});
