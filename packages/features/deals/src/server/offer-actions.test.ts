import { beforeEach, describe, expect, it, vi } from 'vitest';

const uuid = (n: number) =>
  `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

const mocks = vi.hoisted(() => {
  const appendDealEvent = vi.fn(async () => [{ deal_seq: 1, aggregate_seq: 1 }]);
  const appendDealEvents = vi.fn(async () => [
    { deal_seq: 1, aggregate_seq: 1 },
  ]);

  let offer: unknown = null;
  let offerVersion: unknown = null;

  function setOffer(next: unknown) {
    offer = next;
  }

  function setOfferVersion(next: unknown) {
    offerVersion = next;
  }

  function dataFor(table: string): unknown {
    if (table === 'offer') {
      return offer;
    }
    if (table === 'offer_version') {
      return offerVersion;
    }

    return { id: `${table}-1` };
  }

  function makeBuilder(table: string) {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;

    builder.select = chain;
    builder.eq = chain;
    builder.order = chain;
    builder.limit = chain;
    builder.single = chain;
    builder.maybeSingle = chain;
    builder.throwOnError = chain;
    builder.then = (resolve: (value: unknown) => void) =>
      resolve({ data: dataFor(table), error: null });

    return builder;
  }

  const from = vi.fn((table: string) => makeBuilder(table));

  return {
    appendDealEvent,
    appendDealEvents,
    from,
    setOffer,
    setOfferVersion,
  };
});

vi.mock('@odb/next/actions', () => ({
  enhanceAction: (fn: unknown) => fn,
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({ from: mocks.from }),
}));

vi.mock('@odb/events', () => ({
  appendDealEvent: mocks.appendDealEvent,
  appendDealEvents: mocks.appendDealEvents,
}));

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

const runCreateOffer = createOffer as unknown as Action;
const runAddOfferVersion = addOfferVersion as unknown as Action;
const runSubmitOffer = submitOffer as unknown as Action;
const runAcceptOffer = acceptOffer as unknown as Action;
const runRejectOffer = rejectOffer as unknown as Action;
const runWithdrawOffer = withdrawOffer as unknown as Action;
const runExpireOffer = expireOffer as unknown as Action;

const user = { id: 'user-1' };

const minimalVersion = {
  number: 1,
  author_side: 'buyer' as const,
  purchase_price: 1_000_000,
  terms: { schema_version: 1, purchase_price: 1_000_000 },
};

function expectedVersionPayload(overrides: Record<string, unknown>) {
  return {
    purchase_price: 1_000_000,
    real_estate_portion: null,
    target_close_date: null,
    offer_expires_at: null,
    exclusivity_days: null,
    diligence_days: null,
    calc_version_id: null,
    approved_by: null,
    approved_at: null,
    terms: { schema_version: 1, purchase_price: 1_000_000 },
    ...overrides,
  };
}

let uuidCounter = 0;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.setOffer(null);
  mocks.setOfferVersion(null);
  uuidCounter = 0;
  vi.spyOn(crypto, 'randomUUID').mockImplementation(
    () => uuid(++uuidCounter) as ReturnType<typeof crypto.randomUUID>,
  );
});

describe('createOffer', () => {
  it('drafts the offer and adds the first buyer version in one append', async () => {
    const result = await runCreateOffer(
      { deal_id: 'deal-1', first_version: minimalVersion },
      user,
    );

    const [, dealId, events] = mocks.appendDealEvents.mock.calls.at(
      -1,
    ) as unknown as [unknown, string, Array<Record<string, unknown>>];

    expect(dealId).toBe('deal-1');
    expect(events).toEqual([
      {
        aggregateType: 'offer',
        aggregateId: uuid(1),
        eventType: 'offer.drafted',
        payload: {},
      },
      {
        aggregateType: 'offer',
        aggregateId: uuid(1),
        eventType: 'offer.version_added',
        payload: expectedVersionPayload({
          version_id: uuid(2),
          number: 1,
          author_side: 'buyer',
        }),
      },
    ]);
    expect(result).toBe(uuid(1));
  });

  it('rejects a second offer on the same deal', async () => {
    mocks.setOffer({ id: 'offer-1' });

    await expect(
      runCreateOffer({ deal_id: 'deal-1', first_version: minimalVersion }, user),
    ).rejects.toThrow();

    expect(mocks.appendDealEvents).not.toHaveBeenCalled();
  });
});

describe('addOfferVersion', () => {
  it('adds a buyer version numbered after the latest with no counter', async () => {
    mocks.setOffer({ deal_id: 'deal-1', status: 'submitted' });
    mocks.setOfferVersion({ number: 2 });

    const result = await runAddOfferVersion(
      { offer_id: 'offer-1', author_side: 'buyer', version: minimalVersion },
      user,
    );

    const [, dealId, events] = mocks.appendDealEvents.mock.calls.at(
      -1,
    ) as unknown as [unknown, string, Array<Record<string, unknown>>];

    expect(dealId).toBe('deal-1');
    expect(events).toEqual([
      {
        aggregateType: 'offer',
        aggregateId: 'offer-1',
        eventType: 'offer.version_added',
        payload: expectedVersionPayload({
          version_id: uuid(1),
          number: 3,
          author_side: 'buyer',
        }),
      },
    ]);
    expect(result).toBe(uuid(1));
  });

  it('records a seller counter as a version plus offer.countered', async () => {
    mocks.setOffer({ deal_id: 'deal-1', status: 'submitted' });
    mocks.setOfferVersion({ number: 1 });

    await runAddOfferVersion(
      { offer_id: 'offer-1', author_side: 'seller', version: minimalVersion },
      user,
    );

    const [, , events] = mocks.appendDealEvents.mock.calls.at(
      -1,
    ) as unknown as [unknown, string, Array<Record<string, unknown>>];

    expect(events).toEqual([
      {
        aggregateType: 'offer',
        aggregateId: 'offer-1',
        eventType: 'offer.version_added',
        payload: expectedVersionPayload({
          version_id: uuid(1),
          number: 2,
          author_side: 'seller',
        }),
      },
      {
        aggregateType: 'offer',
        aggregateId: 'offer-1',
        eventType: 'offer.countered',
        payload: {},
      },
    ]);
  });
});

describe('submitOffer', () => {
  it('submits the offer and moves the deal to loi_submitted', async () => {
    mocks.setOffer({ deal_id: 'deal-1', status: 'draft' });

    await runSubmitOffer({ offer_id: 'offer-1' }, user);

    const [, dealId, events] = mocks.appendDealEvents.mock.calls.at(
      -1,
    ) as unknown as [unknown, string, Array<Record<string, unknown>>];

    expect(dealId).toBe('deal-1');
    expect(events).toEqual([
      {
        aggregateType: 'offer',
        aggregateId: 'offer-1',
        eventType: 'offer.submitted',
        payload: {},
      },
      {
        aggregateType: 'deal',
        aggregateId: 'deal-1',
        eventType: 'deal.stage_changed',
        payload: { stage: 'loi_submitted' },
      },
    ]);
  });

  it('rejects submitting an already resolved offer', async () => {
    mocks.setOffer({ deal_id: 'deal-1', status: 'withdrawn' });

    await expect(
      runSubmitOffer({ offer_id: 'offer-1' }, user),
    ).rejects.toThrow();

    expect(mocks.appendDealEvents).not.toHaveBeenCalled();
  });
});

describe('acceptOffer', () => {
  it('records the offer as accepted without advancing the stage or creating a contract', async () => {
    mocks.setOffer({
      deal_id: 'deal-1',
      status: 'submitted',
      current_version_id: 'ver-7',
    });

    await runAcceptOffer({ offer_id: 'offer-1' }, user);

    expect(mocks.appendDealEvents).not.toHaveBeenCalled();

    const [, input] = mocks.appendDealEvent.mock.calls.at(-1) as unknown as [
      unknown,
      Record<string, unknown>,
    ];

    expect(input).toEqual({
      dealId: 'deal-1',
      aggregateType: 'offer',
      aggregateId: 'offer-1',
      eventType: 'offer.accepted',
      payload: {},
    });
  });

  it('rejects accepting an already accepted offer', async () => {
    mocks.setOffer({
      deal_id: 'deal-1',
      status: 'accepted',
      current_version_id: 'ver-7',
    });

    await expect(
      runAcceptOffer({ offer_id: 'offer-1' }, user),
    ).rejects.toThrow();

    expect(mocks.appendDealEvents).not.toHaveBeenCalled();
  });
});

describe('rejectOffer / withdrawOffer / expireOffer', () => {
  it.each([
    ['reject', runRejectOffer, 'offer.rejected'],
    ['withdraw', runWithdrawOffer, 'offer.withdrawn'],
    ['expire', runExpireOffer, 'offer.expired'],
  ] as const)(
    'appends only the %s status event with no deal events',
    async (_name, run, eventType) => {
      mocks.setOffer({ deal_id: 'deal-1', status: 'submitted' });

      await run({ offer_id: 'offer-1' }, user);

      expect(mocks.appendDealEvent).toHaveBeenCalledWith(expect.anything(), {
        dealId: 'deal-1',
        aggregateType: 'offer',
        aggregateId: 'offer-1',
        eventType,
        payload: {},
      });
      expect(mocks.appendDealEvents).not.toHaveBeenCalled();
    },
  );

  it('rejects withdrawing an already expired offer', async () => {
    mocks.setOffer({ deal_id: 'deal-1', status: 'expired' });

    await expect(
      runWithdrawOffer({ offer_id: 'offer-1' }, user),
    ).rejects.toThrow();

    expect(mocks.appendDealEvent).not.toHaveBeenCalled();
  });
});
