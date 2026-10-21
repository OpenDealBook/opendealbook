import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  ANON_KEY,
  SERVICE_ROLE_KEY,
  SUPABASE_URL,
  admin,
  cleanUp,
  newDeal,
  provisionPerson,
  provisionTeam,
  withLockedTeam,
  type Person,
} from '../test-support/world';

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON_KEY);
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY);
vi.stubEnv('NOVU_API_KEY', 'test-novu-key');
vi.stubEnv('NOVU_API_URL', 'https://novu.test');

const novu = vi.hoisted(() => ({ triggered: [] as Record<string, unknown>[] }));

vi.mock('@odb/notifications/server', () => ({
  createNovuClient: () => ({}),
  triggerNotification: async (
    _deps: unknown,
    input: Record<string, unknown>,
  ) => {
    novu.triggered.push(input);
  },
}));

const world = vi.hoisted(() => ({ signedInClient: null as unknown }));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => world.signedInClient,
}));

import { shareSellerRoomMeeting, unshareSellerRoomMeeting } from './actions';
import { loadSellerMeetings, openSellerMeeting } from './queries';

let owner: Person;
let teamMember: Person;
let seller: Person;
let stranger: Person;
let teamId: string;
let dealId: string;
let roomId: string;
let weekly: string;
let siteVisit: string;

async function meeting(onDeal: string, type: string, transcript: string) {
  const id = crypto.randomUUID();
  const event = (eventType: string, payload: Record<string, string>) =>
    admin
      .rpc('append_deal_event', {
        p_deal_id: onDeal,
        p_aggregate_type: 'meeting',
        p_aggregate_id: id,
        p_event_type: eventType,
        p_payload: payload,
        p_actor_kind: 'service',
      })
      .throwOnError();

  await event('meeting.scheduled', {
    type,
    scheduled_at: new Date().toISOString(),
  });
  await event('meeting.updated', {
    transcript_text: transcript,
    summary: `${transcript} summary`,
    recording_path: 'recordings/private.mp4',
  });

  return id;
}

beforeAll(async () => {
  owner = await provisionPerson();
  teamMember = await provisionPerson();
  seller = await provisionPerson();
  stranger = await provisionPerson();
  teamId = await provisionTeam(owner, 'Acme Partners');
  dealId = await newDeal(teamId, owner);

  await admin
    .from('accounts_memberships')
    .insert({
      account_id: teamId,
      user_id: teamMember.userId,
      account_role: 'member',
    })
    .throwOnError();

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
      name: 'Sam Seller',
    })
    .throwOnError();

  weekly = await meeting(dealId, 'weekly', 'Weekly call');
  siteVisit = await meeting(dealId, 'site_visit', 'Site visit');
});

beforeEach(() => {
  world.signedInClient = owner.client;
});

afterAll(async () => {
  await cleanUp([teamId]);
});

describe('sharing meetings with the seller room', () => {
  it('lists the deal meetings with which ones the room shows', async () => {
    await shareSellerRoomMeeting({ dealId, meetingId: weekly });

    expect(await loadSellerMeetings(owner.client, dealId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: weekly, shared: true }),
        expect.objectContaining({ id: siteVisit, shared: false }),
      ]),
    );
  });

  it('shows a shared meeting to the seller as transcript and summary, and records the opening', async () => {
    await shareSellerRoomMeeting({ dealId, meetingId: weekly });

    const opened = await openSellerMeeting(
      seller.client,
      admin,
      roomId,
      weekly,
    );

    expect(opened).toEqual({
      id: weekly,
      type: 'weekly',
      scheduled_at: expect.any(String),
      transcript_text: 'Weekly call',
      summary: 'Weekly call summary',
    });

    const { data: activity } = await admin
      .from('seller_room_activity')
      .select('user_id, action, payload')
      .eq('room_id', roomId)
      .eq('action', 'meeting_opened')
      .throwOnError();

    expect(activity).toEqual([
      {
        user_id: seller.userId,
        action: 'meeting_opened',
        payload: { meeting_id: weekly },
      },
    ]);
  });

  it('shows nothing of a meeting the team has not shared, or to someone outside the room', async () => {
    expect(
      await openSellerMeeting(seller.client, admin, roomId, siteVisit),
    ).toBeNull();
    expect(
      await openSellerMeeting(stranger.client, admin, roomId, weekly),
    ).toBeNull();
  });

  it('stops showing a meeting once the team unshares it', async () => {
    await shareSellerRoomMeeting({ dealId, meetingId: siteVisit });
    expect(
      await unshareSellerRoomMeeting({ dealId, meetingId: siteVisit }),
    ).toEqual({
      ok: true,
      value: undefined,
    });

    expect(
      await openSellerMeeting(seller.client, admin, roomId, siteVisit),
    ).toBeNull();
  });

  it('refuses a team member who cannot manage the deal', async () => {
    world.signedInClient = teamMember.client;

    expect(await shareSellerRoomMeeting({ dealId, meetingId: weekly })).toEqual(
      {
        ok: false,
        refusal: 'You cannot change this seller room.',
      },
    );
  });

  it('refuses a meeting from another deal', async () => {
    const elsewhere = await meeting(
      await newDeal(teamId, owner),
      'weekly',
      'Other deal',
    );

    expect(
      await shareSellerRoomMeeting({ dealId, meetingId: elsewhere }),
    ).toEqual({
      ok: false,
      refusal: 'That meeting is not in this deal.',
    });
  });

  it('refuses a locked team up front', async () => {
    await withLockedTeam(teamId, async () => {
      expect(
        await shareSellerRoomMeeting({ dealId, meetingId: weekly }),
      ).toEqual({
        ok: false,
        refusal: 'This team is read-only until billing is updated.',
      });
    });
  });

  it('queues a newly shared meeting for each seller daily digest once, even if unshared and shared again', async () => {
    const fresh = await meeting(dealId, 'weekly', 'Fresh call');
    novu.triggered = [];

    await shareSellerRoomMeeting({ dealId, meetingId: fresh });
    await shareSellerRoomMeeting({ dealId, meetingId: fresh });
    await unshareSellerRoomMeeting({ dealId, meetingId: fresh });
    await shareSellerRoomMeeting({ dealId, meetingId: fresh });

    expect(novu.triggered).toEqual([
      expect.objectContaining({
        eventType: 'seller-room-shared',
        recipientUserId: seller.userId,
        payload: { kind: 'meeting', roomId, meetingId: fresh },
      }),
    ]);
  });
});
