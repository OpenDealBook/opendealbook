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
  appendDealEvent,
  provisionAccount,
  seedDeal,
  type IntegrationAccount,
} from '../../test-support/integration-harness';

const novu = vi.hoisted(() => ({
  trigger: vi.fn(async (_workflowId: string, _data: unknown) => undefined),
  subscribers: { identify: vi.fn() },
}));

vi.mock('@odb/notifications/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@odb/notifications/server')>()),
  createNovuClient: () => novu,
}));

import { notifyDealEvent } from './relay';

let owner: IntegrationAccount;
let teamId: string;
let teamSlug: string;
let managerId: string;
let memberId: string;
let buyerCounselId: string;
let sellerCounselId: string;
let sellerId: string;
let dealId: string;
let contractId: string;
const emails = new Map<string, string>();

async function createUser(label: string): Promise<string> {
  const email = `int-negotiation-${label}-${crypto.randomUUID().slice(0, 8)}@odb.test`;
  const { data } = await owner.admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  emails.set(data.user!.id, email);
  return data.user!.id;
}

async function addVersion(input: {
  version: number;
  party: 'buyer' | 'seller';
  author: string;
  shared?: boolean;
}): Promise<string> {
  const { data } = await owner.admin
    .from('contract_version')
    .insert({
      contract_id: contractId,
      account_id: teamId,
      version: input.version,
      source: 'upload',
      party: input.party,
      author_user_id: input.author,
      shared_at: input.shared ? new Date().toISOString() : null,
    })
    .select('id')
    .single()
    .throwOnError();
  return data.id as string;
}

async function addComment(input: {
  versionId: string;
  author: string;
  side: 'buyer' | 'seller';
  internal?: boolean;
}): Promise<string> {
  const { data } = await owner.admin
    .from('contract_comment')
    .insert({
      account_id: teamId,
      contract_version_id: input.versionId,
      author_user_id: input.author,
      author_side: input.side,
      body: 'Section 4 needs a cap.',
      internal: input.internal ?? false,
    })
    .select('id')
    .single()
    .throwOnError();
  return data.id as string;
}

async function relay(
  eventType: string,
  aggregatePayload: Record<string, unknown>,
) {
  await appendDealEvent(owner.admin, {
    dealId,
    aggregateType: 'contract',
    aggregateId: contractId,
    eventType,
    payload: aggregatePayload,
  });
  const { data: event } = await owner.admin
    .from('deal_event')
    .select('global_seq')
    .eq('deal_id', dealId)
    .order('global_seq', { ascending: false })
    .limit(1)
    .single()
    .throwOnError();

  await notifyDealEvent({
    globalSeq: event.global_seq as number,
    workflowId: 'contract-negotiation',
    dealId,
    accountId: teamId,
    actorRef: null,
    eventType,
  });

  return event.global_seq as number;
}

function sent() {
  return novu.trigger.mock.calls
    .map(([workflowId, data]) => ({
      workflowId,
      ...(data as { to: { subscriberId: string } }),
    }))
    .sort((a, b) => a.to.subscriberId.localeCompare(b.to.subscriberId));
}

const codeNameOf = (id: string) => `Project ${id.slice(0, 8)}`;

async function namedDeal(accountId: string): Promise<string> {
  const { data: firm } = await owner.admin
    .from('firm')
    .insert({ account_id: accountId, name: 'Acme Tooling' })
    .select('id')
    .single()
    .throwOnError();
  const id = await seedDeal(owner.admin, accountId, owner.userId, {
    firm_id: firm.id,
    description: 'Private team description',
  });
  await appendDealEvent(owner.admin, {
    dealId: id,
    aggregateType: 'deal',
    aggregateId: id,
    eventType: 'deal.updated',
    payload: { code_name: codeNameOf(id) },
  });
  return id;
}

function to(userId: string, seq: number, payload: Record<string, unknown>) {
  const counselDealId = String(payload.path).startsWith('/counsel/')
    ? String(payload.path).split('/')[2]!
    : null;

  return {
    workflowId: 'contract-negotiation',
    to: { subscriberId: userId, email: emails.get(userId) },
    payload: {
      ...payload,
      ...(counselDealId ? { outsideName: codeNameOf(counselDealId) } : {}),
      ...(userId === buyerCounselId
        ? { dealName: codeNameOf(counselDealId!) }
        : {}),
    },
    transactionId: `contract-negotiation:${seq}:${userId}`,
  };
}

function expectSent(expected: ReturnType<typeof to>[]) {
  expect(sent()).toEqual(
    [...expected].sort((a, b) =>
      a.to.subscriberId.localeCompare(b.to.subscriberId),
    ),
  );
}

const teamPath = (anchor: string) =>
  `/home/${teamSlug}/deals/${dealId}/documents#${anchor}`;
const counselPath = (anchor: string) =>
  `/counsel/${dealId}/contracts#${anchor}`;

beforeAll(async () => {
  owner = await provisionAccount();
  emails.set(
    owner.userId,
    (await owner.admin.auth.admin.getUserById(owner.userId)).data.user!.email!,
  );
  process.env.NOVU_API_KEY = 'secret';
  process.env.NOVU_API_URL = 'https://novu.test';

  teamSlug = `negotiation-${crypto.randomUUID().slice(0, 8)}`;
  const { data: team } = await owner.admin
    .rpc('create_team_account', {
      account_name: 'Acme Capital',
      user_id: owner.userId,
      account_slug: teamSlug,
    })
    .throwOnError();
  teamId = team.id;

  managerId = await createUser('manager');
  memberId = await createUser('member');
  buyerCounselId = await createUser('buyer-counsel');
  sellerCounselId = await createUser('seller-counsel');
  sellerId = await createUser('seller');

  for (const [userId, name] of [
    [owner.userId, 'Olive Owner'],
    [managerId, 'Max Manager'],
  ] as const) {
    await owner.admin
      .from('accounts')
      .update({ name })
      .eq('primary_owner_user_id', userId)
      .eq('is_personal_account', true)
      .throwOnError();
  }

  await owner.admin
    .from('accounts_memberships')
    .insert([
      { account_id: teamId, user_id: managerId, account_role: 'admin' },
      { account_id: teamId, user_id: memberId, account_role: 'member' },
    ])
    .throwOnError();

  dealId = await namedDeal(teamId);

  await owner.admin
    .from('deal_counsel')
    .insert([
      {
        account_id: teamId,
        deal_id: dealId,
        side: 'buyer',
        user_id: buyerCounselId,
        email: emails.get(buyerCounselId),
        name: 'Dana Lee',
      },
      {
        account_id: teamId,
        deal_id: dealId,
        side: 'seller',
        user_id: sellerCounselId,
        email: emails.get(sellerCounselId),
        name: 'Sol Seller',
      },
    ])
    .throwOnError();

  const { data: folder } = await owner.admin
    .from('dr_folder')
    .insert({ account_id: teamId, deal_id: dealId, name: 'Seller uploads' })
    .select('id')
    .single()
    .throwOnError();
  const { data: room } = await owner.admin
    .from('seller_room')
    .insert({
      account_id: teamId,
      deal_id: dealId,
      uploads_folder_id: folder.id,
    })
    .select('id')
    .single()
    .throwOnError();
  await owner.admin
    .from('seller_room_member')
    .insert({
      room_id: room.id,
      user_id: sellerId,
      email: emails.get(sellerId)!,
      name: 'Sam Vendor',
    })
    .throwOnError();

  contractId = crypto.randomUUID();
  await appendDealEvent(owner.admin, {
    dealId,
    aggregateType: 'contract',
    aggregateId: contractId,
    eventType: 'contract.created',
    payload: { type: 'apa', status: 'draft', current_version: 1 },
  });
});

beforeEach(() => {
  novu.trigger.mockClear();
});

afterAll(async () => {
  delete process.env.NOVU_API_KEY;
  delete process.env.NOVU_API_URL;
  await owner.admin.from('accounts').delete().eq('id', teamId);
  for (const userId of [
    managerId,
    memberId,
    buyerCounselId,
    sellerCounselId,
    sellerId,
  ]) {
    await owner.admin.auth.admin.deleteUser(userId);
  }
  await owner.cleanup();
});

async function sellerNumberOf(versionId: string) {
  const { data } = await owner.admin
    .from('contract_version')
    .select('seller_number')
    .eq('id', versionId)
    .single()
    .throwOnError();
  return data.seller_number as number;
}

const deal = { contractType: 'apa', dealName: 'Acme Tooling' };

describe('contract negotiation emails (integration)', () => {
  it("tells the deal managers and buyer's counsel, but not the author or seller's counsel, of a version the team added", async () => {
    const versionId = await addVersion({
      version: 1,
      party: 'buyer',
      author: managerId,
    });

    const seq = await relay('contract.version_added', {
      version_id: versionId,
    });

    const notice = {
      ...deal,
      kind: 'version',
      version: 1,
      actor: 'Max Manager (Buyer)',
    };
    expectSent([
      to(owner.userId, seq, {
        ...notice,
        path: teamPath(`contract-version-${versionId}`),
      }),
      to(buyerCounselId, seq, {
        ...notice,
        path: counselPath(`contract-version-${versionId}`),
      }),
    ]);
  });

  it("tells the deal managers and buyer's counsel of a seller's counsel redline", async () => {
    const versionId = await addVersion({
      version: 2,
      party: 'seller',
      author: sellerCounselId,
    });

    const seq = await relay('contract.version_added', {
      version_id: versionId,
    });

    const notice = {
      ...deal,
      kind: 'version',
      version: 2,
      actor: "Sol Seller (Seller's counsel)",
    };
    expectSent([
      to(owner.userId, seq, {
        ...notice,
        path: teamPath(`contract-version-${versionId}`),
      }),
      to(managerId, seq, {
        ...notice,
        path: teamPath(`contract-version-${versionId}`),
      }),
      to(buyerCounselId, seq, {
        ...notice,
        path: counselPath(`contract-version-${versionId}`),
      }),
    ]);
  });

  it("tells only seller's counsel when a team version is shown to the seller side, by its seller-side number", async () => {
    const versionId = await addVersion({
      version: 3,
      party: 'buyer',
      author: managerId,
      shared: true,
    });
    const sellerNumber = await sellerNumberOf(versionId);

    const seq = await relay('contract.version_shown_to_seller_side', {
      version_id: versionId,
    });

    expect(sellerNumber).not.toBe(3);
    expectSent([
      to(sellerCounselId, seq, {
        ...deal,
        kind: 'version',
        version: sellerNumber,
        actor: 'Max Manager (Buyer)',
        path: counselPath(`contract-version-${versionId}`),
      }),
    ]);
  });

  it("tells the team, buyer's counsel and seller's counsel of a team comment on a shared version", async () => {
    const versionId = await addVersion({
      version: 4,
      party: 'buyer',
      author: managerId,
      shared: true,
    });
    const sellerNumber = await sellerNumberOf(versionId);
    const commentId = await addComment({
      versionId,
      author: managerId,
      side: 'buyer',
    });

    const seq = await relay('contract.comment_posted', {
      comment_id: commentId,
    });

    const notice = { ...deal, kind: 'comment', actor: 'Max Manager (Buyer)' };
    expectSent([
      to(owner.userId, seq, {
        ...notice,
        version: 4,
        path: teamPath(`contract-comment-${commentId}`),
      }),
      to(buyerCounselId, seq, {
        ...notice,
        version: 4,
        path: counselPath(`contract-comment-${commentId}`),
      }),
      to(sellerCounselId, seq, {
        ...notice,
        version: sellerNumber,
        path: counselPath(`contract-comment-${commentId}`),
      }),
    ]);
  });

  it("never tells seller's counsel of a comment on a version hidden from the seller side", async () => {
    const versionId = await addVersion({
      version: 5,
      party: 'buyer',
      author: managerId,
    });
    const commentId = await addComment({
      versionId,
      author: buyerCounselId,
      side: 'buyer',
    });

    const seq = await relay('contract.comment_posted', {
      comment_id: commentId,
    });

    const notice = {
      ...deal,
      kind: 'comment',
      version: 5,
      actor: "Dana Lee (Buyer's counsel)",
      path: teamPath(`contract-comment-${commentId}`),
    };
    expectSent([to(owner.userId, seq, notice), to(managerId, seq, notice)]);
  });

  it("tells only the team and buyer's counsel of an internal comment", async () => {
    const versionId = await addVersion({
      version: 6,
      party: 'buyer',
      author: managerId,
      shared: true,
    });
    const commentId = await addComment({
      versionId,
      author: managerId,
      side: 'buyer',
      internal: true,
    });

    const seq = await relay('contract.comment_posted', {
      comment_id: commentId,
    });

    const notice = {
      ...deal,
      kind: 'comment',
      version: 6,
      actor: 'Max Manager (Buyer)',
    };
    expectSent([
      to(owner.userId, seq, {
        ...notice,
        path: teamPath(`contract-comment-${commentId}`),
      }),
      to(buyerCounselId, seq, {
        ...notice,
        path: counselPath(`contract-comment-${commentId}`),
      }),
    ]);
  });

  it.each([
    [
      "seller's counsel",
      () => sellerCounselId,
      "Sol Seller (Seller's counsel)",
    ],
    ['a seller', () => sellerId, 'Sam Vendor (Seller)'],
  ])(
    "tells the team and both sides' counsel of a comment by %s, each by their own number",
    async (_, author, actor) => {
      const versionId = await addVersion({
        version: 7 + Number(author() === sellerId),
        party: 'seller',
        author: sellerCounselId,
      });
      const { data: version } = await owner.admin
        .from('contract_version')
        .select('version, seller_number')
        .eq('id', versionId)
        .single()
        .throwOnError();
      const commentId = await addComment({
        versionId,
        author: author(),
        side: 'seller',
      });

      const seq = await relay('contract.comment_posted', {
        comment_id: commentId,
      });

      const notice = { ...deal, kind: 'comment', actor };
      const counselOf = (userId: string, number: number) =>
        userId === author()
          ? []
          : [
              to(userId, seq, {
                ...notice,
                version: number,
                path: counselPath(`contract-comment-${commentId}`),
              }),
            ];
      expectSent([
        to(owner.userId, seq, {
          ...notice,
          version: version.version,
          path: teamPath(`contract-comment-${commentId}`),
        }),
        to(managerId, seq, {
          ...notice,
          version: version.version,
          path: teamPath(`contract-comment-${commentId}`),
        }),
        ...counselOf(buyerCounselId, version.version),
        ...counselOf(sellerCounselId, version.seller_number!),
      ]);
    },
  );
  it("does not tell seller's counsel of a comment written before the version was shown to them", async () => {
    const versionId = await addVersion({
      version: 9,
      party: 'buyer',
      author: managerId,
    });
    const commentId = await addComment({
      versionId,
      author: managerId,
      side: 'buyer',
    });
    await owner.admin
      .from('contract_version')
      .update({ shared_at: new Date(Date.now() + 1000).toISOString() })
      .eq('id', versionId)
      .throwOnError();
    novu.trigger.mockClear();

    const seq = await relay('contract.comment_posted', {
      comment_id: commentId,
    });

    const notice = {
      ...deal,
      kind: 'comment',
      version: 9,
      actor: 'Max Manager (Buyer)',
    };
    expectSent([
      to(owner.userId, seq, {
        ...notice,
        path: teamPath(`contract-comment-${commentId}`),
      }),
      to(buyerCounselId, seq, {
        ...notice,
        path: counselPath(`contract-comment-${commentId}`),
      }),
    ]);
  });

  it("does not tell seller's counsel of a reply in a thread started before the version was shown to them", async () => {
    const versionId = await addVersion({
      version: 14,
      party: 'buyer',
      author: managerId,
    });
    const rootId = await addComment({
      versionId,
      author: managerId,
      side: 'buyer',
    });
    await owner.admin
      .from('contract_version')
      .update({ shared_at: new Date().toISOString() })
      .eq('id', versionId)
      .throwOnError();
    const { data: reply } = await owner.admin
      .from('contract_comment')
      .insert({
        account_id: teamId,
        contract_version_id: versionId,
        parent_id: rootId,
        author_user_id: managerId,
        author_side: 'buyer',
        body: 'Following up on the cap.',
      })
      .select('id')
      .single()
      .throwOnError();
    novu.trigger.mockClear();

    const seq = await relay('contract.comment_posted', {
      comment_id: reply.id,
    });

    const notice = {
      ...deal,
      kind: 'comment',
      version: 14,
      actor: 'Max Manager (Buyer)',
    };
    expectSent([
      to(owner.userId, seq, {
        ...notice,
        path: teamPath(`contract-comment-${reply.id}`),
      }),
      to(buyerCounselId, seq, {
        ...notice,
        path: counselPath(`contract-comment-${reply.id}`),
      }),
    ]);
  });

  it('tells nobody when a version shown to the seller side is taken back before the email goes out', async () => {
    const versionId = await addVersion({
      version: 10,
      party: 'buyer',
      author: managerId,
      shared: true,
    });
    await owner.admin
      .from('contract_version')
      .update({ shared_at: null })
      .eq('id', versionId)
      .throwOnError();

    await relay('contract.version_shown_to_seller_side', {
      version_id: versionId,
    });

    expectSent([]);
  });

  it('tells only the team once the deal is archived', async () => {
    const versionId = await addVersion({
      version: 11,
      party: 'seller',
      author: managerId,
    });
    await appendDealEvent(owner.admin, {
      dealId,
      aggregateType: 'deal',
      aggregateId: dealId,
      eventType: 'deal.archived',
    });

    try {
      const seq = await relay('contract.version_added', {
        version_id: versionId,
      });

      expectSent([
        to(owner.userId, seq, {
          ...deal,
          kind: 'version',
          version: 11,
          actor: 'Max Manager (Buyer)',
          path: teamPath(`contract-version-${versionId}`),
        }),
      ]);
    } finally {
      await appendDealEvent(owner.admin, {
        dealId,
        aggregateType: 'deal',
        aggregateId: dealId,
        eventType: 'deal.unarchived',
      });
    }
  });

  it('logs a failed email and still sends the rest', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    novu.trigger.mockRejectedValueOnce(new Error('Novu is down'));
    const versionId = await addVersion({
      version: 12,
      party: 'buyer',
      author: managerId,
    });

    await relay('contract.version_added', { version_id: versionId });

    expect(novu.trigger).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Novu contract negotiation notification failed'),
      expect.objectContaining({ message: 'Novu is down' }),
    );
    warn.mockRestore();
  });
});

describe('contract negotiation emails for a deleted deal (integration)', () => {
  it('completes without emailing anyone when the deal was deleted with its team after its event was read', async () => {
    const { data: team } = await owner.admin
      .rpc('create_team_account', {
        account_name: 'Departed Capital',
        user_id: owner.userId,
        account_slug: `departed-${crypto.randomUUID().slice(0, 8)}`,
      })
      .throwOnError();
    const departedDealId = await namedDeal(team.id);
    const departedContractId = crypto.randomUUID();
    await appendDealEvent(owner.admin, {
      dealId: departedDealId,
      aggregateType: 'contract',
      aggregateId: departedContractId,
      eventType: 'contract.created',
      payload: { type: 'apa', status: 'draft', current_version: 1 },
    });
    const { data: version } = await owner.admin
      .from('contract_version')
      .insert({
        contract_id: departedContractId,
        account_id: team.id,
        version: 1,
        source: 'upload',
        party: 'buyer',
        author_user_id: owner.userId,
      })
      .select('id')
      .single()
      .throwOnError();
    await appendDealEvent(owner.admin, {
      dealId: departedDealId,
      aggregateType: 'contract',
      aggregateId: departedContractId,
      eventType: 'contract.version_added',
      payload: { version_id: version.id },
    });
    const { data: event } = await owner.admin
      .from('deal_event')
      .select('global_seq')
      .eq('deal_id', departedDealId)
      .eq('event_type', 'contract.version_added')
      .single()
      .throwOnError();
    await owner.admin
      .from('accounts')
      .delete()
      .eq('id', team.id)
      .throwOnError();

    await notifyDealEvent({
      globalSeq: event.global_seq as number,
      workflowId: 'contract-negotiation',
      dealId: departedDealId,
      accountId: team.id,
      actorRef: null,
      eventType: 'contract.version_added',
    });

    expect(novu.trigger).not.toHaveBeenCalled();
  });
});
