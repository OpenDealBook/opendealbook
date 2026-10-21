import { createClient } from '@supabase/supabase-js';

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
import type { Database } from '@odb/supabase';

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON_KEY);
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY);

const world = vi.hoisted(() => ({ signedInClient: null as unknown }));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => world.signedInClient,
}));

const { loadCounselGate, shouldAskCounselProfile } =
  await import('./portal-gate');
const { setMyCounselDetails, skipCounselProfilePrompt } =
  await import('./profile');

type Person = Awaited<ReturnType<typeof provisionPerson>>;

let owner: Person;
let counsel: Person;
let teamId: string;

async function addCounsel(
  dealId: string,
  person: Person,
  side: 'buyer' | 'seller',
) {
  await admin
    .from('deal_counsel')
    .insert({
      account_id: teamId,
      deal_id: dealId,
      side,
      user_id: person.userId,
      email: person.email,
      name: 'Team Typo',
    })
    .throwOnError();
}

async function detailsOf(dealId: string, person: Person) {
  const { data } = await admin
    .from('deal_counsel')
    .select('side, name, phone')
    .eq('deal_id', dealId)
    .eq('user_id', person.userId)
    .order('side')
    .throwOnError();

  return data;
}

async function closeDeal(
  dealId: string,
  eventType: 'deal.archived' | 'deal.resolved',
) {
  await admin
    .rpc('append_deal_event', {
      p_deal_id: dealId,
      p_aggregate_type: 'deal',
      p_aggregate_id: dealId,
      p_event_type: eventType,
      p_payload: eventType === 'deal.resolved' ? { resolution: 'won' } : {},
      p_actor_kind: 'service',
    })
    .throwOnError();
}

beforeAll(async () => {
  owner = await provisionPerson();
  counsel = await provisionPerson();
  teamId = await provisionTeam(owner, 'Acme Partners');
});

beforeEach(() => {
  world.signedInClient = counsel.client;
});

afterAll(async () => {
  await cleanUp([teamId]);
});

describe('loadCounselGate', () => {
  it('sends a signed-out visitor to counsel sign-in, back to this deal', async () => {
    const dealId = await newDeal(teamId, owner);
    const signedOut = createClient<Database>(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    expect(await loadCounselGate(signedOut, dealId)).toEqual({
      kind: 'sign-in',
      path: `/counsel/sign-in?next=%2Fcounsel%2F${dealId}`,
    });
  });

  it("opens the portal to buyer's counsel", async () => {
    const dealId = await newDeal(teamId, owner);
    await addCounsel(dealId, counsel, 'buyer');

    expect(await loadCounselGate(counsel.client, dealId)).toEqual({
      kind: 'open',
      sides: ['buyer'],
      readOnlyReason: null,
    });
  });

  it("opens the portal to seller's counsel", async () => {
    const dealId = await newDeal(teamId, owner);
    await addCounsel(dealId, counsel, 'seller');

    expect(await loadCounselGate(counsel.client, dealId)).toEqual({
      kind: 'open',
      sides: ['seller'],
      readOnlyReason: null,
    });
  });

  it('hides the portal from someone who is not counsel on the deal', async () => {
    const dealId = await newDeal(teamId, owner);

    expect(await loadCounselGate(counsel.client, dealId)).toEqual({
      kind: 'not-found',
    });
  });

  it('hides the portal from the deal team', async () => {
    const dealId = await newDeal(teamId, owner);

    expect(await loadCounselGate(owner.client, dealId)).toEqual({
      kind: 'not-found',
    });
  });

  it('hides the portal once the deal is archived', async () => {
    const dealId = await newDeal(teamId, owner);
    await addCounsel(dealId, counsel, 'buyer');
    await closeDeal(dealId, 'deal.archived');

    expect(await loadCounselGate(counsel.client, dealId)).toEqual({
      kind: 'not-found',
    });
  });

  it('hides the portal once the deal is resolved', async () => {
    const dealId = await newDeal(teamId, owner);
    await addCounsel(dealId, counsel, 'buyer');
    await closeDeal(dealId, 'deal.resolved');

    expect(await loadCounselGate(counsel.client, dealId)).toEqual({
      kind: 'not-found',
    });
  });

  it("keeps the portal open to seller's counsel, read-only, once the deal is archived", async () => {
    const dealId = await newDeal(teamId, owner);
    await addCounsel(dealId, counsel, 'seller');
    await closeDeal(dealId, 'deal.archived');

    expect(await loadCounselGate(counsel.client, dealId)).toEqual({
      kind: 'open',
      sides: ['seller'],
      readOnlyReason: 'This deal has closed, so everything here is read-only.',
    });
  });

  it("keeps the portal open to seller's counsel, read-only, once the deal is resolved", async () => {
    const dealId = await newDeal(teamId, owner);
    await addCounsel(dealId, counsel, 'seller');
    await closeDeal(dealId, 'deal.resolved');

    expect(await loadCounselGate(counsel.client, dealId)).toEqual({
      kind: 'open',
      sides: ['seller'],
      readOnlyReason: 'This deal has closed, so everything here is read-only.',
    });
  });

  it('treats a malformed deal id as not found', async () => {
    expect(await loadCounselGate(counsel.client, 'not-a-deal')).toEqual({
      kind: 'not-found',
    });
  });
});

describe('setMyCounselDetails', () => {
  it("refuses seller's counsel once the deal has ended, saying why, and changes nothing", async () => {
    const dealId = await newDeal(teamId, owner);
    await addCounsel(dealId, counsel, 'seller');
    await closeDeal(dealId, 'deal.archived');

    expect(
      await setMyCounselDetails({ dealId, name: 'Late Change', phone: '' }),
    ).toEqual({
      ok: false,
      refusal: 'This deal has closed, so everything here is read-only.',
    });
    expect(await detailsOf(dealId, counsel)).toEqual([
      { side: 'seller', name: 'Team Typo', phone: null },
    ]);
  });

  it('lets counsel correct their own name and add a phone', async () => {
    const dealId = await newDeal(teamId, owner);
    await addCounsel(dealId, counsel, 'buyer');

    const result = await setMyCounselDetails({
      dealId,
      name: ' Ada Attorney ',
      phone: '+1 555 0100',
    });

    expect(result).toEqual({ ok: true, value: undefined });
    expect(await detailsOf(dealId, counsel)).toEqual([
      { side: 'buyer', name: 'Ada Attorney', phone: '+1 555 0100' },
    ]);
  });

  it('stores no phone when the phone is left blank', async () => {
    const dealId = await newDeal(teamId, owner);
    await addCounsel(dealId, counsel, 'buyer');

    await setMyCounselDetails({ dealId, name: 'Ada Attorney', phone: '  ' });

    expect(await detailsOf(dealId, counsel)).toEqual([
      { side: 'buyer', name: 'Ada Attorney', phone: null },
    ]);
  });

  it('refuses someone who is not counsel on the deal, and changes nothing', async () => {
    const dealId = await newDeal(teamId, owner);
    await addCounsel(dealId, counsel, 'buyer');
    const stranger = await provisionPerson();
    world.signedInClient = stranger.client;

    const result = await setMyCounselDetails({
      dealId,
      name: 'Mallory',
      phone: '',
    });

    expect(result).toEqual({
      ok: false,
      refusal: 'You are not counsel on this deal.',
    });
    expect(await detailsOf(dealId, counsel)).toEqual([
      { side: 'buyer', name: 'Team Typo', phone: null },
    ]);
  });

  it('refuses a blank name', async () => {
    const dealId = await newDeal(teamId, owner);
    await addCounsel(dealId, counsel, 'buyer');

    const result = await setMyCounselDetails({ dealId, name: ' ', phone: '' });

    expect(result.ok).toBe(false);
    expect(await detailsOf(dealId, counsel)).toEqual([
      { side: 'buyer', name: 'Team Typo', phone: null },
    ]);
  });
});

describe('first-entry prompt for name and phone', () => {
  it('asks counsel on first entry', async () => {
    const dealId = await newDeal(teamId, owner);
    await addCounsel(dealId, counsel, 'buyer');

    expect(await shouldAskCounselProfile(counsel.client, dealId)).toBe(true);
  });

  it('stops asking once counsel save their details', async () => {
    const dealId = await newDeal(teamId, owner);
    await addCounsel(dealId, counsel, 'buyer');

    await setMyCounselDetails({ dealId, name: 'Ada Attorney', phone: '' });

    expect(await shouldAskCounselProfile(counsel.client, dealId)).toBe(false);
  });

  it('stops asking after a skip, leaving name and phone as they were', async () => {
    const dealId = await newDeal(teamId, owner);
    await addCounsel(dealId, counsel, 'buyer');

    const result = await skipCounselProfilePrompt({ dealId });

    expect(result).toEqual({ ok: true, value: undefined });
    expect(await shouldAskCounselProfile(counsel.client, dealId)).toBe(false);
    expect(await detailsOf(dealId, counsel)).toEqual([
      { side: 'buyer', name: 'Team Typo', phone: null },
    ]);
  });

  it('asks again on another deal', async () => {
    const asked = await newDeal(teamId, owner);
    const fresh = await newDeal(teamId, owner);
    await addCounsel(asked, counsel, 'buyer');
    await addCounsel(fresh, counsel, 'buyer');

    await skipCounselProfilePrompt({ dealId: asked });

    expect(await shouldAskCounselProfile(counsel.client, fresh)).toBe(true);
  });

  it('refuses a skip from someone who is not counsel on the deal', async () => {
    const dealId = await newDeal(teamId, owner);
    await addCounsel(dealId, counsel, 'buyer');
    world.signedInClient = (await provisionPerson()).client;

    expect(await skipCounselProfilePrompt({ dealId })).toEqual({
      ok: false,
      refusal: 'You are not counsel on this deal.',
    });
    expect(await shouldAskCounselProfile(counsel.client, dealId)).toBe(true);
  });
});
