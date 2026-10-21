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
  admin,
  ANON_KEY,
  cleanUp,
  provisionPerson,
  provisionTeam,
  SERVICE_ROLE_KEY,
  SUPABASE_URL,
  withLockedTeam,
} from '@odb/seller-rooms/test-support/world.ts';

import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON_KEY);
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY);

const world = vi.hoisted(() => ({ signedInClient: null as unknown }));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => world.signedInClient,
}));

const { loadCounselThread, postCounselMessage, teamPostingBlock } =
  await import('./thread');

type Person = Awaited<ReturnType<typeof provisionPerson>>;

const NOT_ALLOWED = 'You cannot message on this deal.';
const TEAM_READ_ONLY = 'This team is read-only until billing is updated.';
const NOT_A_MANAGER = 'Only deal managers can message counsel.';

let owner: Person;
let teamMember: Person;
let buyerCounsel: Person;
let sellerCounsel: Person;
let stranger: Person;
let memberCounsel: Person;
let teamId: string;
let dealId: string;
let memberOwnedDealId: string;

async function namedDeal(dealOwner: Person): Promise<string> {
  const id = crypto.randomUUID();
  const { data: firm } = await admin
    .from('firm')
    .insert({ account_id: teamId, name: 'Brennan Tooling' })
    .select('id')
    .single()
    .throwOnError();
  for (const [eventType, payload] of [
    [
      'deal.created',
      { account_id: teamId, owner_user_id: dealOwner.userId, firm_id: firm.id },
    ],
    ['deal.updated', { code_name: `Project ${id.slice(0, 8)}` }],
  ] as const) {
    await admin
      .rpc('append_deal_event', {
        p_deal_id: id,
        p_aggregate_type: 'deal',
        p_aggregate_id: id,
        p_event_type: eventType,
        p_payload: payload,
        p_actor_kind: 'service',
      })
      .throwOnError();
  }

  return id;
}

function signIn(person: Person) {
  world.signedInClient = person.client;
}

async function storedBodies(side: 'buyer' | 'seller') {
  const { data } = await admin
    .from('counsel_message')
    .select('body')
    .eq('deal_id', dealId)
    .eq('side', side)
    .throwOnError();

  return data.map((row) => row.body);
}

interface Trigger {
  name: string;
  to: { subscriberId: string; email: string };
  payload: { messageId: string; audience: string };
}

async function withFakeNovu(run: (triggers: Trigger[]) => Promise<void>) {
  const triggers: Trigger[] = [];
  const server = createServer((request, response) => {
    let raw = '';
    request.on('data', (chunk) => (raw += chunk));
    request.on('end', () => {
      if (request.url === '/v1/events/trigger') {
        triggers.push(JSON.parse(raw) as Trigger);
      }
      response
        .writeHead(201, { 'content-type': 'application/json' })
        .end('{"data":{}}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  vi.stubEnv('NOVU_API_KEY', 'novu-key');
  vi.stubEnv(
    'NOVU_API_URL',
    `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
  );

  try {
    await run(triggers);
  } finally {
    vi.stubEnv('NOVU_API_KEY', undefined);
    vi.stubEnv('NOVU_API_URL', undefined);
    server.close();
  }
}

async function newestMessageId(side: 'buyer' | 'seller') {
  const { data } = await admin
    .from('counsel_message')
    .select('id')
    .eq('deal_id', dealId)
    .eq('side', side)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
    .throwOnError();

  return data.id;
}

async function notifiedAbout(deal: string) {
  const { data } = await admin
    .from('notifications')
    .select('recipient_user_id')
    .eq('account_id', teamId)
    .like('link', `%${deal}%`)
    .throwOnError();

  return data.map((row) => row.recipient_user_id);
}

beforeAll(async () => {
  owner = await provisionPerson();
  teamMember = await provisionPerson();
  buyerCounsel = await provisionPerson();
  sellerCounsel = await provisionPerson();
  stranger = await provisionPerson();
  memberCounsel = await provisionPerson();
  teamId = await provisionTeam(owner, 'Thread Partners');
  dealId = await namedDeal(owner);
  memberOwnedDealId = await namedDeal(teamMember);

  await admin
    .from('accounts_memberships')
    .insert([
      {
        account_id: teamId,
        user_id: teamMember.userId,
        account_role: 'member',
      },
      {
        account_id: teamId,
        user_id: memberCounsel.userId,
        account_role: 'member',
      },
    ])
    .throwOnError();
  await admin
    .from('deal_counsel')
    .insert([
      {
        account_id: teamId,
        deal_id: dealId,
        side: 'buyer',
        user_id: buyerCounsel.userId,
        email: buyerCounsel.email,
        name: 'Bea Buyerlaw',
      },
      {
        account_id: teamId,
        deal_id: dealId,
        side: 'seller',
        user_id: sellerCounsel.userId,
        email: sellerCounsel.email,
        name: 'Sol Sellerlaw',
      },
      {
        account_id: teamId,
        deal_id: dealId,
        side: 'buyer',
        user_id: memberCounsel.userId,
        email: memberCounsel.email,
        name: 'Mel Memberlaw',
      },
      {
        account_id: teamId,
        deal_id: memberOwnedDealId,
        side: 'buyer',
        user_id: buyerCounsel.userId,
        email: buyerCounsel.email,
        name: 'Bea Buyerlaw',
      },
    ])
    .throwOnError();
});

beforeEach(() => signIn(owner));

afterAll(async () => {
  await cleanUp([teamId]);
});

describe('postCounselMessage', () => {
  it('lets a deal manager write to either side', async () => {
    expect(
      await postCounselMessage({ dealId, side: 'seller', body: 'Draft is up' }),
    ).toEqual({ ok: true, value: undefined });

    expect(await storedBodies('seller')).toContain('Draft is up');
  });

  it("lets counsel write in their own side's thread", async () => {
    signIn(buyerCounsel);

    expect(
      await postCounselMessage({ dealId, side: 'buyer', body: 'Redline sent' }),
    ).toEqual({ ok: true, value: undefined });

    signIn(owner);
    expect(await loadCounselThread(dealId, 'buyer')).toEqual([
      expect.objectContaining({
        author_name: 'Bea Buyerlaw',
        from_team: false,
        body: 'Redline sent',
      }),
    ]);
  });

  it("refuses counsel writing in the other side's thread", async () => {
    signIn(buyerCounsel);

    expect(
      await postCounselMessage({ dealId, side: 'seller', body: 'Psst' }),
    ).toEqual({ ok: false, refusal: NOT_ALLOWED });
    expect(await storedBodies('seller')).not.toContain('Psst');
  });

  it('refuses a team member without deals.manage', async () => {
    signIn(teamMember);

    expect(
      await postCounselMessage({ dealId, side: 'buyer', body: 'Hello' }),
    ).toEqual({ ok: false, refusal: NOT_ALLOWED });
  });

  it('refuses someone outside the deal', async () => {
    signIn(stranger);

    expect(
      await postCounselMessage({ dealId, side: 'buyer', body: 'Hello' }),
    ).toEqual({ ok: false, refusal: NOT_ALLOWED });
  });

  it('refuses an empty message', async () => {
    expect(
      await postCounselMessage({ dealId, side: 'buyer', body: '   ' }),
    ).toMatchObject({ ok: false });
  });

  it('keeps a locked team from writing', async () => {
    await withLockedTeam(teamId, async () => {
      expect(
        await postCounselMessage({
          dealId,
          side: 'buyer',
          body: 'While locked',
        }),
      ).toEqual({ ok: false, refusal: TEAM_READ_ONLY });
    });

    expect(await storedBodies('buyer')).not.toContain('While locked');
  });

  it('lets counsel keep writing while the team is locked', async () => {
    signIn(sellerCounsel);

    await withLockedTeam(teamId, async () => {
      expect(
        await postCounselMessage({
          dealId,
          side: 'seller',
          body: 'Still here',
        }),
      ).toEqual({ ok: true, value: undefined });
    });

    expect(await storedBodies('seller')).toContain('Still here');
  });
});

describe('counsel who are also on the team', () => {
  it('post as counsel when they cannot post for the team', async () => {
    signIn(memberCounsel);

    expect(
      await postCounselMessage({ dealId, side: 'buyer', body: 'As counsel' }),
    ).toEqual({ ok: true, value: undefined });
    expect(await storedBodies('buyer')).toContain('As counsel');
  });
});

describe('teamPostingBlock', () => {
  it('lets a deal manager post', async () => {
    expect(await teamPostingBlock(dealId)).toBeNull();
  });

  it('tells a team member without deals.manage why they cannot post', async () => {
    signIn(teamMember);

    expect(await teamPostingBlock(dealId)).toBe(NOT_A_MANAGER);
  });

  it('tells a locked team why it cannot post', async () => {
    await withLockedTeam(teamId, async () => {
      expect(await teamPostingBlock(dealId)).toBe(TEAM_READ_ONLY);
    });
  });
});

describe('notifying the team of a counsel message', () => {
  it('notifies each deal manager once in the app, and not a plain member', async () => {
    const before = await notifiedAbout(dealId);
    signIn(sellerCounsel);

    await postCounselMessage({ dealId, side: 'seller', body: 'Ping' });

    const added = (await notifiedAbout(dealId)).slice(before.length);

    expect(added).toEqual([owner.userId]);
  });

  it("also notifies the deal's owner when they do not manage deals", async () => {
    signIn(buyerCounsel);

    await postCounselMessage({
      dealId: memberOwnedDealId,
      side: 'buyer',
      body: 'Ping',
    });

    expect((await notifiedAbout(memberOwnedDealId)).sort()).toEqual(
      [owner.userId, teamMember.userId].sort(),
    );
  });

  it('names the deal by its business name in the in-app notice', async () => {
    signIn(sellerCounsel);

    await postCounselMessage({ dealId, side: 'seller', body: 'Named' });

    const { data } = await admin
      .from('notifications')
      .select('body')
      .eq('recipient_user_id', owner.userId)
      .eq('deal_id', dealId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
      .throwOnError();

    expect(data.body).toBe(
      "New message from seller's counsel on Brennan Tooling.",
    );
  });

  it('links the in-app notice to the message on the deal', async () => {
    signIn(sellerCounsel);

    await postCounselMessage({ dealId, side: 'seller', body: 'Linked' });

    const [{ data: team }, { data: notice }] = await Promise.all([
      admin.from('accounts').select('slug').eq('id', teamId).single(),
      admin
        .from('notifications')
        .select('link')
        .eq('recipient_user_id', owner.userId)
        .eq('deal_id', dealId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
        .throwOnError(),
    ]);

    expect(notice.link).toBe(
      `/home/${team!.slug}/deals/${dealId}/parties#counsel-message-${await newestMessageId('seller')}`,
    );
  });

  it('sends no in-app notice when the team writes', async () => {
    const before = await notifiedAbout(dealId);

    await postCounselMessage({ dealId, side: 'buyer', body: 'From the team' });

    expect(await notifiedAbout(dealId)).toEqual(before);
  });
});

describe('emailing about a counsel message', () => {
  it('emails each team recipient when counsel write', async () => {
    await withFakeNovu(async (triggers) => {
      signIn(sellerCounsel);

      await postCounselMessage({ dealId, side: 'seller', body: 'Emailed' });

      const messageId = await newestMessageId('seller');

      expect(triggers).toEqual([
        {
          name: 'counsel-message',
          to: { subscriberId: owner.userId, email: owner.email },
          payload: { messageId, audience: 'team' },
          transactionId: undefined,
          overrides: {},
        },
      ]);
    });
  });

  it("emails that side's counsel when the team writes", async () => {
    await withFakeNovu(async (triggers) => {
      await postCounselMessage({ dealId, side: 'seller', body: 'To counsel' });

      const messageId = await newestMessageId('seller');

      expect(triggers).toEqual([
        {
          name: 'counsel-message',
          to: {
            subscriberId: sellerCounsel.userId,
            email: sellerCounsel.email,
          },
          payload: { messageId, audience: 'counsel' },
          transactionId: undefined,
          overrides: {},
        },
      ]);
    });
  });

  it.each([
    ['archived', 'deal.archived', {}],
    ['resolved', 'deal.resolved', { resolution: 'lost' }],
  ])('emails no counsel once the deal is %s', async (_, eventType, payload) => {
    const closedDealId = await namedDeal(owner);
    await admin
      .from('deal_counsel')
      .insert({
        account_id: teamId,
        deal_id: closedDealId,
        side: 'seller',
        user_id: sellerCounsel.userId,
        email: sellerCounsel.email,
      })
      .throwOnError();
    await admin
      .rpc('append_deal_event', {
        p_deal_id: closedDealId,
        p_aggregate_type: 'deal',
        p_aggregate_id: closedDealId,
        p_event_type: eventType,
        p_payload: payload,
        p_actor_kind: 'service',
      })
      .throwOnError();

    await withFakeNovu(async (triggers) => {
      await postCounselMessage({
        dealId: closedDealId,
        side: 'seller',
        body: 'After the close',
      });

      expect(triggers).toEqual([]);
    });
  });

  it('still posts, with the in-app notice, when Novu is not configured', async () => {
    const before = await notifiedAbout(dealId);
    signIn(sellerCounsel);

    expect(
      await postCounselMessage({ dealId, side: 'seller', body: 'No Novu' }),
    ).toEqual({ ok: true, value: undefined });
    expect(await storedBodies('seller')).toContain('No Novu');
    expect((await notifiedAbout(dealId)).length).toBe(before.length + 1);
  });

  it('still posts, with the in-app notice, when Novu cannot be reached', async () => {
    const before = await notifiedAbout(dealId);
    vi.stubEnv('NOVU_API_KEY', 'novu-key');
    vi.stubEnv('NOVU_API_URL', 'http://127.0.0.1:9');
    signIn(sellerCounsel);

    try {
      expect(
        await postCounselMessage({ dealId, side: 'seller', body: 'Novu down' }),
      ).toEqual({ ok: true, value: undefined });
      signIn(owner);
      expect(
        await postCounselMessage({
          dealId,
          side: 'seller',
          body: 'Team, Novu down',
        }),
      ).toEqual({ ok: true, value: undefined });
    } finally {
      vi.stubEnv('NOVU_API_KEY', undefined);
      vi.stubEnv('NOVU_API_URL', undefined);
    }

    expect(await storedBodies('seller')).toEqual(
      expect.arrayContaining(['Novu down', 'Team, Novu down']),
    );
    expect((await notifiedAbout(dealId)).length).toBe(before.length + 1);
  });
});

describe('loadCounselThread', () => {
  it("shows seller's counsel only their own side's thread", async () => {
    signIn(sellerCounsel);

    expect(
      (await loadCounselThread(dealId, 'seller')).map((m) => m.body),
    ).toContain('Draft is up');
    expect(await loadCounselThread(dealId, 'buyer')).toEqual([]);
  });
});
