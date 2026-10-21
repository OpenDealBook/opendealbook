import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

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

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON_KEY);
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY);
vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://app.odb.test');

const world = vi.hoisted(() => ({ signedInClient: null as unknown }));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => world.signedInClient,
}));

const { loadDealUpdates } = await import('./queries');
const { loadDealPeople } = await import('@odb/deal-people/queries.ts');

type Person = Awaited<ReturnType<typeof provisionPerson>>;

let author: Person;
let approver: Person;
let teammate: Person;
let teamId: string;
let dealId: string;

beforeAll(async () => {
  author = await provisionPerson();
  approver = await provisionPerson();
  teammate = await provisionPerson();
  teamId = await provisionTeam(author, 'Delivery Partners');
  dealId = await newDeal(teamId, author);

  await admin
    .from('accounts_memberships')
    .insert([
      { account_id: teamId, user_id: approver.userId, account_role: 'admin' },
      { account_id: teamId, user_id: teammate.userId, account_role: 'member' },
    ])
    .throwOnError();
});

afterAll(async () => {
  await cleanUp([teamId]);
});

describe('deal update delivery status', () => {
  it('shows the whole team each recipient of an approved update and how delivery went', async () => {
    const { data: approved } = await admin
      .from('deal_update')
      .insert({
        account_id: teamId,
        deal_id: dealId,
        author_id: author.userId,
        subject: 'Appraisal in',
        body: 'Came in at value.',
        picks: { groups: ['team'], people: [] },
        status: 'approved',
      })
      .select('id')
      .single()
      .throwOnError();
    const now = new Date().toISOString();

    await admin
      .from('deal_update_recipient')
      .insert([
        {
          update_id: approved.id,
          user_id: author.userId,
          email: author.email,
          name: 'Ann Author',
          entries: [],
          sent_at: now,
        },
        {
          update_id: approved.id,
          user_id: approver.userId,
          email: approver.email,
          name: 'Abe Approver',
          entries: [],
          failed_at: now,
          error: 'Mailbox does not exist',
        },
        {
          update_id: approved.id,
          email: 'gone@ex.test',
          name: 'Gail Gone',
          entries: [],
        },
      ])
      .throwOnError();

    world.signedInClient = teammate.client;
    const { updates } = await loadDealUpdates({
      dealId,
      accountId: teamId,
      roster: await loadDealPeople({ dealId, accountId: teamId }),
    });
    const byEmail = (a: { email: string }, b: { email: string }) =>
      a.email.localeCompare(b.email);
    const recipients = updates.find(
      (update) => update.id === approved.id,
    )!.recipients;

    expect(recipients.toSorted(byEmail)).toEqual(
      [
        {
          email: author.email,
          name: 'Ann Author',
          deleted: false,
          delivery: { state: 'sent' },
        },
        {
          email: approver.email,
          name: 'Abe Approver',
          deleted: false,
          delivery: { state: 'failed', error: 'Mailbox does not exist' },
        },
        {
          email: 'gone@ex.test',
          name: 'Gail Gone',
          deleted: true,
          delivery: { state: 'pending' },
        },
      ].toSorted(byEmail),
    );
  });
});
