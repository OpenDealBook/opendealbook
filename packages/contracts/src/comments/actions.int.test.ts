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
} from '../../../features/seller-rooms/src/test-support/world.ts';

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON_KEY);
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY);

const world = vi.hoisted(() => ({ signedInClient: null as unknown }));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => world.signedInClient,
}));

const {
  admin,
  cleanUp,
  newDeal,
  provisionPerson,
  provisionTeam,
  withLockedTeam,
} = await import('../../../features/seller-rooms/src/test-support/world.ts');
const {
  addContractComment,
  reopenContractComment,
  replyToContractComment,
  resolveContractComment,
} = await import('./actions');

const { COMMENT_TOO_LONG, INTERNAL_BUYER_ONLY, NOT_ALLOWED } =
  await import('../types');

const READ_ONLY = 'This team is read-only until billing is updated.';

type Person = Awaited<ReturnType<typeof provisionPerson>>;

let owner: Person;
let teamMember: Person;
let buyerCounsel: Person;
let sellerCounsel: Person;
let stranger: Person;
let seller: Person;
let memberSellerCounsel: Person;
let memberSeller: Person;
let teamId: string;
let contractId: string;
let nextVersion = 3;
let dealId: string;
let buyerDraftId: string;
let sellerVersionId: string;

async function newVersion(party: 'buyer' | 'seller', version = nextVersion++) {
  const { data } = await admin
    .from('contract_version')
    .insert({
      contract_id: contractId,
      account_id: teamId,
      version,
      source: 'upload',
      party,
    })
    .select('id')
    .single()
    .throwOnError();

  return data.id;
}

async function commentsOn(versionId: string) {
  const { data } = await admin
    .from('contract_comment')
    .select(
      'id, parent_id, author_user_id, author_side, quoted_text, body, internal, resolved_at',
    )
    .eq('contract_version_id', versionId)
    .order('created_at')
    .throwOnError();

  return data;
}

async function seedComment(
  versionId: string,
  author: Person,
  side: 'buyer' | 'seller',
  { internal = false, resolved = false } = {},
) {
  const { data } = await admin
    .from('contract_comment')
    .insert({
      account_id: teamId,
      contract_version_id: versionId,
      author_user_id: author.userId,
      author_side: side,
      body: 'Fix clause 4',
      internal,
      resolved_at: resolved ? new Date().toISOString() : null,
    })
    .select('id')
    .single()
    .throwOnError();

  return data.id;
}

async function resolvedAt(commentId: string) {
  const { data } = await admin
    .from('contract_comment')
    .select('resolved_at')
    .eq('id', commentId)
    .single()
    .throwOnError();

  return data.resolved_at;
}

async function makeCounsel(person: Person, side: 'buyer' | 'seller') {
  await admin
    .from('deal_counsel')
    .insert({
      account_id: teamId,
      deal_id: dealId,
      side,
      user_id: person.userId,
      email: person.email,
    })
    .throwOnError();
}

beforeAll(async () => {
  owner = await provisionPerson();
  teamMember = await provisionPerson();
  buyerCounsel = await provisionPerson();
  sellerCounsel = await provisionPerson();
  stranger = await provisionPerson();
  seller = await provisionPerson();
  memberSellerCounsel = await provisionPerson();
  memberSeller = await provisionPerson();
  teamId = await provisionTeam(owner, 'Comment Partners');
  dealId = await newDeal(teamId, owner);

  await admin
    .from('accounts_memberships')
    .insert(
      [teamMember, memberSellerCounsel, memberSeller].map((person) => ({
        account_id: teamId,
        user_id: person.userId,
        account_role: 'viewer',
      })),
    )
    .throwOnError();
  await makeCounsel(buyerCounsel, 'buyer');
  await makeCounsel(sellerCounsel, 'seller');
  await makeCounsel(memberSellerCounsel, 'seller');

  const { data: roomId } = await owner.client
    .rpc('ensure_seller_room', { deal_id: dealId })
    .throwOnError();
  await admin
    .from('seller_room_member')
    .insert(
      [seller, memberSeller].map((person) => ({
        room_id: roomId,
        user_id: person.userId,
        email: person.email,
        name: 'Sam Seller',
      })),
    )
    .throwOnError();

  contractId = crypto.randomUUID();
  await admin
    .rpc('append_deal_event', {
      p_deal_id: dealId,
      p_aggregate_type: 'contract',
      p_aggregate_id: contractId,
      p_event_type: 'contract.created',
      p_payload: { type: 'apa', status: 'draft', current_version: 0 },
      p_actor_kind: 'service',
    })
    .throwOnError();

  buyerDraftId = await newVersion('buyer', 1);
  sellerVersionId = await newVersion('seller', 2);
});

beforeEach(() => {
  world.signedInClient = owner.client;
});

afterAll(async () => {
  await cleanUp([teamId]);
});

describe('addContractComment', () => {
  it('stores a deal manager comment on the buyer side, with its quoted text', async () => {
    const versionId = await newVersion('buyer');

    expect(
      await addContractComment({
        contractVersionId: versionId,
        quotedText: 'Purchase price',
        body: 'Price needs to drop',
        internal: false,
      }),
    ).toEqual({ ok: true });

    expect(await commentsOn(versionId)).toEqual([
      expect.objectContaining({
        parent_id: null,
        author_user_id: owner.userId,
        author_side: 'buyer',
        quoted_text: 'Purchase price',
        body: 'Price needs to drop',
        internal: false,
        resolved_at: null,
      }),
    ]);
  });

  it('lets the team mark a comment internal', async () => {
    const versionId = await newVersion('buyer');

    await addContractComment({
      contractVersionId: versionId,
      body: 'Our walk-away is 2.1M',
      internal: true,
    });

    expect((await commentsOn(versionId)).map((c) => c.internal)).toEqual([
      true,
    ]);
  });

  it("stores buyer's counsel comments on the buyer side", async () => {
    world.signedInClient = buyerCounsel.client;
    const versionId = await newVersion('buyer');

    await addContractComment({
      contractVersionId: versionId,
      body: 'Indemnity cap is too low',
      internal: true,
    });

    expect(await commentsOn(versionId)).toEqual([
      expect.objectContaining({
        author_user_id: buyerCounsel.userId,
        author_side: 'buyer',
        internal: true,
      }),
    ]);
  });

  it("stores seller's counsel comments on the seller side", async () => {
    world.signedInClient = sellerCounsel.client;
    const versionId = await newVersion('seller');

    await addContractComment({
      contractVersionId: versionId,
      body: 'Seller will not accept this',
      internal: false,
    });

    expect(await commentsOn(versionId)).toEqual([
      expect.objectContaining({
        author_user_id: sellerCounsel.userId,
        author_side: 'seller',
        internal: false,
      }),
    ]);
  });

  it("refuses seller's counsel an internal comment", async () => {
    world.signedInClient = sellerCounsel.client;
    const versionId = await newVersion('seller');

    await expect(
      addContractComment({
        contractVersionId: versionId,
        body: 'Hidden from the buyer',
        internal: true,
      }),
    ).resolves.toEqual({ ok: false, refusal: INTERNAL_BUYER_ONLY });
    expect(await commentsOn(versionId)).toEqual([]);
  });

  it('takes a comment of exactly 5,000 characters', async () => {
    const versionId = await newVersion('buyer');

    await expect(
      addContractComment({
        contractVersionId: versionId,
        quotedText: 'q'.repeat(5000),
        body: 'b'.repeat(5000),
        internal: false,
      }),
    ).resolves.toEqual({ ok: true });
  });

  it.each([
    ['body', { body: 'b'.repeat(5001) }],
    ['quoted text', { body: 'Fine', quotedText: 'q'.repeat(5001) }],
  ])(
    'refuses a comment whose %s runs past 5,000 characters',
    async (_, text) => {
      const versionId = await newVersion('buyer');

      await expect(
        addContractComment({
          contractVersionId: versionId,
          internal: false,
          ...text,
        }),
      ).resolves.toEqual({ ok: false, refusal: COMMENT_TOO_LONG });
      expect(await commentsOn(versionId)).toEqual([]);
    },
  );

  it("refuses seller's counsel a version hidden from the seller side", async () => {
    world.signedInClient = sellerCounsel.client;

    await expect(
      addContractComment({
        contractVersionId: buyerDraftId,
        body: 'Peeking at the draft',
        internal: false,
      }),
    ).resolves.toEqual({ ok: false, refusal: NOT_ALLOWED });
    expect(await commentsOn(buyerDraftId)).toEqual([]);
  });

  it('stores a seller comment on the seller side', async () => {
    world.signedInClient = seller.client;
    const versionId = await newVersion('seller');

    await addContractComment({
      contractVersionId: versionId,
      body: 'We need a longer transition',
      internal: false,
    });

    expect(await commentsOn(versionId)).toEqual([
      expect.objectContaining({
        author_user_id: seller.userId,
        author_side: 'seller',
        internal: false,
      }),
    ]);
  });

  it('refuses a seller an internal comment', async () => {
    world.signedInClient = seller.client;
    const versionId = await newVersion('seller');

    await expect(
      addContractComment({
        contractVersionId: versionId,
        body: 'Hidden from the buyer',
        internal: true,
      }),
    ).resolves.toEqual({ ok: false, refusal: INTERNAL_BUYER_ONLY });
    expect(await commentsOn(versionId)).toEqual([]);
  });

  it('refuses a seller a version hidden from the seller side', async () => {
    world.signedInClient = seller.client;

    await expect(
      addContractComment({
        contractVersionId: buyerDraftId,
        body: 'Peeking at the draft',
        internal: false,
      }),
    ).resolves.toEqual({ ok: false, refusal: NOT_ALLOWED });
    expect(await commentsOn(buyerDraftId)).toEqual([]);
  });

  it.each([
    ["seller's counsel", () => memberSellerCounsel],
    ['a seller', () => memberSeller],
  ])(
    'lets a read-only team member who is also %s comment as the seller side',
    async (_, who) => {
      world.signedInClient = who().client;
      const versionId = await newVersion('seller');

      await addContractComment({
        contractVersionId: versionId,
        body: 'Speaking for the seller',
        internal: false,
      });

      expect(await commentsOn(versionId)).toEqual([
        expect.objectContaining({
          author_user_id: who().userId,
          author_side: 'seller',
        }),
      ]);
    },
  );

  it.each([
    ['a read-only team member', () => teamMember],
    ['someone outside the deal', () => stranger],
  ])('refuses %s', async (_, who) => {
    world.signedInClient = who().client;

    await expect(
      addContractComment({
        contractVersionId: sellerVersionId,
        body: 'Not mine to say',
        internal: false,
      }),
    ).resolves.toEqual({ ok: false, refusal: NOT_ALLOWED });
    expect(await commentsOn(sellerVersionId)).toEqual([]);
  });

  it.each([
    ['the team', () => owner, 'buyer'],
    ["buyer's counsel", () => buyerCounsel, 'buyer'],
    ["seller's counsel", () => sellerCounsel, 'seller'],
  ] as const)('refuses %s while the team is locked', async (_, who, party) => {
    world.signedInClient = who().client;
    const versionId = await newVersion(party);

    await withLockedTeam(teamId, async () => {
      await expect(
        addContractComment({
          contractVersionId: versionId,
          body: 'While locked',
          internal: false,
        }),
      ).resolves.toEqual({ ok: false, refusal: READ_ONLY });
    });

    expect(await commentsOn(versionId)).toEqual([]);
  });
});

describe('comment posted events', () => {
  async function postedEvents(versionId: string) {
    const ids = (await commentsOn(versionId)).map((comment) => comment.id);
    const { data } = await admin
      .from('deal_event')
      .select('aggregate_id, payload')
      .eq('deal_id', dealId)
      .eq('event_type', 'contract.comment_posted')
      .in('payload->>comment_id', ids)
      .order('global_seq')
      .throwOnError();

    return { ids, events: data };
  }

  it.each([
    ['a deal manager', () => owner],
    ["seller's counsel", () => sellerCounsel],
    ['a seller', () => seller],
  ])('logs a comment and a reply by %s on the deal', async (_, who) => {
    world.signedInClient = who().client;
    const versionId = await newVersion('seller');

    await addContractComment({
      contractVersionId: versionId,
      body: 'Earn-out terms are unclear',
      internal: false,
    });
    const [parent] = await commentsOn(versionId);
    await replyToContractComment({
      parentId: parent!.id,
      body: 'Agreed',
      internal: false,
    });

    const { ids, events } = await postedEvents(versionId);
    expect(events).toEqual(
      ids.map((id) => ({
        aggregate_id: contractId,
        payload: { comment_id: id },
      })),
    );
    expect(ids).toHaveLength(2);
  });
});

describe('replyToContractComment', () => {
  it('threads a reply under its parent on the same version', async () => {
    const versionId = await newVersion('seller');
    await addContractComment({
      contractVersionId: versionId,
      body: 'Price needs to drop',
      internal: false,
    });
    const [parent] = await commentsOn(versionId);

    world.signedInClient = sellerCounsel.client;
    await replyToContractComment({
      parentId: parent!.id,
      body: 'It will not',
      internal: false,
    });

    expect(await commentsOn(versionId)).toEqual([
      expect.objectContaining({ id: parent!.id, parent_id: null }),
      expect.objectContaining({
        parent_id: parent!.id,
        author_user_id: sellerCounsel.userId,
        author_side: 'seller',
        body: 'It will not',
      }),
    ]);
  });

  it('refuses a reply that runs past 5,000 characters', async () => {
    const versionId = await newVersion('buyer');
    await addContractComment({
      contractVersionId: versionId,
      body: 'Earn-out terms are unclear',
      internal: false,
    });
    const [parent] = await commentsOn(versionId);

    await expect(
      replyToContractComment({
        parentId: parent!.id,
        body: 'b'.repeat(5001),
        internal: false,
      }),
    ).resolves.toEqual({ ok: false, refusal: COMMENT_TOO_LONG });
    expect(await commentsOn(versionId)).toHaveLength(1);
  });

  it('makes a reply to an internal comment internal', async () => {
    const versionId = await newVersion('buyer');
    const parentId = await seedComment(versionId, buyerCounsel, 'buyer', {
      internal: true,
    });

    await replyToContractComment({
      parentId,
      body: 'Agreed, hold at 2.1M',
      internal: false,
    });

    expect(await commentsOn(versionId)).toEqual([
      expect.objectContaining({ id: parentId }),
      expect.objectContaining({ parent_id: parentId, internal: true }),
    ]);
  });

  it('lets the buyer side reply internally under a shared comment', async () => {
    const versionId = await newVersion('buyer');
    const parentId = await seedComment(versionId, buyerCounsel, 'buyer');

    await replyToContractComment({
      parentId,
      body: 'Between us, we can give on this',
      internal: true,
    });

    expect(await commentsOn(versionId)).toEqual([
      expect.objectContaining({ id: parentId, internal: false }),
      expect.objectContaining({ parent_id: parentId, internal: true }),
    ]);
  });

  it("refuses seller's counsel a reply to an internal comment", async () => {
    const versionId = await newVersion('seller');
    await addContractComment({
      contractVersionId: versionId,
      body: 'Our walk-away is 2.1M',
      internal: true,
    });
    const [parent] = await commentsOn(versionId);

    world.signedInClient = sellerCounsel.client;

    await expect(
      replyToContractComment({
        parentId: parent!.id,
        body: 'Interesting',
        internal: false,
      }),
    ).resolves.toEqual({ ok: false, refusal: NOT_ALLOWED });
    expect(await commentsOn(versionId)).toHaveLength(1);
  });
});

describe('resolveContractComment', () => {
  it.each([
    ['a deal manager', () => owner, 'buyer'],
    ["buyer's counsel", () => buyerCounsel, 'buyer'],
    ["seller's counsel", () => sellerCounsel, 'seller'],
    ['a seller', () => seller, 'seller'],
  ] as const)(
    'lets %s resolve a comment from their own side',
    async (_, who, side) => {
      const versionId = await newVersion('seller');
      const commentId = await seedComment(versionId, who(), side);

      world.signedInClient = who().client;
      await resolveContractComment({ commentId });

      expect(await resolvedAt(commentId)).not.toBeNull();
    },
  );

  it.each([
    ['a deal manager', () => owner, () => sellerCounsel, 'seller'],
    ["buyer's counsel", () => buyerCounsel, () => seller, 'seller'],
    ["seller's counsel", () => sellerCounsel, () => owner, 'buyer'],
    ['a seller', () => seller, () => buyerCounsel, 'buyer'],
    [
      'a read-only team member',
      () => teamMember,
      () => owner,
      'buyer',
    ],
  ] as const)(
    'refuses %s a comment from the other side or without the right',
    async (_, who, author, side) => {
      const versionId = await newVersion('seller');
      const commentId = await seedComment(versionId, author(), side);

      world.signedInClient = who().client;

      await expect(resolveContractComment({ commentId })).resolves.toEqual({
        ok: false,
        refusal: NOT_ALLOWED,
      });
      expect(await resolvedAt(commentId)).toBeNull();
    },
  );

  it.each([
    ["buyer's counsel", () => buyerCounsel, 'buyer'],
    ["seller's counsel", () => sellerCounsel, 'seller'],
  ] as const)('refuses %s while the team is locked', async (_, who, side) => {
    const versionId = await newVersion('seller');
    const commentId = await seedComment(versionId, who(), side);

    world.signedInClient = who().client;

    await withLockedTeam(teamId, async () => {
      await expect(resolveContractComment({ commentId })).resolves.toEqual({
        ok: false,
        refusal: READ_ONLY,
      });
    });

    expect(await resolvedAt(commentId)).toBeNull();
  });
});

describe('reopenContractComment', () => {
  it.each([
    ['a deal manager', () => owner, () => buyerCounsel, 'buyer'],
    ["buyer's counsel", () => buyerCounsel, () => owner, 'buyer'],
    ["seller's counsel", () => sellerCounsel, () => seller, 'seller'],
    ['a seller', () => seller, () => sellerCounsel, 'seller'],
  ] as const)(
    'lets %s reopen a resolved comment from their own side',
    async (_, who, author, side) => {
      const versionId = await newVersion('seller');
      const commentId = await seedComment(versionId, author(), side, {
        resolved: true,
      });

      world.signedInClient = who().client;
      await reopenContractComment({ commentId });

      expect(await resolvedAt(commentId)).toBeNull();
    },
  );

  it.each([
    ['a deal manager', () => owner, () => sellerCounsel, 'seller'],
    ["buyer's counsel", () => buyerCounsel, () => seller, 'seller'],
    ["seller's counsel", () => sellerCounsel, () => owner, 'buyer'],
    ['a seller', () => seller, () => buyerCounsel, 'buyer'],
    [
      'a read-only team member',
      () => teamMember,
      () => owner,
      'buyer',
    ],
  ] as const)(
    'refuses %s a comment from the other side or without the right',
    async (_, who, author, side) => {
      const versionId = await newVersion('seller');
      const commentId = await seedComment(versionId, author(), side, {
        resolved: true,
      });

      world.signedInClient = who().client;

      await expect(reopenContractComment({ commentId })).resolves.toEqual({
        ok: false,
        refusal: NOT_ALLOWED,
      });
      expect(await resolvedAt(commentId)).not.toBeNull();
    },
  );

  it.each([
    ['the team', () => owner, 'buyer'],
    ["buyer's counsel", () => buyerCounsel, 'buyer'],
    ["seller's counsel", () => sellerCounsel, 'seller'],
  ] as const)('refuses %s while the team is locked', async (_, who, side) => {
    const versionId = await newVersion('seller');
    const commentId = await seedComment(versionId, who(), side, {
      resolved: true,
    });

    world.signedInClient = who().client;

    await withLockedTeam(teamId, async () => {
      await expect(reopenContractComment({ commentId })).resolves.toEqual({
        ok: false,
        refusal: READ_ONLY,
      });
    });

    expect(await resolvedAt(commentId)).not.toBeNull();
  });
});

describe('a seller while the team is locked', () => {
  it('comments, replies, resolves and reopens', async () => {
    world.signedInClient = seller.client;
    const versionId = await newVersion('seller');

    await withLockedTeam(teamId, async () => {
      await addContractComment({
        contractVersionId: versionId,
        body: 'Still here',
        internal: false,
      });
      const [comment] = await commentsOn(versionId);
      await replyToContractComment({
        parentId: comment!.id,
        body: 'And still talking',
        internal: false,
      });
      await resolveContractComment({ commentId: comment!.id });
      expect(await resolvedAt(comment!.id)).not.toBeNull();
      await reopenContractComment({ commentId: comment!.id });
    });

    expect(await commentsOn(versionId)).toEqual([
      expect.objectContaining({
        author_side: 'seller',
        body: 'Still here',
        resolved_at: null,
      }),
      expect.objectContaining({
        author_side: 'seller',
        body: 'And still talking',
      }),
    ]);
  });
});
