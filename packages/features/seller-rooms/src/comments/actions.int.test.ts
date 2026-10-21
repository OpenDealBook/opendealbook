import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  ANON_KEY,
  SERVICE_ROLE_KEY,
  SUPABASE_URL,
  admin,
  cleanUp,
  newDeal,
  provisionPerson,
  provisionTeam,
  type Person,
} from '../test-support/world';

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON_KEY);
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY);

const world = vi.hoisted(() => ({ signedInClient: null as unknown }));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => world.signedInClient,
}));

const { postSellerRoomComment } = await import('./actions');

let owner: Person;
let seller: Person;
let counsel: Person;
let teamId: string;
let roomId: string;
let questionId: string;

async function commentsOnQuestion() {
  const { data } = await admin
    .from('seller_room_comment')
    .select('body')
    .eq('question_id', questionId)
    .throwOnError();

  return data.map((comment) => comment.body);
}

beforeAll(async () => {
  [owner, seller, counsel] = await Promise.all([
    provisionPerson(),
    provisionPerson(),
    provisionPerson(),
  ]);
  teamId = await provisionTeam(owner, 'Harbor Holdings');
  const dealId = await newDeal(teamId, owner);
  const { data } = await owner.client
    .rpc('ensure_seller_room', { deal_id: dealId })
    .throwOnError();
  roomId = data;

  await admin
    .from('seller_room_member')
    .insert({
      room_id: roomId,
      user_id: seller.userId,
      email: seller.email,
      name: 'Walt Brennan',
    })
    .throwOnError();
  await admin
    .from('deal_counsel')
    .insert({
      account_id: teamId,
      deal_id: dealId,
      side: 'seller',
      user_id: counsel.userId,
      email: counsel.email,
      name: 'Owen Castillo',
      invited_by: seller.userId,
    })
    .throwOnError();
  const { data: question } = await admin
    .from('seller_room_question')
    .insert({ room_id: roomId, account_id: teamId, title: 'Payroll?' })
    .select('id')
    .single()
    .throwOnError();
  questionId = question.id;
  world.signedInClient = counsel.client;
});

afterAll(async () => {
  await cleanUp([teamId]);
});

describe('postSellerRoomComment', () => {
  it("records seller's counsel comment on a question", async () => {
    expect(
      await postSellerRoomComment({
        roomId,
        subject: { question_id: questionId },
        body: 'Answer with the lease change only',
      }),
    ).toEqual({ ok: true, value: undefined });
    expect(await commentsOnQuestion()).toEqual([
      'Answer with the lease change only',
    ]);
  });

  it('refuses once the room closes, saying why, and records nothing', async () => {
    await admin
      .from('seller_room')
      .update({ closed_at: new Date().toISOString() })
      .eq('id', roomId)
      .throwOnError();

    const posted = await postSellerRoomComment({
      roomId,
      subject: { question_id: questionId },
      body: 'Too late',
    });

    await admin
      .from('seller_room')
      .update({ closed_at: null })
      .eq('id', roomId)
      .throwOnError();
    expect(posted).toEqual({
      ok: false,
      refusal: 'The seller room is closed, so this is read-only.',
    });
    expect(await commentsOnQuestion()).toEqual([
      'Answer with the lease change only',
    ]);
  });
});
