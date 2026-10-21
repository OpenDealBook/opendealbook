import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { appendDealEvents } from '@odb/events';
import {
  ANON_KEY,
  cleanUp,
  newDeal,
  provisionPerson,
  provisionTeam,
  SERVICE_ROLE_KEY,
  SUPABASE_URL,
  withLockedTeam,
} from '@odb/seller-rooms/test-support/world.ts';

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON_KEY);
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY);

const world = vi.hoisted(() => ({ signedInClient: null as unknown }));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => world.signedInClient,
}));

const { applyContractDates, contractDatesPreview } =
  await import('./apply-contract-dates');
const { setMilestone } = await import('./actions');
const { loadDealTimeline } = await import('./queries');

type Person = Awaited<ReturnType<typeof provisionPerson>>;

let owner: Person;
let teamId: string;
let dealId: string;

function utcDayFromToday(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

async function contractFrom(
  stated: {
    target_close_date?: string;
    diligence_days?: number;
    terms?: Record<string, unknown>;
  },
  { accepted }: { accepted: boolean },
) {
  const offerId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const contractId = crypto.randomUUID();

  await appendDealEvents(owner.client, dealId, [
    {
      aggregateType: 'offer',
      aggregateId: offerId,
      eventType: 'offer.drafted',
      payload: {},
    },
    {
      aggregateType: 'offer',
      aggregateId: offerId,
      eventType: 'offer.version_added',
      payload: {
        version_id: versionId,
        number: 1,
        author_side: 'buyer',
        purchase_price: 1_000_000,
        target_close_date: stated.target_close_date ?? null,
        diligence_days: stated.diligence_days ?? null,
        terms: { purchase_price: 1_000_000, ...stated.terms },
      },
    },
    ...(accepted
      ? [
          {
            aggregateType: 'offer' as const,
            aggregateId: offerId,
            eventType: 'offer.accepted' as const,
            payload: {},
          },
        ]
      : []),
    {
      aggregateType: 'contract',
      aggregateId: contractId,
      eventType: 'contract.created',
      payload: {
        type: 'apa',
        status: 'draft',
        current_version: 0,
        source_offer_version_id: versionId,
      },
    },
  ]);

  return contractId;
}

async function applyAsPreviewed(contractId: string) {
  const preview = await contractDatesPreview(contractId);

  return applyContractDates({
    contractId,
    previewed: preview!.flatMap((date) =>
      'to' in date ? [{ kind: date.kind, from: date.from }] : [],
    ),
  });
}

async function milestone(kind: string) {
  const { milestones } = await loadDealTimeline(owner.client, dealId);

  return milestones.find((candidate) => candidate.kind === kind)!;
}

beforeAll(async () => {
  owner = await provisionPerson();
  teamId = await provisionTeam(owner, 'Contract Dates Partners');
});

beforeEach(async () => {
  world.signedInClient = owner.client;
  dealId = await newDeal(teamId, owner);
});

afterAll(async () => {
  await cleanUp([teamId]);
});

describe('contract dates', () => {
  it('previews each stated date as the current target and the contract date', async () => {
    await setMilestone({
      dealId,
      milestoneId: crypto.randomUUID(),
      kind: 'closing',
      targetOn: '2026-11-01',
      actualOn: null,
      shared: true,
    });
    const contractId = await contractFrom(
      {
        target_close_date: '2026-12-01',
        diligence_days: 30,
        terms: { effective_date: '2026-12-15' },
      },
      { accepted: true },
    );

    expect(await contractDatesPreview(contractId)).toEqual([
      {
        kind: 'closing',
        label: 'Closing',
        from: '2026-11-01',
        to: '2026-12-01',
      },
      {
        kind: 'effective',
        label: 'Effective date',
        from: null,
        to: '2026-12-15',
      },
      {
        kind: 'diligence_end',
        label: 'Diligence end',
        from: null,
        to: utcDayFromToday(30),
      },
    ]);
  });

  it('lists a date the contract does not state, and diligence end before acceptance, as skipped', async () => {
    const contractId = await contractFrom(
      { target_close_date: '2026-12-01', diligence_days: 30 },
      { accepted: false },
    );

    expect(await contractDatesPreview(contractId)).toEqual([
      { kind: 'closing', label: 'Closing', from: null, to: '2026-12-01' },
      { kind: 'effective', label: 'Effective date', skipped: 'not stated' },
      {
        kind: 'diligence_end',
        label: 'Diligence end',
        skipped: 'needs an accepted offer',
      },
    ]);
  });

  it('lists diligence end as not stated when the offer gives no diligence days', async () => {
    const contractId = await contractFrom(
      { target_close_date: '2026-12-01' },
      { accepted: true },
    );

    expect((await contractDatesPreview(contractId))![2]).toEqual({
      kind: 'diligence_end',
      label: 'Diligence end',
      skipped: 'not stated',
    });
  });

  it('offers nothing for a contract that states no dates', async () => {
    const contractId = await contractFrom({}, { accepted: true });

    expect(await contractDatesPreview(contractId)).toBeNull();
  });

  it('offers nothing for a contract recorded as signed elsewhere', async () => {
    const contractId = crypto.randomUUID();
    await appendDealEvents(owner.client, dealId, [
      {
        aggregateType: 'contract',
        aggregateId: contractId,
        eventType: 'contract.created',
        payload: { type: 'loi', status: 'draft', current_version: 0 },
      },
    ]);

    expect(await contractDatesPreview(contractId)).toBeNull();
  });

  it('sets the stated targets, keeping actuals and sharing, and new milestones start with their default sharing', async () => {
    await setMilestone({
      dealId,
      milestoneId: crypto.randomUUID(),
      kind: 'closing',
      targetOn: '2026-11-01',
      actualOn: '2026-10-01',
      shared: false,
    });
    const contractId = await contractFrom(
      {
        target_close_date: '2026-12-01',
        diligence_days: 30,
        terms: { effective_date: '2026-12-15' },
      },
      { accepted: true },
    );

    expect(await applyAsPreviewed(contractId)).toEqual({
      ok: true,
      value: undefined,
    });

    expect(await milestone('closing')).toMatchObject({
      targetOn: '2026-12-01',
      actualOn: '2026-10-01',
      shared: false,
    });
    expect(await milestone('effective')).toMatchObject({
      targetOn: '2026-12-15',
      actualOn: null,
      shared: true,
    });
    expect(await milestone('diligence_end')).toMatchObject({
      targetOn: utcDayFromToday(30),
      actualOn: null,
      shared: false,
    });
  });

  it('leaves skipped milestones untouched', async () => {
    const contractId = await contractFrom(
      { target_close_date: '2026-12-01', diligence_days: 30 },
      { accepted: false },
    );

    await applyAsPreviewed(contractId);

    expect(await milestone('effective')).toMatchObject({ id: null });
    expect(await milestone('diligence_end')).toMatchObject({ id: null });
  });

  it('refuses when a target changed after the preview was shown', async () => {
    const contractId = await contractFrom(
      { target_close_date: '2026-12-01' },
      { accepted: true },
    );
    const preview = await contractDatesPreview(contractId);
    await setMilestone({
      dealId,
      milestoneId: crypto.randomUUID(),
      kind: 'closing',
      targetOn: '2026-11-01',
      actualOn: null,
      shared: true,
    });

    expect(
      await applyContractDates({
        contractId,
        previewed: [
          {
            kind: 'closing',
            from: (preview![0] as { from: string | null }).from,
          },
        ],
      }),
    ).toEqual({
      ok: false,
      refusal: 'Timeline dates changed since you opened this. Review again.',
    });
    expect(await milestone('closing')).toMatchObject({
      targetOn: '2026-11-01',
    });
  });

  it('refuses a locked team', async () => {
    const contractId = await contractFrom(
      { target_close_date: '2026-12-01' },
      { accepted: true },
    );

    await withLockedTeam(teamId, async () => {
      expect(await applyAsPreviewed(contractId)).toEqual({
        ok: false,
        refusal: 'This team is read-only until billing is updated.',
      });
    });
  });

  it('refuses when a date became applicable after the preview was shown', async () => {
    const contractId = await contractFrom(
      { target_close_date: '2026-12-01', diligence_days: 30 },
      { accepted: false },
    );
    const preview = await contractDatesPreview(contractId);
    const { data: contract } = await owner.client
      .from('contract')
      .select('source_offer_version_id')
      .eq('id', contractId)
      .single()
      .throwOnError();
    const { data: version } = await owner.client
      .from('offer_version')
      .select('offer_id')
      .eq('id', contract.source_offer_version_id!)
      .single()
      .throwOnError();
    await appendDealEvents(owner.client, dealId, [
      {
        aggregateType: 'offer',
        aggregateId: version.offer_id,
        eventType: 'offer.accepted',
        payload: {},
      },
    ]);

    expect(
      await applyContractDates({
        contractId,
        previewed: preview!.flatMap((date) =>
          'to' in date ? [{ kind: date.kind, from: date.from }] : [],
        ),
      }),
    ).toEqual({
      ok: false,
      refusal: 'Timeline dates changed since you opened this. Review again.',
    });
    expect(await milestone('diligence_end')).toMatchObject({ id: null });
  });
});
