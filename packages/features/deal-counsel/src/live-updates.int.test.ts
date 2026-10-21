import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  admin,
  cleanUp,
  newDeal,
  provisionPerson,
  provisionTeam,
} from '@odb/seller-rooms/test-support/world.ts';

type Person = Awaited<ReturnType<typeof provisionPerson>>;
type LiveTable =
  | 'seller_counsel_message'
  | 'counsel_message'
  | 'contract_comment'
  | 'seller_room_comment';

let owner: Person;
let buyerCounsel: Person;
let sellerCounsel: Person;
let stranger: Person;
let seller: Person;
let roomId: string;
let questionId: string;
let teamId: string;
let dealId: string;
let versionId: string;

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

async function watch(
  person: Person,
  table: LiveTable,
  filter: string,
  event: 'INSERT' | 'UPDATE' = 'INSERT',
) {
  const bodies: string[] = [];
  const channel = person.client.channel(`${table}:${crypto.randomUUID()}`);

  await new Promise<void>((listening) =>
    channel
      .on(
        'postgres_changes',
        { event, schema: 'public', table, filter },
        (change) => bodies.push((change.new as { body: string }).body),
      )
      .on('system', {}, (message: { extension: string }) => {
        if (message.extension === 'postgres_changes') {
          listening();
        }
      })
      .subscribe(),
  );

  return {
    bodies,
    stop: () => person.client.removeChannel(channel),
  };
}

async function settle(bodies: string[], expected: number) {
  for (
    let waited = 0;
    waited < 10_000 && bodies.length < expected;
    waited += 100
  ) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await new Promise((resolve) => setTimeout(resolve, 1_500));
}

beforeAll(async () => {
  owner = await provisionPerson();
  buyerCounsel = await provisionPerson();
  sellerCounsel = await provisionPerson();
  stranger = await provisionPerson();
  seller = await provisionPerson();
  teamId = await provisionTeam(owner, 'Live Partners');
  dealId = await newDeal(teamId, owner);
  await makeCounsel(buyerCounsel, 'buyer');
  await makeCounsel(sellerCounsel, 'seller');

  const contractId = crypto.randomUUID();
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
  const { data: version } = await admin
    .from('contract_version')
    .insert({
      contract_id: contractId,
      account_id: teamId,
      version: 1,
      source: 'upload',
      party: 'buyer',
    })
    .select('id')
    .single()
    .throwOnError();
  versionId = version.id;

  const { data: room } = await owner.client
    .rpc('ensure_seller_room', { deal_id: dealId })
    .throwOnError();
  roomId = room;
  await admin
    .from('seller_room_member')
    .insert({
      room_id: roomId,
      user_id: seller.userId,
      email: seller.email,
      name: 'Sam Seller',
    })
    .throwOnError();
  const { data: question } = await admin
    .from('seller_room_question')
    .insert({ room_id: roomId, account_id: teamId, title: 'Customer list?' })
    .select('id')
    .single()
    .throwOnError();
  questionId = question.id;
});

afterAll(async () => {
  await cleanUp([teamId]);
});

describe('live counsel messages', () => {
  it("reach that side's counsel as they are posted, and nobody outside the thread", async () => {
    const filter = `deal_id=eq.${dealId}`;
    const [buyerSide, otherSide, outsider] = await Promise.all([
      watch(buyerCounsel, 'counsel_message', filter),
      watch(sellerCounsel, 'counsel_message', filter),
      watch(stranger, 'counsel_message', filter),
    ]);

    await owner.client
      .from('counsel_message')
      .insert({
        account_id: teamId,
        deal_id: dealId,
        side: 'buyer',
        author_user_id: owner.userId,
        body: 'Draft APA is up',
      })
      .throwOnError();
    await settle(buyerSide.bodies, 1);

    expect(buyerSide.bodies).toEqual(['Draft APA is up']);
    expect(otherSide.bodies).toEqual([]);
    expect(outsider.bodies).toEqual([]);

    await Promise.all([buyerSide.stop(), otherSide.stop(), outsider.stop()]);
  });
});

describe('live contract comments', () => {
  it('reach counsel who can see the version as they are posted, and nobody else', async () => {
    const filter = `contract_version_id=eq.${versionId}`;
    const [counsel, outsider] = await Promise.all([
      watch(buyerCounsel, 'contract_comment', filter),
      watch(stranger, 'contract_comment', filter),
    ]);

    await owner.client
      .from('contract_comment')
      .insert({
        account_id: teamId,
        contract_version_id: versionId,
        author_user_id: owner.userId,
        author_side: 'buyer',
        body: 'Indemnity cap is too low',
      })
      .throwOnError();
    await settle(counsel.bodies, 1);

    expect(counsel.bodies).toEqual(['Indemnity cap is too low']);
    expect(outsider.bodies).toEqual([]);

    await Promise.all([counsel.stop(), outsider.stop()]);
  });
});

describe('live contract comment resolutions', () => {
  it('reach counsel who can see the version as they happen, and nobody else', async () => {
    const { data: comment } = await admin
      .from('contract_comment')
      .insert({
        account_id: teamId,
        contract_version_id: versionId,
        author_user_id: owner.userId,
        author_side: 'buyer',
        body: 'Escrow too long',
      })
      .select('id')
      .single()
      .throwOnError();
    const filter = `contract_version_id=eq.${versionId}`;
    const [counsel, outsider] = await Promise.all([
      watch(buyerCounsel, 'contract_comment', filter, 'UPDATE'),
      watch(stranger, 'contract_comment', filter, 'UPDATE'),
    ]);

    await owner.client
      .from('contract_comment')
      .update({ resolved_at: new Date().toISOString() })
      .eq('id', comment.id)
      .throwOnError();
    await settle(counsel.bodies, 1);

    expect(counsel.bodies).toEqual(['Escrow too long']);
    expect(outsider.bodies).toEqual([]);

    await Promise.all([counsel.stop(), outsider.stop()]);
  });
});

describe("live seller's counsel comments", () => {
  it('reach the seller and the deal team as they are posted, never the buyer side or outsiders', async () => {
    const filter = `room_id=eq.${roomId}`;
    const [theSeller, team, buyerSide, outsider] = await Promise.all([
      watch(seller, 'seller_room_comment', filter),
      watch(owner, 'seller_room_comment', filter),
      watch(buyerCounsel, 'seller_room_comment', filter),
      watch(stranger, 'seller_room_comment', filter),
    ]);

    await sellerCounsel.client
      .from('seller_room_comment')
      .insert({
        room_id: roomId,
        account_id: teamId,
        question_id: questionId,
        author_user_id: sellerCounsel.userId,
        body: 'Send only the top ten',
      })
      .throwOnError();
    await settle(team.bodies, 1);
    await settle(theSeller.bodies, 1);

    expect(theSeller.bodies).toEqual(['Send only the top ten']);
    expect(team.bodies).toEqual(['Send only the top ten']);
    expect(buyerSide.bodies).toEqual([]);
    expect(outsider.bodies).toEqual([]);

    await Promise.all([
      theSeller.stop(),
      team.stop(),
      buyerSide.stop(),
      outsider.stop(),
    ]);
  });
});

describe('live counsel messages to the team', () => {
  it("reach the deal team as seller's counsel posts them", async () => {
    const team = await watch(owner, 'counsel_message', `deal_id=eq.${dealId}`);

    await admin
      .from('counsel_message')
      .insert({
        account_id: teamId,
        deal_id: dealId,
        side: 'seller',
        author_user_id: sellerCounsel.userId,
        body: 'Seller counsel reply',
      })
      .throwOnError();
    await settle(team.bodies, 1);

    expect(team.bodies).toEqual(['Seller counsel reply']);

    await team.stop();
  });
});

describe('live private seller and counsel messages', () => {
  it("reach seller's counsel as the seller posts them", async () => {
    const counsel = await watch(
      sellerCounsel,
      'seller_counsel_message',
      `deal_id=eq.${dealId}`,
    );

    await seller.client
      .rpc('post_seller_counsel_message', {
        deal_id: dealId,
        body: 'Here is the P&L',
      })
      .throwOnError();
    await settle(counsel.bodies, 1);

    expect(counsel.bodies).toEqual(['Here is the P&L']);

    await counsel.stop();
  });
});
