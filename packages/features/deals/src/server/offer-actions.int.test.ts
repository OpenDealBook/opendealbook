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

import { createDeal } from './deal-actions';
import {
  acceptOffer,
  createOffer,
  submitOffer,
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
  return (await (createDeal as unknown as Action)(
    {
      account_id: account.accountId,
      description,
      source: 'manual',
      stage: 'sourcing',
    },
    actor,
  )) as string;
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

    const offerId = (await (createOffer as unknown as Action)(
      { deal_id: dealId, first_version: firstVersion(1_200_000) },
      actor,
    )) as string;

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
  it('advances the deal to loi_accepted and creates a contract row', async () => {
    const dealId = await newDeal('Accept flow deal');

    const offerId = (await (createOffer as unknown as Action)(
      { deal_id: dealId, first_version: firstVersion(900_000) },
      actor,
    )) as string;

    const { data: created } = await account.admin
      .from('offer')
      .select('current_version_id')
      .eq('id', offerId)
      .single();

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

    expect(deal?.stage).toBe('loi_accepted');

    const { data: contracts } = await account.admin
      .from('contract')
      .select('deal_id, type, status, source_offer_version_id')
      .eq('deal_id', dealId);

    expect(contracts).toHaveLength(1);
    expect(contracts?.[0]).toMatchObject({
      deal_id: dealId,
      type: 'loi',
      status: 'draft',
      source_offer_version_id: created?.current_version_id,
    });
  });
});

describe('one-offer-per-deal guard (integration)', () => {
  it('rejects a second offer on a deal that already has one', async () => {
    const dealId = await newDeal('Single offer deal');

    await (createOffer as unknown as Action)(
      { deal_id: dealId, first_version: firstVersion(500_000) },
      actor,
    );

    await expect(
      (createOffer as unknown as Action)(
        { deal_id: dealId, first_version: firstVersion(550_000) },
        actor,
      ),
    ).rejects.toThrow('Deal already has an offer');
  });
});

describe('terminal offer guard (integration)', () => {
  it('rejects a transition on an already accepted offer', async () => {
    const dealId = await newDeal('Terminal offer deal');

    const offerId = (await (createOffer as unknown as Action)(
      { deal_id: dealId, first_version: firstVersion(750_000) },
      actor,
    )) as string;

    await (submitOffer as unknown as Action)({ offer_id: offerId }, actor);
    await (acceptOffer as unknown as Action)({ offer_id: offerId }, actor);

    await expect(
      (submitOffer as unknown as Action)({ offer_id: offerId }, actor),
    ).rejects.toThrow('Offer is already resolved');
  });
});
