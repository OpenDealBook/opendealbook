import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import pg from 'pg';

import { appendDealEvents } from '@odb/events';
import {
  ANON_KEY,
  cleanUp,
  newDeal,
  provisionPerson,
  provisionTeam,
  SERVICE_ROLE_KEY,
  SUPABASE_URL,
} from '@odb/seller-rooms/test-support/world.ts';

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON_KEY);
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY);

const DB_URL =
  process.env.SUPABASE_DB_URL ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const world = vi.hoisted(() => ({ signedInClient: null as unknown }));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => world.signedInClient,
}));

const { applyContractDates } = await import('./apply-contract-dates');
const { removeMilestone, setMilestone } = await import('./actions');

type Person = Awaited<ReturnType<typeof provisionPerson>>;

let owner: Person;
let teamId: string;
let dealId: string;

async function checklistItem(
  kind: 'diligence' | 'closing' | 'post_close',
  dueOffsetDays: number,
) {
  const itemId = crypto.randomUUID();

  await appendDealEvents(owner.client, dealId, [
    {
      aggregateType: 'checklist_item',
      aggregateId: itemId,
      eventType: 'checklist_item.added',
      payload: {
        title: `${kind} item`,
        kind,
        due_offset_days: dueOffsetDays,
        review_offset_days: 3,
      },
    },
  ]);

  return itemId;
}

async function dates(itemId: string) {
  const { data } = await owner.client
    .from('checklist_item')
    .select('due_at, review_due_at')
    .eq('id', itemId)
    .single()
    .throwOnError();

  return data;
}

const at = (day: string) => `${day}T00:00:00+00:00`;

beforeAll(async () => {
  owner = await provisionPerson();
  teamId = await provisionTeam(owner, 'Checklist Dates Partners');
});

beforeEach(async () => {
  world.signedInClient = owner.client;
  dealId = await newDeal(teamId, owner);
});

afterAll(async () => {
  await cleanUp([teamId]);
});

describe('checklist dates follow the deal anchors', () => {
  it('moves diligence items when LOI signed gets an actual date', async () => {
    const itemId = await checklistItem('diligence', 10);

    await setMilestone({
      dealId,
      milestoneId: crypto.randomUUID(),
      kind: 'loi_signed',
      targetOn: null,
      actualOn: '2026-03-01',
      shared: true,
    });

    expect(await dates(itemId)).toEqual({
      due_at: at('2026-03-11'),
      review_due_at: at('2026-03-14'),
    });
  });

  it('moves closing items when the closing target is set', async () => {
    const itemId = await checklistItem('closing', -5);

    await setMilestone({
      dealId,
      milestoneId: crypto.randomUUID(),
      kind: 'closing',
      targetOn: '2026-06-30',
      actualOn: null,
      shared: true,
    });

    expect(await dates(itemId)).toEqual({
      due_at: at('2026-06-25'),
      review_due_at: at('2026-06-28'),
    });
  });

  it('moves post-close items when the closing actual is set', async () => {
    const itemId = await checklistItem('post_close', 7);

    await setMilestone({
      dealId,
      milestoneId: crypto.randomUUID(),
      kind: 'closing',
      targetOn: '2026-06-30',
      actualOn: '2026-07-01',
      shared: true,
    });

    expect(await dates(itemId)).toEqual({
      due_at: at('2026-07-08'),
      review_due_at: at('2026-07-11'),
    });
  });

  it('moves closing items when applying contract dates changes the closing target', async () => {
    const itemId = await checklistItem('closing', -5);
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
          target_close_date: '2026-12-01',
          terms: { purchase_price: 1_000_000 },
        },
      },
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

    await applyContractDates({
      contractId,
      previewed: [{ kind: 'closing', from: null }],
    });

    expect(await dates(itemId)).toEqual({
      due_at: at('2026-11-26'),
      review_due_at: at('2026-11-29'),
    });
  });

  it('clears open diligence dates when the LOI signed actual is removed', async () => {
    const itemId = await checklistItem('diligence', 10);
    const milestoneId = crypto.randomUUID();

    await setMilestone({
      dealId,
      milestoneId,
      kind: 'loi_signed',
      targetOn: null,
      actualOn: '2026-03-01',
      shared: true,
    });
    await removeMilestone({ dealId, milestoneId });

    expect(await dates(itemId)).toEqual({ due_at: null, review_due_at: null });
  });

  it('moves dates when a deal manager without checklists.manage sets a milestone', async () => {
    const roleName = `deals_only_${crypto.randomUUID().slice(0, 8)}`;
    const member = await provisionPerson();
    const db = new pg.Client({ connectionString: DB_URL });
    await db.connect();

    try {
      await db.query(
        'insert into public.roles (name, hierarchy_level) values ($1, 99)',
        [roleName],
      );
      await db.query(
        "insert into public.role_permissions (role, permission) values ($1, 'deals.manage'), ($1, 'deals.work')",
        [roleName],
      );
      await db.query(
        'insert into public.accounts_memberships (account_id, user_id, account_role) values ($1, $2, $3)',
        [teamId, member.userId, roleName],
      );

      const itemId = await checklistItem('closing', -5);
      world.signedInClient = member.client;

      expect(
        await setMilestone({
          dealId,
          milestoneId: crypto.randomUUID(),
          kind: 'closing',
          targetOn: '2026-06-30',
          actualOn: null,
          shared: true,
        }),
      ).toEqual({ ok: true, value: undefined });
      expect(await dates(itemId)).toEqual({
        due_at: at('2026-06-25'),
        review_due_at: at('2026-06-28'),
      });
    } finally {
      await db.query('delete from public.accounts_memberships where user_id = $1', [member.userId]);
      await db.query('delete from public.role_permissions where role = $1', [roleName]);
      await db.query('delete from public.roles where name = $1', [roleName]);
      await db.end();
    }
  });
});
