import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  type IntegrationAccount,
  provisionAccount,
} from '../../test-support/integration-harness';

const holder = vi.hoisted(() => ({
  client: null as unknown,
}));

vi.mock('@odb/next/actions', () => ({
  enhanceAction: (fn: unknown) => fn,
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => holder.client,
}));

import { fetchDealOffers } from '../shared/queries';
import { createDealCore, updateDealStage } from './deal-actions';
import {
  acceptOffer,
  addOfferVersion,
  createOffer,
  expireOffer,
  rejectOffer,
  submitOffer,
  withdrawOffer,
} from './offer-actions';

type Action = (
  data: Record<string, unknown>,
  user: { id: string },
) => Promise<unknown>;

let account: IntegrationAccount;
let actor: { id: string };

function firstVersion(price: number) {
  return {
    number: 1,
    author_side: 'buyer',
    purchase_price: price,
    terms: {
      schema_version: 1,
      purchase_price: price,
    },
  };
}

async function newDeal(description: string): Promise<string> {
  return await createDealCore(
    account.user,
    {
      account_id: account.accountId,
      business_name: description,
      industry: 'Accounting',
      description,
      source: 'manual',
      stage: 'sourcing',
    },
    actor.id,
  );
}

beforeAll(async () => {
  account = await provisionAccount();
  holder.client = account.user;
  actor = { id: account.userId };
});

afterAll(async () => {
  await account.cleanup();
});

describe('createOffer + submit (integration)', () => {
  it('projects offer and offer_version rows and advances the deal to loi_submitted', async () => {
    const dealId = await newDeal('Submit flow deal');

    const offerId = ((await (createOffer as unknown as Action)(
      { deal_id: dealId, first_version: firstVersion(1_200_000) },
      actor,
    )) as { value: string }).value;

    const { data: offer } = await account.admin
      .from('offer')
      .select('id, deal_id, status, current_version_id')
      .eq('id', offerId)
      .single();

    expect(offer).toMatchObject({ id: offerId, deal_id: dealId, status: 'draft' });
    expect(offer?.current_version_id).not.toBeNull();

    const { data: versions } = await account.admin
      .from('offer_version')
      .select('id, number, author_side, purchase_price')
      .eq('offer_id', offerId)
      .order('number', { ascending: true });

    expect(versions).toHaveLength(1);
    expect(versions?.[0]).toMatchObject({
      number: 1,
      author_side: 'buyer',
      purchase_price: 1_200_000,
    });

    await (submitOffer as unknown as Action)({ offer_id: offerId }, actor);

    const { data: submitted } = await account.admin
      .from('offer')
      .select('status, submitted_at')
      .eq('id', offerId)
      .single();

    expect(submitted?.status).toBe('submitted');
    expect(submitted?.submitted_at).not.toBeNull();

    const { data: deal } = await account.admin
      .from('deal')
      .select('stage')
      .eq('id', dealId)
      .single();

    expect(deal?.stage).toBe('loi_submitted');
  });
});

describe('acceptOffer (integration)', () => {
  it('records the offer as accepted without advancing the stage or creating a contract', async () => {
    const dealId = await newDeal('Accept flow deal');

    const offerId = ((await (createOffer as unknown as Action)(
      { deal_id: dealId, first_version: firstVersion(900_000) },
      actor,
    )) as { value: string }).value;

    await (submitOffer as unknown as Action)({ offer_id: offerId }, actor);
    await (acceptOffer as unknown as Action)({ offer_id: offerId }, actor);

    const { data: offer } = await account.admin
      .from('offer')
      .select('status, responded_at')
      .eq('id', offerId)
      .single();

    expect(offer?.status).toBe('accepted');
    expect(offer?.responded_at).not.toBeNull();

    const { data: deal } = await account.admin
      .from('deal')
      .select('stage')
      .eq('id', dealId)
      .single();

    expect(deal?.stage).toBe('loi_submitted');

    const { data: contracts } = await account.admin
      .from('contract')
      .select('deal_id')
      .eq('deal_id', dealId);

    expect(contracts).toHaveLength(0);
  });
});

describe('new offer after a previous one (integration)', () => {
  async function dealWithOffer(description: string) {
    const dealId = await newDeal(description);
    const offerId = ((await (createOffer as unknown as Action)(
      { deal_id: dealId, first_version: firstVersion(500_000) },
      actor,
    )) as { value: string }).value;
    return { dealId, offerId };
  }

  function createSecondOffer(dealId: string) {
    return (createOffer as unknown as Action)(
      { deal_id: dealId, first_version: firstVersion(550_000) },
      actor,
    );
  }

  it.each([
    ['rejected', rejectOffer],
    ['withdrawn', withdrawOffer],
    ['expired', expireOffer],
  ])(
    'starts a fresh draft offer when the previous one was %s and keeps the old one',
    async (deadStatus, resolve) => {
      const { dealId, offerId } = await dealWithOffer(`Dead ${deadStatus} deal`);
      await (submitOffer as unknown as Action)({ offer_id: offerId }, actor);
      await (resolve as unknown as Action)({ offer_id: offerId }, actor);

      const newOfferId = (
        (await createSecondOffer(dealId)) as { value: string }
      ).value;

      const { data: offers } = await account.admin
        .from('offer')
        .select('id, status')
        .eq('deal_id', dealId);

      expect(offers).toHaveLength(2);
      expect(offers).toEqual(
        expect.arrayContaining([
          { id: offerId, status: deadStatus },
          { id: newOfferId, status: 'draft' },
        ]),
      );
    },
  );

  it('refuses a new offer while the previous one is accepted', async () => {
    const { dealId, offerId } = await dealWithOffer('Accepted offer deal');
    await (submitOffer as unknown as Action)({ offer_id: offerId }, actor);
    await (acceptOffer as unknown as Action)({ offer_id: offerId }, actor);

    expect(await createSecondOffer(dealId)).toEqual({
      ok: false,
      refusal: 'Deal already has a live offer',
    });
  });

  it.each([
    ['draft', async () => {}],
    [
      'submitted',
      async (offerId: string) => {
        await (submitOffer as unknown as Action)({ offer_id: offerId }, actor);
      },
    ],
    [
      'countered',
      async (offerId: string) => {
        await (submitOffer as unknown as Action)({ offer_id: offerId }, actor);
        await (addOfferVersion as unknown as Action)(
          {
            offer_id: offerId,
            author_side: 'seller',
            version: { ...firstVersion(520_000), number: 2, author_side: 'seller' },
          },
          actor,
        );
      },
    ],
  ])(
    'refuses a new offer while the previous one is %s',
    async (status, reach) => {
      const { dealId, offerId } = await dealWithOffer('Open offer deal');
      await reach(offerId);

      expect(await createSecondOffer(dealId)).toEqual({
        ok: false,
        refusal: 'Deal already has a live offer',
      });

      const { data: offers } = await account.admin
        .from('offer')
        .select('id, status')
        .eq('deal_id', dealId);

      expect(offers).toEqual([{ id: offerId, status }]);
    },
  );

  it('lets only one of two simultaneous new offers through', async () => {
    const dealId = await newDeal('Racing offers deal');

    const results = (await Promise.all([
      createSecondOffer(dealId),
      createSecondOffer(dealId),
    ])) as Array<{ ok: boolean; refusal?: string }>;

    expect(
      results.filter((result) => !result.ok).map((result) => result.refusal),
    ).toEqual(['Deal already has a live offer']);

    const { data: offers } = await account.admin
      .from('offer')
      .select('id')
      .eq('deal_id', dealId);

    expect(offers).toHaveLength(1);
  });
});

describe('terminal offer guard (integration)', () => {
  it('rejects a transition on an already accepted offer', async () => {
    const dealId = await newDeal('Terminal offer deal');

    const offerId = ((await (createOffer as unknown as Action)(
      { deal_id: dealId, first_version: firstVersion(750_000) },
      actor,
    )) as { value: string }).value;

    await (submitOffer as unknown as Action)({ offer_id: offerId }, actor);
    await (acceptOffer as unknown as Action)({ offer_id: offerId }, actor);

    await expect(
      (submitOffer as unknown as Action)({ offer_id: offerId }, actor),
    ).rejects.toThrow('Offer is already resolved');
  });
});

describe('fetchDealOffers (integration)', () => {
  async function draftOffer(dealId: string, price: number) {
    return ((await (createOffer as unknown as Action)(
      { deal_id: dealId, first_version: firstVersion(price) },
      actor,
    )) as { value: string }).value;
  }

  async function reject(offerId: string) {
    await (submitOffer as unknown as Action)({ offer_id: offerId }, actor);
    await (rejectOffer as unknown as Action)({ offer_id: offerId }, actor);
  }

  function summary(entry: Awaited<ReturnType<typeof fetchDealOffers>>['history'][number]) {
    return {
      id: entry.offer.id,
      status: entry.offer.status,
      prices: entry.versions.map((version) => version.purchase_price),
      currentPrice: entry.currentVersion?.purchase_price,
    };
  }

  it('returns no live offer and no history for a deal without offers', async () => {
    const dealId = await newDeal('No offers deal');

    expect(
      await fetchDealOffers(account.user as never, { deal_id: dealId }),
    ).toEqual({ live: null, history: [] });
  });

  it('separates the live offer from dead offers kept as history, newest first', async () => {
    const dealId = await newDeal('Multi offer deal');
    const first = await draftOffer(dealId, 400_000);
    await reject(first);
    const second = await draftOffer(dealId, 450_000);
    await reject(second);
    const live = await draftOffer(dealId, 500_000);

    const offers = await fetchDealOffers(account.user as never, {
      deal_id: dealId,
    });

    expect(offers.live && summary(offers.live)).toEqual({
      id: live,
      status: 'draft',
      prices: [500_000],
      currentPrice: 500_000,
    });
    expect(offers.history.map(summary)).toEqual([
      { id: second, status: 'rejected', prices: [450_000], currentPrice: 450_000 },
      { id: first, status: 'rejected', prices: [400_000], currentPrice: 400_000 },
    ]);
  });

  it('has no live offer once every offer is dead', async () => {
    const dealId = await newDeal('All dead deal');
    const only = await draftOffer(dealId, 300_000);
    await reject(only);

    const offers = await fetchDealOffers(account.user as never, {
      deal_id: dealId,
    });

    expect(offers.live).toBeNull();
    expect(offers.history.map((entry) => entry.offer.id)).toEqual([only]);
  });
});

describe('addOfferVersion on a closed offer (integration)', () => {
  it.each([
    ['accepted', acceptOffer],
    ['rejected', rejectOffer],
    ['withdrawn', withdrawOffer],
    ['expired', expireOffer],
  ])(
    'refuses a new version once the offer is %s',
    async (status, close) => {
      const dealId = await newDeal(`Closed ${status} offer deal`);
      const offerId = ((await (createOffer as unknown as Action)(
        { deal_id: dealId, first_version: firstVersion(600_000) },
        actor,
      )) as { value: string }).value;
      await (submitOffer as unknown as Action)({ offer_id: offerId }, actor);
      await (close as unknown as Action)({ offer_id: offerId }, actor);

      await expect(
        (addOfferVersion as unknown as Action)(
          {
            offer_id: offerId,
            author_side: 'seller',
            version: { ...firstVersion(650_000), number: 2, author_side: 'seller' },
          },
          actor,
        ),
      ).rejects.toThrow('Offer is already resolved');

      const { data: offer } = await account.admin
        .from('offer')
        .select('status')
        .eq('id', offerId)
        .single();
      const { data: versions } = await account.admin
        .from('offer_version')
        .select('number')
        .eq('offer_id', offerId);

      expect(offer?.status).toBe(status);
      expect(versions).toEqual([{ number: 1 }]);
    },
  );
});

describe('deal stage after an offer closes (integration)', () => {
  async function moveStage(dealId: string, stage: string) {
    await (updateDealStage as unknown as Action)({ deal_id: dealId, stage }, actor);
  }

  async function stageOf(dealId: string) {
    const { data } = await account.admin
      .from('deal')
      .select('stage')
      .eq('id', dealId)
      .single();
    return data?.stage;
  }

  async function dealWithSubmittedOffer(description: string) {
    const dealId = await newDeal(description);
    await moveStage(dealId, 'nda_signed');
    const offerId = ((await (createOffer as unknown as Action)(
      { deal_id: dealId, first_version: firstVersion(700_000) },
      actor,
    )) as { value: string }).value;
    await (submitOffer as unknown as Action)({ offer_id: offerId }, actor);
    return { dealId, offerId };
  }

  it.each([
    ['rejected', rejectOffer],
    ['withdrawn', withdrawOffer],
    ['expired', expireOffer],
  ])(
    'returns the deal to its stage before the submit once the offer is %s',
    async (_status, close) => {
      const { dealId, offerId } = await dealWithSubmittedOffer('Stage restore deal');
      expect(await stageOf(dealId)).toBe('loi_submitted');

      await (close as unknown as Action)({ offer_id: offerId }, actor);

      expect(await stageOf(dealId)).toBe('nda_signed');
    },
  );

  it('leaves a hand-moved stage alone when the offer is rejected', async () => {
    const { dealId, offerId } = await dealWithSubmittedOffer('Hand moved deal');
    await moveStage(dealId, 'due_diligence');

    await (rejectOffer as unknown as Action)({ offer_id: offerId }, actor);

    expect(await stageOf(dealId)).toBe('due_diligence');
  });

  it('leaves the stage alone when a never-submitted draft is withdrawn', async () => {
    const dealId = await newDeal('Draft only deal');
    await moveStage(dealId, 'nda_signed');
    const offerId = ((await (createOffer as unknown as Action)(
      { deal_id: dealId, first_version: firstVersion(700_000) },
      actor,
    )) as { value: string }).value;

    await (withdrawOffer as unknown as Action)({ offer_id: offerId }, actor);

    expect(await stageOf(dealId)).toBe('nda_signed');
  });
});
