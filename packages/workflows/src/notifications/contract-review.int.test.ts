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
let buyerCounselId: string;
let sellerCounselId: string;
let dealId: string;
let contractId: string;
let sellerId: string;
let uncounselledDealId: string;
let uncounselledContractId: string;
let roomId: string;
let nextVersion = 1;
const emails = new Map<string, string>();

async function createUser(label: string): Promise<string> {
  const email = `int-review-${label}-${crypto.randomUUID().slice(0, 8)}@odb.test`;
  const { data } = await owner.admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  emails.set(data.user!.id, email);
  return data.user!.id;
}

async function addVersion(shared: boolean, contract = contractId) {
  const version = nextVersion++;
  const { data } = await owner.admin
    .from('contract_version')
    .insert({
      contract_id: contract,
      account_id: teamId,
      version,
      source: 'upload',
      party: 'buyer',
      author_user_id: managerId,
      shared_at: shared ? new Date().toISOString() : null,
    })
    .select('id, seller_number')
    .single()
    .throwOnError();
  return { id: data.id, version, sellerNumber: data.seller_number };
}

async function relayLatest(deal = dealId) {
  const { data: event } = await owner.admin
    .from('deal_event')
    .select('global_seq, event_type')
    .eq('deal_id', deal)
    .order('global_seq', { ascending: false })
    .limit(1)
    .single()
    .throwOnError();

  await notifyDealEvent({
    globalSeq: event.global_seq,
    workflowId: 'contract-negotiation',
    dealId: deal,
    accountId: teamId,
    actorRef: null,
    eventType: event.event_type,
  });

  return event.global_seq;
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

async function inAppNotices(seq: number) {
  const { data } = await owner.admin
    .from('notifications')
    .select('account_id, recipient_user_id, body, link, dedupe_key')
    .like('dedupe_key', `deal_event:${seq}:%`)
    .order('recipient_user_id')
    .throwOnError();
  return data;
}

const teamPath = (versionId: string) =>
  `/home/${teamSlug}/deals/${dealId}/documents#contract-review-${versionId}`;
const counselPath = (versionId: string) =>
  `/counsel/${dealId}/contracts#contract-review-${versionId}`;
const deal = { contractType: 'apa', dealName: 'Acme Tooling' };

beforeAll(async () => {
  owner = await provisionAccount();
  emails.set(
    owner.userId,
    (await owner.admin.auth.admin.getUserById(owner.userId)).data.user!.email!,
  );
  process.env.NOVU_API_KEY = 'secret';
  process.env.NOVU_API_URL = 'https://novu.test';

  teamSlug = `review-${crypto.randomUUID().slice(0, 8)}`;
  const { data: team } = await owner.admin
    .rpc('create_team_account', {
      account_name: 'Acme Capital',
      user_id: owner.userId,
      account_slug: teamSlug,
    })
    .throwOnError();
  teamId = team.id;

  managerId = await createUser('manager');
  buyerCounselId = await createUser('buyer-counsel');
  sellerCounselId = await createUser('seller-counsel');

  await owner.admin
    .from('accounts')
    .update({ name: 'Max Manager' })
    .eq('primary_owner_user_id', managerId)
    .eq('is_personal_account', true)
    .throwOnError();
  await owner.admin
    .from('accounts_memberships')
    .insert({ account_id: teamId, user_id: managerId, account_role: 'admin' })
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

  contractId = crypto.randomUUID();
  await appendDealEvent(owner.admin, {
    dealId,
    aggregateType: 'contract',
    aggregateId: contractId,
    eventType: 'contract.created',
    payload: { type: 'apa', status: 'draft', current_version: 1 },
  });

  sellerId = await createUser('seller');
  uncounselledDealId = await namedDeal(teamId);
  await owner.admin
    .from('deal_counsel')
    .insert({
      account_id: teamId,
      deal_id: uncounselledDealId,
      side: 'buyer',
      user_id: buyerCounselId,
      email: emails.get(buyerCounselId),
      name: 'Dana Lee',
    })
    .throwOnError();
  const { data: folder } = await owner.admin
    .from('dr_folder')
    .insert({
      account_id: teamId,
      deal_id: uncounselledDealId,
      name: 'Seller uploads',
    })
    .select('id')
    .single()
    .throwOnError();
  const { data: room } = await owner.admin
    .from('seller_room')
    .insert({
      account_id: teamId,
      deal_id: uncounselledDealId,
      uploads_folder_id: folder.id,
    })
    .select('id')
    .single()
    .throwOnError();
  roomId = room.id;
  await owner.admin
    .from('seller_room_member')
    .insert({
      room_id: roomId,
      user_id: sellerId,
      email: emails.get(sellerId)!,
      name: 'Sam Vendor',
    })
    .throwOnError();
  uncounselledContractId = crypto.randomUUID();
  await appendDealEvent(owner.admin, {
    dealId: uncounselledDealId,
    aggregateType: 'contract',
    aggregateId: uncounselledContractId,
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
  for (const userId of [managerId, buyerCounselId, sellerCounselId, sellerId]) {
    await owner.admin.auth.admin.deleteUser(userId);
  }
  await owner.cleanup();
});

describe('contract review notices (integration)', () => {
  it("asks buyer's counsel and seller's counsel to review a shared version, each by their own number", async () => {
    const version = await addVersion(true);
    await owner.admin
      .from('contract_review_request')
      .insert({
        account_id: teamId,
        contract_version_id: version.id,
        requested_by: managerId,
      })
      .throwOnError();

    const seq = await relayLatest();

    const notice = {
      ...deal,
      kind: 'review_requested',
      actor: 'Max Manager (Buyer)',
      path: counselPath(version.id),
    };
    expectSent([
      to(buyerCounselId, seq, { ...notice, version: version.version }),
      to(sellerCounselId, seq, { ...notice, version: version.sellerNumber }),
    ]);
    expect(await inAppNotices(seq)).toEqual([]);
  });

  it("asks only buyer's counsel to review a version hidden from the seller side", async () => {
    const version = await addVersion(false);
    await owner.admin
      .from('contract_review_request')
      .insert({
        account_id: teamId,
        contract_version_id: version.id,
        requested_by: managerId,
      })
      .throwOnError();

    const seq = await relayLatest();

    expectSent([
      to(buyerCounselId, seq, {
        ...deal,
        kind: 'review_requested',
        version: version.version,
        actor: 'Max Manager (Buyer)',
        path: counselPath(version.id),
      }),
    ]);
  });

  it("tells the team, in the app and by email, of seller's counsel's decision", async () => {
    const version = await addVersion(true);
    await owner.admin
      .from('contract_review_decision')
      .insert({
        account_id: teamId,
        contract_version_id: version.id,
        side: 'seller',
        decision: 'changes_needed',
        decided_by: sellerCounselId,
        without_counsel: false,
      })
      .throwOnError();

    const seq = await relayLatest();

    const notice = {
      ...deal,
      kind: 'review_decided',
      verdict: 'changes_needed',
      outForSignature: false,
      version: version.version,
      actor: "Sol Seller (Seller's counsel)",
      path: teamPath(version.id),
    };
    expectSent([to(owner.userId, seq, notice), to(managerId, seq, notice)]);
    expect(await inAppNotices(seq)).toEqual(
      [owner.userId, managerId].sort().map((userId) => ({
        account_id: teamId,
        recipient_user_id: userId,
        body: `Sol Seller (Seller's counsel) asked for changes to version ${version.version} of the APA on Acme Tooling.`,
        link: teamPath(version.id),
        dedupe_key: `deal_event:${seq}:${userId}`,
      })),
    );
  });

  it.each([
    ['draft', true],
    ['sent', true],
    ['completed', false],
  ])(
    'tells the team a version with a %s signature envelope that changes are needed, saying whether it is out for signature',
    async (signingStatus, outForSignature) => {
      const version = await addVersion(true);
      await owner.admin
        .from('contract_version')
        .update({ signing_status: signingStatus })
        .eq('id', version.id)
        .throwOnError();
      await owner.admin
        .from('contract_review_decision')
        .insert({
          account_id: teamId,
          contract_version_id: version.id,
          side: 'seller',
          decision: 'changes_needed',
          decided_by: sellerCounselId,
          without_counsel: false,
        })
        .throwOnError();

      const seq = await relayLatest();

      const notice = {
        ...deal,
        kind: 'review_decided',
        verdict: 'changes_needed',
        outForSignature,
        version: version.version,
        actor: "Sol Seller (Seller's counsel)",
        path: teamPath(version.id),
      };
      expectSent([to(owner.userId, seq, notice), to(managerId, seq, notice)]);
      expect((await inAppNotices(seq)).map((notice) => notice.body)).toEqual([
        `Sol Seller (Seller's counsel) asked for changes to version ${version.version} of the APA on Acme Tooling.${outForSignature ? ' It is already out for signature and was not recalled.' : ''}`,
        `Sol Seller (Seller's counsel) asked for changes to version ${version.version} of the APA on Acme Tooling.${outForSignature ? ' It is already out for signature and was not recalled.' : ''}`,
      ]);
    },
  );

  it('never says an approval is out for signature', async () => {
    const version = await addVersion(true);
    await owner.admin
      .from('contract_version')
      .update({ signing_status: 'sent' })
      .eq('id', version.id)
      .throwOnError();
    await owner.admin
      .from('contract_review_decision')
      .insert({
        account_id: teamId,
        contract_version_id: version.id,
        side: 'seller',
        decision: 'approved',
        decided_by: sellerCounselId,
        without_counsel: false,
      })
      .throwOnError();

    const seq = await relayLatest();

    expect((await inAppNotices(seq)).map((notice) => notice.body)).toEqual([
      `Sol Seller (Seller's counsel) approved version ${version.version} of the APA on Acme Tooling.`,
      `Sol Seller (Seller's counsel) approved version ${version.version} of the APA on Acme Tooling.`,
    ]);
    expect(
      novu.trigger.mock.calls.map(
        ([, data]) =>
          (data as { payload: { outForSignature: boolean } }).payload
            .outForSignature,
      ),
    ).toEqual([false, false]);
  });

  it('tells the team and both counsel of an override, with its reason, but not the one who overrode', async () => {
    const version = await addVersion(true);
    await owner.admin
      .from('contract_signing_override')
      .insert({
        account_id: teamId,
        contract_version_id: version.id,
        reason: 'Counsel approved by phone',
        overridden_by: managerId,
      })
      .throwOnError();

    const seq = await relayLatest();

    const notice = {
      ...deal,
      kind: 'signing_overridden',
      reason: 'Counsel approved by phone',
      actor: 'Max Manager (Buyer)',
    };
    expectSent([
      to(owner.userId, seq, {
        ...notice,
        version: version.version,
        path: teamPath(version.id),
      }),
      to(buyerCounselId, seq, {
        ...notice,
        version: version.version,
        path: counselPath(version.id),
      }),
      to(sellerCounselId, seq, {
        ...notice,
        version: version.sellerNumber,
        path: counselPath(version.id),
      }),
    ]);
    expect(await inAppNotices(seq)).toEqual([
      {
        account_id: teamId,
        recipient_user_id: owner.userId,
        body: `Max Manager (Buyer) overrode counsel sign-off on version ${version.version} of the APA on Acme Tooling: Counsel approved by phone`,
        link: teamPath(version.id),
        dedupe_key: `deal_event:${seq}:${owner.userId}`,
      },
    ]);
  });

  it('asks the seller to review a shared version when the seller has no counsel, linking to their room', async () => {
    const version = await addVersion(true, uncounselledContractId);
    await owner.admin
      .from('contract_review_request')
      .insert({
        account_id: teamId,
        contract_version_id: version.id,
        requested_by: managerId,
      })
      .throwOnError();

    const seq = await relayLatest(uncounselledDealId);

    const notice = {
      ...deal,
      kind: 'review_requested',
      actor: 'Max Manager (Buyer)',
    };
    expectSent([
      to(buyerCounselId, seq, {
        ...notice,
        version: version.version,
        path: `/counsel/${uncounselledDealId}/contracts#contract-review-${version.id}`,
      }),
      to(sellerId, seq, {
        ...notice,
        version: version.sellerNumber,
        outsideName: codeNameOf(uncounselledDealId),
        path: `/seller/rooms/${roomId}/contracts#contract-review-${version.id}`,
      }),
    ]);
  });

  it('tells the seller without counsel of an override on a shared version', async () => {
    const version = await addVersion(true, uncounselledContractId);
    await owner.admin
      .from('contract_signing_override')
      .insert({
        account_id: teamId,
        contract_version_id: version.id,
        reason: 'Counsel approved by phone',
        overridden_by: managerId,
      })
      .throwOnError();

    const seq = await relayLatest(uncounselledDealId);

    expect(
      sent()
        .map((notice) => notice.to.subscriberId)
        .sort(),
    ).toEqual([owner.userId, buyerCounselId, sellerId].sort());
    expect(
      sent().find((notice) => notice.to.subscriberId === sellerId),
    ).toEqual(
      to(sellerId, seq, {
        ...deal,
        kind: 'signing_overridden',
        reason: 'Counsel approved by phone',
        actor: 'Max Manager (Buyer)',
        version: version.sellerNumber,
        outsideName: codeNameOf(uncounselledDealId),
        path: `/seller/rooms/${roomId}/contracts#contract-review-${version.id}`,
      }),
    );
  });

  it('never tells the seller of a version hidden from the seller side', async () => {
    const version = await addVersion(false, uncounselledContractId);
    await owner.admin
      .from('contract_review_request')
      .insert({
        account_id: teamId,
        contract_version_id: version.id,
        requested_by: managerId,
      })
      .throwOnError();

    await relayLatest(uncounselledDealId);

    expect(sent().map((notice) => notice.to.subscriberId)).toEqual([
      buyerCounselId,
    ]);
  });

  it('writes each in-app notice once when the event is relayed again', async () => {
    const version = await addVersion(true);
    await owner.admin
      .from('contract_review_decision')
      .insert({
        account_id: teamId,
        contract_version_id: version.id,
        side: 'buyer',
        decision: 'approved',
        decided_by: buyerCounselId,
        without_counsel: false,
      })
      .throwOnError();

    const seq = await relayLatest();
    await relayLatest();

    expect(await inAppNotices(seq)).toHaveLength(2);
  });
});
