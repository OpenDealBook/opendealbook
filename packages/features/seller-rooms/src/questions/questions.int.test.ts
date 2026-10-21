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
vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000');

interface SentEmail {
  to: string;
  from: string;
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
}

const world = vi.hoisted(() => ({
  signedInClient: null as unknown,
  outbox: [] as SentEmail[],
  mailFails: false,
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => world.signedInClient,
}));

vi.mock('@odb/mailers', () => ({
  getMailer: async () => ({
    sendEmail: async (email: SentEmail) => {
      if (world.mailFails) {
        throw new Error('mail server down');
      }

      world.outbox.push(email);
      return {};
    },
  }),
}));

import { loadSellerRoomPeople } from '../members/people';
import {
  answerSellerQuestion,
  askSeller,
  askSellerAboutLenderAsk,
  forwardSellerAnswer,
  requestChecklistItemFromSeller,
} from './actions';
import {
  loadQuestionAskers,
  loadRoomQuestions,
  loadTeamQuestions,
} from './queries';

let owner: Person;
let seller: Person;
let partner: Person;
let stranger: Person;
let teamId: string;
let dealId: string;
let roomId: string;
let uploadsFolder: string;
let sellerFile: string;
let hiddenFile: string;

async function documentIn(folderId: string, name: string) {
  const id = crypto.randomUUID();

  await admin
    .rpc('append_deal_event', {
      p_deal_id: dealId,
      p_aggregate_type: 'dr_document',
      p_aggregate_id: id,
      p_event_type: 'dr_document.added',
      p_payload: {
        folder_id: folderId,
        name,
        storage_path: `deal/${dealId}/${id}`,
        version: 1,
      },
      p_actor_kind: 'service',
    })
    .throwOnError();

  return id;
}

async function nameAs(person: Person, name: string) {
  await admin
    .from('accounts')
    .update({ name })
    .eq('primary_owner_user_id', person.userId)
    .eq('is_personal_account', true)
    .throwOnError();
}

async function newAnalyst(name: string) {
  const analyst = await provisionPerson();
  await admin
    .from('accounts_memberships')
    .insert({
      account_id: teamId,
      user_id: analyst.userId,
      account_role: 'member',
    })
    .throwOnError();
  await nameAs(analyst, name);

  return analyst;
}

async function question(id: string) {
  const { data } = await admin
    .from('seller_room_question')
    .select('title, body, status, first_response_at')
    .eq('id', id)
    .single()
    .throwOnError();

  return data;
}

beforeAll(async () => {
  owner = await provisionPerson();
  seller = await provisionPerson();
  partner = await provisionPerson();
  stranger = await provisionPerson();
  teamId = await provisionTeam(owner, 'Acme Partners');
  await nameAs(owner, 'Morgan Reyes');
  dealId = crypto.randomUUID();

  const { data: firm } = await admin
    .from('firm')
    .insert({ account_id: teamId, name: 'Brennan Tooling' })
    .select('id')
    .single()
    .throwOnError();
  await admin
    .rpc('append_deal_event', {
      p_deal_id: dealId,
      p_aggregate_type: 'deal',
      p_aggregate_id: dealId,
      p_event_type: 'deal.created',
      p_payload: {
        account_id: teamId,
        owner_user_id: owner.userId,
        firm_id: firm.id,
        description: 'Founder retiring, quiet sale',
      },
      p_actor_kind: 'service',
    })
    .throwOnError();
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

  const { data } = await owner.client
    .rpc('ensure_seller_room', { deal_id: dealId })
    .throwOnError();
  roomId = data;

  const { data: room } = await admin
    .from('seller_room')
    .select('uploads_folder_id')
    .eq('id', roomId)
    .single()
    .throwOnError();
  uploadsFolder = room.uploads_folder_id;

  for (const [person, name] of [
    [seller, 'Sam Seller'],
    [partner, 'Pat Partner'],
  ] as const) {
    await admin
      .from('seller_room_member')
      .insert({
        room_id: roomId,
        user_id: person.userId,
        email: person.email,
        name,
      })
      .throwOnError();
  }

  sellerFile = await documentIn(uploadsFolder, 'customers.xlsx');

  const { data: internal } = await admin
    .from('dr_folder')
    .insert({ account_id: teamId, deal_id: dealId, name: 'Internal' })
    .select('id')
    .single()
    .throwOnError();
  hiddenFile = await documentIn(internal.id, 'notes.pdf');
});

beforeEach(() => {
  world.signedInClient = owner.client;
  world.outbox = [];
  world.mailFails = false;
  vi.stubEnv('SELLER_DELIVERY_FROM_EMAIL', 'Deals <deals@odb.test>');
});

afterAll(async () => {
  await cleanUp([teamId]);
});

describe('the team asks the seller', () => {
  it('puts the question in the room and emails every seller there', async () => {
    const asked = await askSeller({
      dealId,
      title: 'Customer list?',
      body: 'Your top ten customers by revenue',
    });

    expect(asked.ok).toBe(true);
    expect(await question(asked.ok ? asked.value : '')).toEqual({
      title: 'Customer list?',
      body: 'Your top ten customers by revenue',
      status: 'open',
      first_response_at: null,
    });

    const { data: seen } = await seller.client
      .from('seller_room_question')
      .select('title')
      .throwOnError();
    expect(seen).toEqual([{ title: 'Customer list?' }]);

    expect(world.outbox.map((email) => email.to).sort()).toEqual(
      [partner.email, seller.email].sort(),
    );
    expect(world.outbox[0]!.from).toBe(
      '"Morgan Reyes via Open Deal Book" <deals@odb.test>',
    );
    expect(world.outbox[0]!.replyTo).toBe(owner.email);
    expect(world.outbox[0]!.subject).toBe(
      'Morgan Reyes asked about Project Atlas: Customer list?',
    );
    expect(world.outbox[0]!.text).toContain('Brennan Tooling');
    expect(world.outbox[0]!.text).toContain(
      `http://localhost:3000/seller/rooms/${roomId}`,
    );
    for (const email of world.outbox) {
      expect(`${email.subject}${email.text}${email.html}`).not.toContain(
        'Founder retiring',
      );
    }
  });

  it('refuses when seller email is not set up', async () => {
    vi.stubEnv('SELLER_DELIVERY_FROM_EMAIL', undefined);

    expect(await askSeller({ dealId, title: 'Q?', body: '' })).toEqual({
      ok: false,
      refusal: 'Seller email is not set up',
    });
  });

  it('refuses someone who cannot manage the deal', async () => {
    world.signedInClient = seller.client;

    expect(await askSeller({ dealId, title: 'Q?', body: '' })).toEqual({
      ok: false,
      refusal: 'You cannot ask in this seller room.',
    });
  });
});

describe('an analyst asks the seller', () => {
  let analyst: Person;

  beforeAll(async () => {
    analyst = await newAnalyst('Ana Lee');
  });

  beforeEach(() => {
    world.signedInClient = analyst.client;
  });

  it('asks in the seller room a manager opened, as herself', async () => {
    const asked = await askSeller({ dealId, title: 'Payroll?', body: '' });

    expect(asked.ok).toBe(true);

    const { data } = await admin
      .from('seller_room_question')
      .select('created_by')
      .eq('id', asked.ok ? asked.value : '')
      .single()
      .throwOnError();
    expect(data.created_by).toBe(analyst.userId);
    expect(world.outbox.map((email) => email.to).sort()).toEqual(
      [partner.email, seller.email].sort(),
    );
    expect(world.outbox[0]!.subject).toBe(
      'Ana Lee asked about Project Atlas: Payroll?',
    );
    expect(world.outbox[0]!.replyTo).toBe(analyst.email);
    expect(
      (await loadQuestionAskers(admin, roomId))[asked.ok ? asked.value : ''],
    ).toBe('Ana Lee');
    expect(
      (await loadTeamQuestions(analyst.client, dealId)).map(
        (candidate) => candidate.title,
      ),
    ).toContain('Payroll?');
  });

  it('sees the same sellers in the room as a manager', async () => {
    expect(
      (await loadSellerRoomPeople(analyst.client, dealId)).map(
        (person) => person.name,
      ),
    ).toEqual(['Pat Partner', 'Sam Seller']);
  });

  it('is told who can open the seller room when there is none yet', async () => {
    const roomless = await newDeal(teamId, owner);

    expect(
      await askSeller({ dealId: roomless, title: 'Q?', body: '' }),
    ).toEqual({
      ok: false,
      refusal: 'Only deal managers can open the seller room. Ask Morgan Reyes.',
    });
  });
});

describe('asking before the seller has joined', () => {
  async function emptyRoomWith(sellers: string[]) {
    const emptyRoomDeal = await newDeal(teamId, owner);
    await owner.client
      .rpc('ensure_seller_room', { deal_id: emptyRoomDeal })
      .throwOnError();

    for (const name of sellers) {
      const { data: contact } = await admin
        .from('contact')
        .insert({
          account_id: teamId,
          name,
          email: `${crypto.randomUUID()}@odb.test`,
        })
        .select('id')
        .single()
        .throwOnError();
      await admin
        .from('deal_contact')
        .insert({
          account_id: teamId,
          deal_id: emptyRoomDeal,
          contact_id: contact.id,
          side: 'seller',
          role: 'principal',
        })
        .throwOnError();
    }

    return emptyRoomDeal;
  }

  it('names the seller on the deal who is not in the room yet', async () => {
    const emptyRoomDeal = await emptyRoomWith(['Walt Brennan']);

    expect(
      await askSeller({ dealId: emptyRoomDeal, title: 'Q?', body: '' }),
    ).toEqual({
      ok: false,
      refusal:
        "Walt Brennan hasn't joined the seller room yet; invite them first.",
    });
    expect(world.outbox).toEqual([]);
  });

  it('names every seller on the deal who is not in the room yet', async () => {
    const emptyRoomDeal = await emptyRoomWith(['Walt Brennan', 'Jo Brennan']);

    expect(
      await askSeller({ dealId: emptyRoomDeal, title: 'Q?', body: '' }),
    ).toEqual({
      ok: false,
      refusal:
        "Jo Brennan and Walt Brennan haven't joined the seller room yet; invite them first.",
    });
  });
});

describe('the seller answers', () => {
  it('records the answer and files, marks the question answered, and tells the team', async () => {
    const asked = await askSeller({ dealId, title: 'Lease?', body: '' });
    const questionId = asked.ok ? asked.value : '';
    world.signedInClient = seller.client;

    expect(
      await answerSellerQuestion({
        questionId,
        body: 'Attached',
        documentIds: [sellerFile],
      }),
    ).toEqual({ ok: true, value: undefined });

    expect(await question(questionId)).toEqual(
      expect.objectContaining({
        status: 'answered',
        first_response_at: expect.any(String),
      }),
    );

    const { data: messages } = await partner.client
      .from('seller_room_question_message')
      .select('side, body, author_user_id')
      .eq('question_id', questionId)
      .throwOnError();
    expect(messages).toEqual([
      { side: 'seller', body: 'Attached', author_user_id: seller.userId },
    ]);

    const { data: files } = await admin
      .from('seller_room_question_file')
      .select('dr_document_id, side')
      .eq('question_id', questionId)
      .throwOnError();
    expect(files).toEqual([{ dr_document_id: sellerFile, side: 'seller' }]);

    const { data: notices } = await admin
      .from('notifications')
      .select('deal_id, link')
      .eq('account_id', teamId)
      .eq('recipient_user_id', owner.userId)
      .eq('body', 'Sam Seller answered "Lease?"')
      .throwOnError();
    const { data: team } = await admin
      .from('accounts')
      .select('slug')
      .eq('id', teamId)
      .single()
      .throwOnError();
    expect(notices).toEqual([
      {
        deal_id: dealId,
        link: `/home/${team.slug}/deals/${dealId}/parties#seller-question-${questionId}`,
      },
    ]);
    expect(novu.triggered).toContainEqual(
      expect.objectContaining({
        eventType: 'seller-room-activity',
        recipientUserId: owner.userId,
        payload: { roomId, line: 'Sam Seller answered "Lease?"' },
      }),
    );

    const { data: activity } = await admin
      .from('seller_room_activity')
      .select('action, payload')
      .eq('room_id', roomId)
      .eq('action', 'question_answered')
      .throwOnError();
    expect(activity).toEqual([
      { action: 'question_answered', payload: { question_id: questionId } },
    ]);
  });

  it('refuses a file the seller cannot see in the room', async () => {
    const asked = await askSeller({ dealId, title: 'Notes?', body: '' });
    world.signedInClient = seller.client;

    expect(
      await answerSellerQuestion({
        questionId: asked.ok ? asked.value : '',
        body: '',
        documentIds: [hiddenFile],
      }),
    ).toEqual({ ok: false, refusal: 'That file is not in this room.' });
  });

  it('refuses a file from another of the seller rooms', async () => {
    const otherDeal = await newDeal(teamId, owner);
    const { data: otherRoom } = await owner.client
      .rpc('ensure_seller_room', { deal_id: otherDeal })
      .throwOnError();
    const { data: otherUploads } = await admin
      .from('seller_room')
      .select('uploads_folder_id')
      .eq('id', otherRoom)
      .single()
      .throwOnError();
    await admin
      .from('seller_room_member')
      .insert({
        room_id: otherRoom,
        user_id: seller.userId,
        email: seller.email,
        name: 'Sam Seller',
      })
      .throwOnError();

    const otherFile = crypto.randomUUID();
    await admin
      .rpc('append_deal_event', {
        p_deal_id: otherDeal,
        p_aggregate_type: 'dr_document',
        p_aggregate_id: otherFile,
        p_event_type: 'dr_document.added',
        p_payload: {
          folder_id: otherUploads.uploads_folder_id,
          name: 'other.pdf',
          storage_path: `deal/${otherDeal}/${otherFile}`,
          version: 1,
        },
        p_actor_kind: 'service',
      })
      .throwOnError();

    const asked = await askSeller({ dealId, title: 'Which file?', body: '' });
    world.signedInClient = seller.client;

    expect(
      await answerSellerQuestion({
        questionId: asked.ok ? asked.value : '',
        body: '',
        documentIds: [otherFile],
      }),
    ).toEqual({ ok: false, refusal: 'That file is not in this room.' });
  });

  it('refuses an answer once the room closes, saying why, and records nothing', async () => {
    const asked = await askSeller({ dealId, title: 'Payroll?', body: '' });
    const questionId = asked.ok ? asked.value : '';
    await admin
      .from('seller_room')
      .update({ closed_at: new Date().toISOString() })
      .eq('id', roomId)
      .throwOnError();
    world.signedInClient = seller.client;

    const answered = await answerSellerQuestion({
      questionId,
      body: 'Late answer',
      documentIds: [],
    });

    await admin
      .from('seller_room')
      .update({ closed_at: null })
      .eq('id', roomId)
      .throwOnError();
    const { data: messages } = await admin
      .from('seller_room_question_message')
      .select('id')
      .eq('question_id', questionId)
      .eq('side', 'seller')
      .throwOnError();

    expect(answered).toEqual({
      ok: false,
      refusal: 'The seller room is closed, so this is read-only.',
    });
    expect(messages).toEqual([]);
  });

  it('refuses an empty answer', async () => {
    const asked = await askSeller({ dealId, title: 'Empty?', body: '' });
    world.signedInClient = seller.client;

    expect(
      await answerSellerQuestion({
        questionId: asked.ok ? asked.value : '',
        body: '  ',
        documentIds: [],
      }),
    ).toEqual({ ok: false, refusal: 'Write an answer or attach a file.' });
  });

  it('refuses someone outside the room', async () => {
    const asked = await askSeller({ dealId, title: 'Outsider?', body: '' });
    world.signedInClient = stranger.client;

    expect(
      await answerSellerQuestion({
        questionId: asked.ok ? asked.value : '',
        body: 'Hi',
        documentIds: [],
      }),
    ).toEqual({ ok: false, refusal: 'That question was not found.' });
  });
});

describe('requesting a checklist item from the seller', () => {
  async function checklistItem(title: string) {
    const id = crypto.randomUUID();
    await owner.client
      .rpc('append_deal_event', {
        p_deal_id: dealId,
        p_aggregate_type: 'checklist_item',
        p_aggregate_id: id,
        p_event_type: 'checklist_item.added',
        p_payload: { title },
      })
      .throwOnError();

    return id;
  }

  async function item(id: string) {
    const { data } = await admin
      .from('checklist_item')
      .select('waiting_on, status')
      .eq('id', id)
      .single()
      .throwOnError();

    return data;
  }

  it('asks in the seller room and marks the item requested and waiting on the seller', async () => {
    const itemId = await checklistItem('Tax returns');

    const asked = await requestChecklistItemFromSeller({
      checklistItemId: itemId,
      title: 'Tax returns',
      body: 'The last three years',
    });

    expect(asked.ok).toBe(true);
    expect(await question(asked.ok ? asked.value : '')).toMatchObject({
      title: 'Tax returns',
      body: 'The last three years',
      status: 'open',
    });
    expect(await item(itemId)).toEqual({
      waiting_on: 'seller',
      status: 'requested',
    });

    const { data: events } = await admin
      .from('deal_event')
      .select('event_type, actor_kind, actor_ref')
      .eq('aggregate_id', itemId)
      .neq('event_type', 'checklist_item.added')
      .order('deal_seq')
      .throwOnError();
    expect(events).toEqual([
      {
        event_type: 'checklist_item.status_changed',
        actor_kind: 'user',
        actor_ref: owner.userId,
      },
      {
        event_type: 'checklist_item.waiting_on_set',
        actor_kind: 'user',
        actor_ref: owner.userId,
      },
    ]);
  });

  it('marks the item received and waiting on us once the seller answers', async () => {
    const itemId = await checklistItem('Leases');
    const asked = await requestChecklistItemFromSeller({
      checklistItemId: itemId,
      title: 'Leases',
      body: '',
    });

    world.signedInClient = seller.client;
    expect(
      await answerSellerQuestion({
        questionId: asked.ok ? asked.value : '',
        body: 'Attached',
        documentIds: [],
      }),
    ).toMatchObject({ ok: true });

    expect(await item(itemId)).toEqual({
      waiting_on: 'us',
      status: 'received',
    });
  });

  it('leaves an item the team already reviewed alone when the seller answers', async () => {
    const itemId = await checklistItem('Insurance');
    const asked = await requestChecklistItemFromSeller({
      checklistItemId: itemId,
      title: 'Insurance',
      body: '',
    });
    await owner.client
      .rpc('append_deal_event', {
        p_deal_id: dealId,
        p_aggregate_type: 'checklist_item',
        p_aggregate_id: itemId,
        p_event_type: 'checklist_item.status_changed',
        p_payload: { status: 'reviewed', outcome: 'accepted' },
      })
      .throwOnError();

    world.signedInClient = seller.client;
    await answerSellerQuestion({
      questionId: asked.ok ? asked.value : '',
      body: 'One more policy',
      documentIds: [],
    });

    expect(await item(itemId)).toEqual({
      waiting_on: 'seller',
      status: 'reviewed',
    });
  });

  it('still records the request when the email to the seller fails', async () => {
    const itemId = await checklistItem('Vehicle titles');
    world.mailFails = true;

    expect(
      await requestChecklistItemFromSeller({
        checklistItemId: itemId,
        title: 'Vehicle titles',
        body: '',
      }),
    ).toEqual({
      ok: false,
      refusal: "Asked, but the email didn't send. Use Resend.",
    });
    expect(await item(itemId)).toEqual({
      waiting_on: 'seller',
      status: 'requested',
    });

    const { data: asked } = await admin
      .from('seller_room_question')
      .select('id')
      .eq('title', 'Vehicle titles')
      .single()
      .throwOnError();
    world.signedInClient = seller.client;
    await answerSellerQuestion({
      questionId: asked.id,
      body: 'Here',
      documentIds: [],
    });

    expect(await item(itemId)).toEqual({
      waiting_on: 'us',
      status: 'received',
    });
  });

  it('lets an analyst request an item', async () => {
    const analyst = await provisionPerson();
    await admin
      .from('accounts_memberships')
      .insert({
        account_id: teamId,
        user_id: analyst.userId,
        account_role: 'analyst',
      })
      .throwOnError();
    const itemId = await checklistItem('Customer contracts');

    world.signedInClient = analyst.client;
    expect(
      await requestChecklistItemFromSeller({
        checklistItemId: itemId,
        title: 'Customer contracts',
        body: '',
      }),
    ).toMatchObject({ ok: true });
    expect(await item(itemId)).toEqual({
      waiting_on: 'seller',
      status: 'requested',
    });
  });

  it('leaves the item alone when the seller room refuses the ask', async () => {
    const itemId = await checklistItem('Payroll');
    vi.stubEnv('SELLER_DELIVERY_FROM_EMAIL', '');

    expect(
      await requestChecklistItemFromSeller({
        checklistItemId: itemId,
        title: 'Payroll',
        body: '',
      }),
    ).toEqual({ ok: false, refusal: 'Seller email is not set up' });
    expect(await item(itemId)).toEqual({
      waiting_on: null,
      status: 'not_started',
    });
  });
});

describe('routing a lender ask through the seller', () => {
  let lenderRoomId: string;
  let lenderFolder: string;
  let askId: string;

  beforeAll(async () => {
    const { data: folder } = await admin
      .from('dr_folder')
      .insert({ account_id: teamId, deal_id: dealId, name: 'Bank room' })
      .select('id')
      .single()
      .throwOnError();
    lenderFolder = folder.id;

    const { data: room } = await admin
      .from('lender_room')
      .insert({
        account_id: teamId,
        deal_id: dealId,
        name: 'First Bank',
        private_folder_id: lenderFolder,
      })
      .select('id')
      .single()
      .throwOnError();
    lenderRoomId = room.id;

    const { data: ask } = await admin
      .from('lender_ask')
      .insert({
        room_id: lenderRoomId,
        account_id: teamId,
        kind: 'ask',
        title: 'First Bank needs the customer list',
      })
      .select('id')
      .single()
      .throwOnError();
    askId = ask.id;
  });

  it('asks the seller in the team words and sends the edited answer and file back to the lender', async () => {
    const asked = await askSellerAboutLenderAsk({
      lenderAskId: askId,
      title: 'Customer list?',
      body: 'Please share your customer list',
    });
    const questionId = asked.ok ? asked.value : '';

    world.signedInClient = seller.client;
    const { data: seen } = await seller.client
      .from('seller_room_question')
      .select('title, body')
      .eq('id', questionId)
      .single()
      .throwOnError();
    expect(seen).toEqual({
      title: 'Customer list?',
      body: 'Please share your customer list',
    });

    await answerSellerQuestion({
      questionId,
      body: 'here it is, thx',
      documentIds: [sellerFile],
    });

    world.signedInClient = owner.client;
    expect(
      await forwardSellerAnswer({
        questionId,
        body: 'The seller has shared the customer list.',
        documentIds: [sellerFile],
      }),
    ).toEqual({ ok: true, value: undefined });

    const { data: lenderAsk } = await admin
      .from('lender_ask')
      .select('status')
      .eq('id', askId)
      .single()
      .throwOnError();
    expect(lenderAsk.status).toBe('answered');

    const { data: lenderMessages } = await admin
      .from('lender_ask_message')
      .select('side, body')
      .eq('ask_id', askId)
      .throwOnError();
    expect(lenderMessages).toEqual([
      { side: 'internal', body: 'The seller has shared the customer list.' },
    ]);

    const { data: fulfilment } = await admin
      .from('lender_ask_file')
      .select('role, dr_document:dr_document_id')
      .eq('ask_id', askId)
      .throwOnError();
    expect(fulfilment).toHaveLength(1);

    const { data: copied } = await admin
      .from('dr_document')
      .select('folder_id, name, storage_path')
      .eq(
        'id',
        (fulfilment[0] as unknown as { dr_document: string }).dr_document,
      )
      .single()
      .throwOnError();
    expect(copied).toEqual({
      folder_id: lenderFolder,
      name: 'customers.xlsx',
      storage_path: `deal/${dealId}/${sellerFile}`,
    });

    expect((await question(questionId)).status).toBe('closed');
  });

  it('lets an analyst ask the seller about a lender request', async () => {
    world.signedInClient = (await newAnalyst('Lee Analyst')).client;

    const asked = await askSellerAboutLenderAsk({
      lenderAskId: askId,
      title: 'Lease terms?',
      body: '',
    });

    expect(asked.ok).toBe(true);
    expect(
      (await loadTeamQuestions(owner.client, dealId)).find(
        (candidate) => candidate.id === (asked.ok ? asked.value : ''),
      )?.fromLenderAsk,
    ).toBe(true);
  });

  it('refuses to forward a file the seller did not attach to the question', async () => {
    const asked = await askSellerAboutLenderAsk({
      lenderAskId: askId,
      title: 'Again?',
      body: '',
    });

    expect(
      await forwardSellerAnswer({
        questionId: asked.ok ? asked.value : '',
        body: 'Here',
        documentIds: [hiddenFile],
      }),
    ).toEqual({
      ok: false,
      refusal: 'Only files the seller attached can be sent to the lender.',
    });
  });

  it('refuses to forward a question that did not come from a lender ask', async () => {
    const asked = await askSeller({ dealId, title: 'Direct?', body: '' });

    expect(
      await forwardSellerAnswer({
        questionId: asked.ok ? asked.value : '',
        body: 'Here',
        documentIds: [],
      }),
    ).toEqual({
      ok: false,
      refusal: 'This question did not come from a lender.',
    });
  });
});

describe('reading the questions', () => {
  it('shows the seller each question with both sides of the thread and attached files', async () => {
    const asked = await askSeller({
      dealId,
      title: 'Thread?',
      body: 'Please explain',
    });
    const questionId = asked.ok ? asked.value : '';
    world.signedInClient = seller.client;
    await answerSellerQuestion({
      questionId,
      body: 'Explained',
      documentIds: [sellerFile],
    });

    const questions = await loadRoomQuestions(seller.client, roomId);
    const thread = questions.find((candidate) => candidate.id === questionId)!;

    expect(thread).toEqual(
      expect.objectContaining({
        title: 'Thread?',
        body: 'Please explain',
        status: 'answered',
        messages: [
          expect.objectContaining({ side: 'seller', body: 'Explained' }),
        ],
        files: [
          { documentId: sellerFile, name: 'customers.xlsx', side: 'seller' },
        ],
      }),
    );
  });

  it('shows the team which questions came from a lender, and the seller nothing of it', async () => {
    const team = await loadTeamQuestions(owner.client, dealId);
    const routed = team.filter((candidate) => candidate.fromLenderAsk);

    expect(routed.length).toBeGreaterThan(0);
    expect(
      (await loadRoomQuestions(seller.client, roomId)).every(
        (candidate) => !('fromLenderAsk' in candidate),
      ),
    ).toBe(true);
  });
});
