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
  newDeal,
  provisionPerson,
  provisionTeam,
  SERVICE_ROLE_KEY,
  SUPABASE_URL,
} from '@odb/seller-rooms/test-support/world.ts';

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON_KEY);
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY);
vi.stubEnv('SELLER_DELIVERY_FROM_EMAIL', 'updates@odb.test');

interface SentEmail {
  to: string;
  from: string;
  replyTo: string;
  subject: string;
  html: string;
  text: string;
}

const world = vi.hoisted(() => ({
  outbox: [] as SentEmail[],
  downFor: new Set<string>(),
  sendDelayMs: 0,
}));

vi.mock('@odb/mailers', () => ({
  getMailer: async () => ({
    sendEmail: async (email: SentEmail) => {
      await new Promise((resolve) => setTimeout(resolve, world.sendDelayMs));

      if (world.downFor.has(email.to)) {
        throw new Error('mailbox unavailable');
      }

      world.outbox.push(email);

      return {};
    },
  }),
}));

const { deliverDealUpdate, finishDealUpdateDelivery } =
  await import('./activities');

type Person = Awaited<ReturnType<typeof provisionPerson>>;

const ORIGIN = 'https://app.odb.test';
const AUTHOR_COPY = 'author-copy@odb.test';

let author: Person;
let approver: Person;
let teamId: string;
let teamSlug: string;
let dealId: string;

function entry(fields: Record<string, unknown>) {
  return {
    contact_id: null,
    name: 'Someone',
    phone: null,
    company: null,
    side: 'buyer',
    role: 'principal',
    lender_room_id: null,
    room_closed: null,
    is_main: false,
    ...fields,
  };
}

const LENDER_ROOM = crypto.randomUUID();
const CLOSED_LENDER_ROOM = crypto.randomUUID();

function lenderAndCounsel(email: string) {
  return {
    email,
    name: 'Lena Lender',
    entries: [
      entry({
        source: 'lender_room',
        side: 'lender',
        role: 'lender',
        company: 'First Bank',
        lender_room_id: LENDER_ROOM,
        room_closed: false,
      }),
      entry({
        source: 'lender_room',
        side: 'lender',
        role: 'lender',
        company: 'Old Bank',
        lender_room_id: CLOSED_LENDER_ROOM,
        room_closed: true,
      }),
      entry({
        source: 'seller_room',
        side: 'seller',
        role: 'seller',
        room_closed: false,
      }),
      entry({ source: 'counsel', side: 'seller', role: 'attorney' }),
    ],
  };
}

function teammate(email: string) {
  return { email, name: 'Tom Team', entries: [entry({ source: 'team' })] };
}

function deletedContact(email: string) {
  return {
    email,
    name: 'Gone Contact',
    entries: [
      entry({
        source: 'contact',
        contact_id: crypto.randomUUID(),
        side: 'seller',
        role: 'broker',
      }),
    ],
  };
}

async function approvedUpdate(
  subject: string,
  recipients: { email: string; name: string; entries: unknown[] }[],
) {
  const { data: update } = await admin
    .from('deal_update')
    .insert({
      account_id: teamId,
      deal_id: dealId,
      author_id: author.userId,
      subject,
      body: 'Closing moves to December.',
      picks: { groups: [], people: [] },
      status: 'approved',
      decided_by: approver.userId,
      decided_at: new Date().toISOString(),
    })
    .select('id')
    .single()
    .throwOnError();

  await admin
    .from('deal_update_recipient')
    .insert(
      [{ ...teammate(AUTHOR_COPY), user_id: author.userId }, ...recipients].map(
        (recipient) => ({
          update_id: update.id,
          ...recipient,
          entries: recipient.entries as never,
        }),
      ),
    )
    .throwOnError();

  return update.id;
}

async function rows(updateId: string) {
  const { data } = await admin
    .from('deal_update_recipient')
    .select('email, sent_at, failed_at, error')
    .eq('update_id', updateId)
    .neq('email', AUTHOR_COPY)
    .order('email')
    .throwOnError();

  return data;
}

async function noticesToAuthor(subject: string) {
  const { data } = await admin
    .from('notifications')
    .select('body, link')
    .eq('recipient_user_id', author.userId)
    .like('body', `%"${subject}"%`)
    .throwOnError();

  return data;
}

function sentTo(email: string) {
  return world.outbox.filter((sent) => sent.to === email);
}

function hrefs(html: string) {
  return [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
}

beforeAll(async () => {
  author = await provisionPerson();
  approver = await provisionPerson();
  teamId = await provisionTeam(author, 'Harbor "North" Capital');
  dealId = await newDeal(teamId, author);
  await admin
    .rpc('append_deal_event', {
      p_deal_id: dealId,
      p_aggregate_type: 'deal',
      p_aggregate_id: dealId,
      p_event_type: 'deal.updated',
      p_payload: { code_name: 'Project Atlas' },
      p_actor_kind: 'service',
    })
    .throwOnError();
  await admin
    .from('accounts')
    .update({ name: 'Avery "Ace" Author' })
    .eq('primary_owner_user_id', author.userId)
    .eq('is_personal_account', true)
    .throwOnError();

  const { data: team } = await admin
    .from('accounts')
    .select('slug')
    .eq('id', teamId)
    .single()
    .throwOnError();

  teamSlug = team.slug!;
});

beforeEach(() => {
  world.outbox.length = 0;
  world.downFor.clear();
  world.sendDelayMs = 0;
});

afterAll(async () => {
  await cleanUp([teamId]);
});

describe('deal update delivery', () => {
  it('emails each recipient alone, from the author, replying to the author, with a link per open place', async () => {
    const updateId = await approvedUpdate('Appraisal in', [
      lenderAndCounsel('lena@odb.test'),
      teammate('tom@odb.test'),
      deletedContact('gone@odb.test'),
    ]);

    await deliverDealUpdate({ updateId, origin: ORIGIN });

    expect(world.outbox.map((sent) => sent.to).sort()).toEqual([
      AUTHOR_COPY,
      'gone@odb.test',
      'lena@odb.test',
      'tom@odb.test',
    ]);
    for (const sent of world.outbox) {
      expect(sent.from).toBe(
        '"Avery \\"Ace\\" Author via Open Deal Book" <updates@odb.test>',
      );
      expect(sent.replyTo).toBe(AUTHOR_COPY);
      expect(sent.html).toContain('Closing moves to December.');
      expect(sent.text).toContain('Open Deal Book');
    }
    expect(
      world.outbox
        .map((sent) => [
          sent.to,
          sent.subject,
          /about (.+?)\. Deal updates/.exec(sent.text)![1],
        ])
        .sort(),
    ).toEqual([
      [AUTHOR_COPY, 'Appraisal in', 'Seller room deal'],
      ['gone@odb.test', 'Project Atlas: Appraisal in', 'Seller room deal'],
      ['lena@odb.test', 'Project Atlas: Appraisal in', 'Project Atlas'],
      ['tom@odb.test', 'Appraisal in', 'Seller room deal'],
    ]);
    expect(hrefs(sentTo('lena@odb.test')[0]!.html)).toEqual([
      `${ORIGIN}/lender/${LENDER_ROOM}`,
      `${ORIGIN}/seller/${dealId}`,
      `${ORIGIN}/counsel/${dealId}`,
    ]);
    expect(hrefs(sentTo('tom@odb.test')[0]!.html)).toEqual([
      `${ORIGIN}/home/${teamSlug}/deals/${dealId}`,
    ]);
    expect(hrefs(sentTo('gone@odb.test')[0]!.html)).toEqual([]);
    expect(
      (await rows(updateId)).map((row) => [
        row.sent_at !== null,
        row.failed_at,
      ]),
    ).toEqual([
      [true, null],
      [true, null],
      [true, null],
    ]);
  });

  it('emails no one again when delivery runs a second time', async () => {
    const updateId = await approvedUpdate('Rate lock', [
      teammate('tom@odb.test'),
    ]);

    await deliverDealUpdate({ updateId, origin: ORIGIN });
    await deliverDealUpdate({ updateId, origin: ORIGIN });

    expect(sentTo('tom@odb.test')).toHaveLength(1);
  });

  it('emails each person once when two deliveries run at the same time', async () => {
    const updateId = await approvedUpdate('Inspection', [
      teammate('tom@odb.test'),
      deletedContact('gone@odb.test'),
    ]);
    world.sendDelayMs = 200;

    await Promise.all([
      deliverDealUpdate({ updateId, origin: ORIGIN }),
      deliverDealUpdate({ updateId, origin: ORIGIN }),
    ]);

    expect(world.outbox.map((sent) => sent.to).sort()).toEqual([
      AUTHOR_COPY,
      'gone@odb.test',
      'tom@odb.test',
    ]);
  });

  it('fails the attempt when a send fails, so a retry reaches that person', async () => {
    const updateId = await approvedUpdate('Loan docs', [
      teammate('tom@odb.test'),
      deletedContact('gone@odb.test'),
    ]);
    world.downFor.add('gone@odb.test');

    await expect(
      deliverDealUpdate({ updateId, origin: ORIGIN }),
    ).rejects.toThrow('mailbox unavailable');
    expect(await rows(updateId)).toEqual([
      expect.objectContaining({
        email: 'gone@odb.test',
        sent_at: null,
        failed_at: null,
        error: 'mailbox unavailable',
      }),
      expect.objectContaining({ email: 'tom@odb.test', error: null }),
    ]);

    world.downFor.clear();
    await deliverDealUpdate({ updateId, origin: ORIGIN });

    expect(sentTo('gone@odb.test')).toHaveLength(1);
    expect(sentTo('tom@odb.test')).toHaveLength(1);
    expect((await rows(updateId))[0]).toEqual(
      expect.objectContaining({ email: 'gone@odb.test', error: null }),
    );
  });

  it('stamps whoever is still unsent as failed once retries end, and never emails them after', async () => {
    const updateId = await approvedUpdate('Site visit', [
      teammate('tom@odb.test'),
      deletedContact('gone@odb.test'),
    ]);
    world.downFor.add('gone@odb.test');
    await deliverDealUpdate({ updateId, origin: ORIGIN }).catch(() => {});

    await finishDealUpdateDelivery({ updateId, origin: ORIGIN });
    await finishDealUpdateDelivery({ updateId, origin: ORIGIN });
    world.downFor.clear();
    await deliverDealUpdate({ updateId, origin: ORIGIN });

    expect(sentTo('gone@odb.test')).toHaveLength(0);
    expect(await rows(updateId)).toEqual([
      expect.objectContaining({
        email: 'gone@odb.test',
        sent_at: null,
        failed_at: expect.any(String),
        error: 'mailbox unavailable',
      }),
      expect.objectContaining({
        email: 'tom@odb.test',
        sent_at: expect.any(String),
        failed_at: null,
      }),
    ]);
    expect(await noticesToAuthor('Site visit')).toEqual([
      {
        body: 'Some recipients didn\'t receive "Site visit". See the update for details.',
        link: `/home/${teamSlug}/deals/${dealId}#deal-update-${updateId}`,
      },
    ]);
  });

  it('records the update once in the deal history', async () => {
    const updateId = await approvedUpdate('Closing date', [
      teammate('tom@odb.test'),
    ]);
    await deliverDealUpdate({ updateId, origin: ORIGIN });

    await finishDealUpdateDelivery({ updateId, origin: ORIGIN });
    await finishDealUpdateDelivery({ updateId, origin: ORIGIN });

    const { data: events } = await admin
      .from('deal_event')
      .select('deal_id, event_type, payload')
      .eq('aggregate_type', 'deal_update')
      .eq('aggregate_id', updateId)
      .throwOnError();

    expect(await noticesToAuthor('Closing date')).toEqual([]);
    expect(events).toEqual([
      {
        deal_id: dealId,
        event_type: 'deal_update.sent',
        payload: { subject: 'Closing date' },
      },
    ]);
  });

  it('sends nothing and stops retrying when no sender address is set', async () => {
    const updateId = await approvedUpdate('No sender', [
      teammate('tom@odb.test'),
    ]);
    vi.stubEnv('SELLER_DELIVERY_FROM_EMAIL', '');

    await expect(
      deliverDealUpdate({ updateId, origin: ORIGIN }),
    ).rejects.toMatchObject({ nonRetryable: true });
    vi.stubEnv('SELLER_DELIVERY_FROM_EMAIL', 'updates@odb.test');

    expect(world.outbox).toEqual([]);
  });

  it('sends without a reply-to address when the author was deleted', async () => {
    const updateId = await approvedUpdate('Orphaned', [
      teammate('tom@odb.test'),
    ]);
    await admin
      .from('deal_update')
      .update({ author_id: null })
      .eq('id', updateId)
      .throwOnError();
    await admin
      .from('deal_update_recipient')
      .update({ user_id: null })
      .eq('update_id', updateId)
      .throwOnError();

    await deliverDealUpdate({ updateId, origin: ORIGIN });

    expect(sentTo('tom@odb.test')).toEqual([
      expect.objectContaining({
        from: '"Harbor \\"North\\" Capital via Open Deal Book" <updates@odb.test>',
        replyTo: undefined,
      }),
    ]);
  });

  it('stamps failures without a notice when the author was deleted', async () => {
    const updateId = await approvedUpdate('Nobody to tell', [
      deletedContact('gone@odb.test'),
    ]);
    await admin
      .from('deal_update')
      .update({ author_id: null })
      .eq('id', updateId)
      .throwOnError();
    await admin
      .from('deal_update_recipient')
      .update({ user_id: null })
      .eq('update_id', updateId)
      .throwOnError();
    world.downFor.add('gone@odb.test');
    await deliverDealUpdate({ updateId, origin: ORIGIN }).catch(() => {});

    await finishDealUpdateDelivery({ updateId, origin: ORIGIN });

    expect(await rows(updateId)).toEqual([
      expect.objectContaining({
        email: 'gone@odb.test',
        failed_at: expect.any(String),
      }),
    ]);
    const { data: notices } = await admin
      .from('notifications')
      .select('recipient_user_id')
      .like('body', '%"Nobody to tell"%')
      .throwOnError();
    expect(notices).toEqual([]);
  });

  it('leaves a claim alone while the attempt that took it could still be running', async () => {
    const updateId = await approvedUpdate('Slow attempt', [
      teammate('tom@odb.test'),
    ]);
    await admin
      .from('deal_update_recipient')
      .update({ claimed_at: new Date(Date.now() - 6 * 60_000).toISOString() })
      .eq('update_id', updateId)
      .eq('email', 'tom@odb.test')
      .throwOnError();

    await deliverDealUpdate({ updateId, origin: ORIGIN });

    expect(sentTo('tom@odb.test')).toEqual([]);
  });
});
