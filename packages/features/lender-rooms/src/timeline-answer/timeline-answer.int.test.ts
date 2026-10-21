import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type { ActionResult } from '../actions/refusal';
import { unwrap } from '../actions/test-support/unwrap';
import {
  type Person,
  admin,
  provisionPerson,
  removeEverythingSeeded,
  seedRoom,
  seedTeamDeal,
} from '../asks/integration-harness';

interface SentNotification {
  eventType: string;
  recipientUserId: string;
  payload: unknown;
}

const harness = vi.hoisted(() => ({
  client: null as unknown,
  user: null as unknown,
  sent: [] as SentNotification[],
}));

vi.mock('@odb/next/actions', () => ({
  enhanceAction:
    (
      fn: (input: unknown, user: unknown) => unknown,
      config: { schema: { parse: (input: unknown) => unknown } },
    ) =>
    async (input: unknown) =>
      fn(config.schema.parse(input), harness.user),
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => harness.client,
}));

vi.mock('@odb/notifications/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@odb/notifications/server')>()),
  createNovuClient: () => ({
    trigger: async (
      eventType: string,
      data: { to: { subscriberId: string }; payload: unknown },
    ) => {
      harness.sent.push({
        eventType,
        recipientUserId: data.to.subscriberId,
        payload: data.payload,
      });
    },
  }),
}));

import { recordTimelineAnswer } from './internal-actions';
import { answerTimeline } from './lender-actions';

const NOT_A_MEMBER = 'You are not a member of this lender room';

type Action = (data: Record<string, unknown>) => Promise<ActionResult<void>>;

function as(person: Person, action: unknown) {
  return (data: Record<string, unknown>) => {
    harness.client = person.client;
    harness.user = { id: person.userId };
    return unwrap((action as Action)(data));
  };
}

async function answerRows(roomId: string) {
  const { data } = await admin
    .from('lender_room_timeline_answer')
    .select('answer, answered_by, source')
    .eq('room_id', roomId)
    .throwOnError();
  return data;
}

async function detailRows(roomId: string) {
  const { data } = await admin
    .from('lender_room_timeline_answer')
    .select('note, earliest_close_date')
    .eq('room_id', roomId)
    .throwOnError();
  return data;
}

let us: Person;
let colleague: Person;
let lenderA: Person;
let lenderA2: Person;
let outsider: Person;
let deal: { accountId: string; dealId: string };
let room: { roomId: string };
let closedRoom: { roomId: string };
let lockedRoom: { roomId: string };

beforeAll(async () => {
  process.env.NOVU_API_KEY = 'test-key';
  process.env.NOVU_API_URL = 'http://novu.test';

  [us, colleague, lenderA, lenderA2, outsider] = await Promise.all([
    provisionPerson(),
    provisionPerson(),
    provisionPerson(),
    provisionPerson(),
    provisionPerson(),
  ]);

  deal = await seedTeamDeal(us, colleague);
  room = await seedRoom(deal, 'Bank A', [lenderA, lenderA2]);
  closedRoom = await seedRoom(deal, 'Bank C', [lenderA]);
  await admin
    .from('lender_room')
    .update({ closed_at: new Date().toISOString() })
    .eq('id', closedRoom.roomId)
    .throwOnError();

  const lockedDeal = await seedTeamDeal(us, colleague);
  lockedRoom = await seedRoom(lockedDeal, 'Bank D', [lenderA]);
  await admin
    .from('accounts')
    .update({
      trial_ends_at: new Date(Date.now() - 86_400_000).toISOString(),
    })
    .eq('id', lockedDeal.accountId)
    .throwOnError();
}, 60_000);

beforeEach(async () => {
  harness.sent.length = 0;
  await admin
    .from('lender_room_timeline_answer')
    .delete()
    .eq('room_id', room.roomId)
    .throwOnError();
});

afterAll(removeEverythingSeeded);

describe('a lender answering the closing timeline', () => {
  it('records the answer from that lender and tells everyone on our team once', async () => {
    await as(
      lenderA,
      answerTimeline,
    )({
      roomId: room.roomId,
      answer: 'need_to_talk',
    });

    expect(await answerRows(room.roomId)).toEqual([
      { answer: 'need_to_talk', answered_by: lenderA.userId, source: 'lender' },
    ]);
    expect(
      harness.sent.map(({ recipientUserId }) => recipientUserId).toSorted(),
    ).toEqual([us.userId, colleague.userId].toSorted());
    expect(harness.sent[0]).toMatchObject({
      eventType: 'lender_room.timeline_answered',
      payload: { roomId: room.roomId, answer: 'need_to_talk' },
    });
  });

  it('rings the bell once for every member of our account for each new answer', async () => {
    await as(lenderA, answerTimeline)({ roomId: room.roomId, answer: 'yes' });

    const { data: answer } = await admin
      .from('lender_room_timeline_answer')
      .select('answered_at')
      .eq('room_id', room.roomId)
      .single()
      .throwOnError();
    const { data: team } = await admin
      .from('accounts')
      .select('slug')
      .eq('id', deal.accountId)
      .single()
      .throwOnError();
    const eventKey = `${room.roomId}:${new Date(answer.answered_at).toISOString()}`;

    const { data: rung } = await admin
      .from('notifications')
      .select('recipient_user_id, deal_id, body, link, dedupe_key')
      .eq('account_id', deal.accountId)
      .like('dedupe_key', `lender_room.timeline_answered:${eventKey}:%`)
      .order('recipient_user_id')
      .throwOnError();

    expect(rung).toEqual(
      [us.userId, colleague.userId].toSorted().map((userId) => ({
        recipient_user_id: userId,
        deal_id: deal.dealId,
        body: 'Bank A answered your closing timeline question on Lender asks deal',
        link: `/home/${team.slug}/deals/${deal.dealId}/lenders#lender-timeline-answer-${room.roomId}`,
        dedupe_key: `lender_room.timeline_answered:${eventKey}:${userId}`,
      })),
    );
  });

  it('keeps only the latest answer, from whichever member gave it', async () => {
    await as(lenderA, answerTimeline)({ roomId: room.roomId, answer: 'yes' });
    await as(lenderA2, answerTimeline)({ roomId: room.roomId, answer: 'no' });

    expect(await answerRows(room.roomId)).toEqual([
      { answer: 'no', answered_by: lenderA2.userId, source: 'lender' },
    ]);
  });

  it('refuses a person who is not in the room, recording and telling nobody', async () => {
    await expect(
      as(outsider, answerTimeline)({ roomId: room.roomId, answer: 'yes' }),
    ).rejects.toThrow(NOT_A_MEMBER);

    expect(await answerRows(room.roomId)).toEqual([]);
    expect(harness.sent).toEqual([]);
  });

  it('tells our team once when the answer is new or changed, and not when repeated', async () => {
    const send = (answer: string) =>
      as(lenderA, answerTimeline)({ roomId: room.roomId, answer });

    await send('yes');
    expect(harness.sent).toHaveLength(2);

    harness.sent.length = 0;
    await send('yes');
    expect(harness.sent).toEqual([]);

    await send('no');
    expect(harness.sent).toHaveLength(2);
    expect(await answerRows(room.roomId)).toEqual([
      { answer: 'no', answered_by: lenderA.userId, source: 'lender' },
    ]);
  });

  it("keeps the lender's note, and for no, the earliest date the lender can close", async () => {
    await as(
      lenderA,
      answerTimeline,
    )({
      roomId: room.roomId,
      answer: 'no',
      note: 'Appraisal takes six weeks',
      earliestCloseDate: '2027-05-15',
    });

    expect(await detailRows(room.roomId)).toEqual([
      { note: 'Appraisal takes six weeks', earliest_close_date: '2027-05-15' },
    ]);

    await as(
      lenderA,
      answerTimeline,
    )({
      roomId: room.roomId,
      answer: 'yes',
      note: 'We can make it after all',
      earliestCloseDate: null,
    });

    expect(await detailRows(room.roomId)).toEqual([
      { note: 'We can make it after all', earliest_close_date: null },
    ]);
  });

  it('tells our team in the app, not by email, when the lender only adds a note or date', async () => {
    await as(lenderA, answerTimeline)({ roomId: room.roomId, answer: 'no' });
    harness.sent.length = 0;

    const note = `Appraisal backlog ${crypto.randomUUID()}`;
    await as(
      lenderA,
      answerTimeline,
    )({
      roomId: room.roomId,
      answer: 'no',
      note,
      earliestCloseDate: '2027-05-15',
    });

    const { data: told } = await admin
      .from('notifications')
      .select('recipient_user_id, body, link')
      .eq('deal_id', deal.dealId)
      .like('body', `%${note}%`)
      .throwOnError();
    const { data: team } = await admin
      .from('accounts')
      .select('slug')
      .eq('id', deal.accountId)
      .single()
      .throwOnError();

    expect(told.map((row) => row.link)).toEqual([
      `/home/${team.slug}/deals/${deal.dealId}/lenders#lender-timeline-answer-${room.roomId}`,
      `/home/${team.slug}/deals/${deal.dealId}/lenders#lender-timeline-answer-${room.roomId}`,
    ]);

    expect(told.map((row) => row.recipient_user_id).toSorted()).toEqual(
      [us.userId, colleague.userId].toSorted(),
    );
    expect(told[0]!.body).toBe(
      `Bank A added to its closing timeline answer: "${note}" Earliest it can close: May 15, 2027.`,
    );
    expect(harness.sent).toEqual([]);
  });

  it('tells our team in the app when the lender clears the note and date', async () => {
    await as(
      lenderA,
      answerTimeline,
    )({
      roomId: room.roomId,
      answer: 'no',
      note: 'Appraisal backlog',
      earliestCloseDate: '2027-05-15',
    });
    const before = new Date().toISOString();

    await as(lenderA, answerTimeline)({ roomId: room.roomId, answer: 'no' });

    const { data: told } = await admin
      .from('notifications')
      .select('recipient_user_id, body')
      .eq('deal_id', deal.dealId)
      .gte('created_at', before)
      .throwOnError();

    expect(told.map((row) => row.body)).toEqual([
      'Bank A cleared the note on its closing timeline answer.',
      'Bank A cleared the note on its closing timeline answer.',
    ]);
  });

  it('refuses a member of a closed room', async () => {
    await expect(
      as(lenderA, answerTimeline)({ roomId: closedRoom.roomId, answer: 'yes' }),
    ).rejects.toThrow(NOT_A_MEMBER);

    expect(await answerRows(closedRoom.roomId)).toEqual([]);
  });
});

describe('our team recording the answer by hand', () => {
  it("drops the lender's note and date when recording another answer", async () => {
    await as(
      lenderA,
      answerTimeline,
    )({
      roomId: room.roomId,
      answer: 'no',
      note: 'Appraisal takes six weeks',
      earliestCloseDate: '2027-05-15',
    });

    await as(us, recordTimelineAnswer)({ roomId: room.roomId, answer: 'yes' });

    expect(await detailRows(room.roomId)).toEqual([
      { note: null, earliest_close_date: null },
    ]);
  });

  it('records it as internal, replaces a lender answer, and tells nobody', async () => {
    await as(lenderA, answerTimeline)({ roomId: room.roomId, answer: 'yes' });
    harness.sent.length = 0;

    await as(
      us,
      recordTimelineAnswer,
    )({
      roomId: room.roomId,
      answer: 'no',
    });

    expect(await answerRows(room.roomId)).toEqual([
      { answer: 'no', answered_by: us.userId, source: 'internal' },
    ]);
    expect(harness.sent).toEqual([]);
  });

  it('refuses someone who is not on the deal team, recording nothing', async () => {
    await expect(
      as(
        colleague,
        recordTimelineAnswer,
      )({ roomId: room.roomId, answer: 'no' }),
    ).rejects.toThrow('Only the deal team can do that');
    await expect(
      as(lenderA, recordTimelineAnswer)({ roomId: room.roomId, answer: 'no' }),
    ).rejects.toThrow('Only the deal team can do that');

    expect(await answerRows(room.roomId)).toEqual([]);
  });

  it('is told the team is read-only while billing is locked, recording nothing', async () => {
    await expect(
      as(us, recordTimelineAnswer)({ roomId: lockedRoom.roomId, answer: 'no' }),
    ).rejects.toThrow('This team is read-only until billing is updated.');

    expect(await answerRows(lockedRoom.roomId)).toEqual([]);
  });
});
