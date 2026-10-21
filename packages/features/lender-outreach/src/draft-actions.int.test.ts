import type { SupabaseClient } from '@supabase/supabase-js';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Database } from '@odb/supabase';

const caller = vi.hoisted(() => ({ client: null as unknown }));

vi.mock('@odb/next/actions', () => ({
  enhanceAction:
    (
      fn: (input: unknown, user: unknown) => unknown,
      config: { schema: { parse: (input: unknown) => unknown } },
    ) =>
    async (input: unknown) =>
      fn(
        config.schema.parse(input),
        (await (caller.client as SupabaseClient<Database>).auth.getUser()).data
          .user,
      ),
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => caller.client,
}));

vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://app.odb.test');

import { unwrap } from '@odb/lender-rooms/actions/test-support/unwrap.ts';

import { draftLenderOutreach } from './draft-actions';
import {
  appendEvent,
  seedDeal,
  seedLender,
  seedRoomFor,
} from './seed-deal';
import { saveOutreachTemplate } from './template-actions';
import {
  addMember,
  admin,
  deleteProvisionedPeople,
  newTeam,
  provisionPerson,
  suffix,
} from './test-support';

let owner: SupabaseClient<Database>;
let member: SupabaseClient<Database>;
let readOnly: SupabaseClient<Database>;
let closedRoom: string;
let teamId: string;
let dealId: string;
let bareDealId: string;
let firstRoom: string;
let otherDealRoom: string;
let bareRoom: string;

const bankDomain = `first-${suffix}.test`;
const bareDomain = `bare-${suffix}.test`;

beforeAll(async () => {
  const person = await provisionPerson('draft-owner');
  const colleague = await provisionPerson('draft-colleague');
  const viewer = await provisionPerson('draft-viewer');
  owner = person.client;
  member = colleague.client;
  readOnly = viewer.client;
  caller.client = owner;
  teamId = await newTeam(person.userId, 'buyer-capital', 'Buyer Capital');
  await addMember(teamId, colleague.userId);
  await admin
    .from('accounts_memberships')
    .insert({ account_id: teamId, user_id: viewer.userId, account_role: 'viewer' })
    .throwOnError();

  await admin
    .from('accounts')
    .update({ name: 'Sam Buyer' })
    .eq('primary_owner_user_id', person.userId)
    .eq('is_personal_account', true)
    .throwOnError();

  dealId = await seedDeal(teamId, 'Acme HVAC');
  bareDealId = await seedDeal(teamId, 'Bare Deal');

  await seedLender(teamId, bankDomain, 'First Bank', [
    { name: 'Not Primary', email: 'other@first.test', isPrimary: false },
    { name: 'Dana Reed', email: 'dana@first.test', isPrimary: true },
  ]);
  await seedLender(teamId, bareDomain, 'Bare Bank', [
    { name: 'Bo Bare', email: 'bo@bare.test', isPrimary: true },
  ]);

  firstRoom = await seedRoomFor({ accountId: teamId, dealId }, 'First Bank', bankDomain);
  closedRoom = await seedRoomFor({ accountId: teamId, dealId }, 'Closed Bank', `closed-${suffix}.test`);
  await admin
    .from('lender_room')
    .update({ closed_at: new Date().toISOString() })
    .eq('id', closedRoom)
    .throwOnError();
  otherDealRoom = await seedRoomFor(
    { accountId: teamId, dealId: bareDealId },
    'First Bank',
    bankDomain,
  );
  bareRoom = await seedRoomFor(
    { accountId: teamId, dealId: bareDealId },
    'Bare Bank',
    bareDomain,
  );

  await admin
    .from('deal_terms_sought')
    .insert({
      account_id: teamId,
      deal_id: dealId,
      loan_amount: 500000,
      loan_type: 'sba_7a',
      term_years: 10,
      rate_type: 'fixed',
      seller_note_amount: 50000,
    })
    .throwOnError();
  await appendEvent(dealId, dealId, 'deal', 'deal.close_deadline_set', {
    must_close_by: '2026-11-30',
    must_close_reason: 'The seller lease expires',
  });
  await appendEvent(dealId, crypto.randomUUID(), 'deal_milestone', 'deal_milestone.set', {
    kind: 'closing',
    target_on: '2026-10-30',
  });
});

afterAll(deleteProvisionedPeople);

describe('draftLenderOutreach', () => {
  it("drafts one email to the lender's primary contact for each room of the deal", async () => {
    const { drafts } = await unwrap(draftLenderOutreach({ dealId }));

    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      roomId: firstRoom,
      lenderName: 'First Bank',
      to: 'dana@first.test',
      lastSentAt: null,
    });
    expect(drafts[0]!.body).toContain('Hi Dana Reed,');
  });

  it('states who we are, the situation, the terms, the timeline, and the room link', async () => {
    const {
      drafts: [draft],
    } = await unwrap(draftLenderOutreach({ dealId }));

    expect(draft!.subject).toContain('Acme HVAC');
    expect(draft!.body).toContain("I'm Sam Buyer from Buyer Capital.");
    expect(draft!.body).toContain('- Loan amount: $500,000');
    expect(draft!.body).toContain('- Loan type: SBA 7(a)');
    expect(draft!.body).toContain('- Term: 10 years');
    expect(draft!.body).toContain('- Rate: fixed');
    expect(draft!.body).toContain('- Seller note: $50,000');
    expect(draft!.body).toContain('- Target close: October 30, 2026');
    expect(draft!.body).toContain('- Must close by: November 30, 2026\n');
    expect(draft!.body).not.toContain('The seller lease expires');
    expect(draft!.body).toContain('Can you close by November 30, 2026?');
    expect(draft!.body).toContain(`https://app.odb.test/lender/${firstRoom}`);
  });

  it('leaves out terms and timeline lines the deal has none of', async () => {
    const { drafts } = await unwrap(
      draftLenderOutreach({ dealId: bareDealId }),
    );
    const bare = drafts.find((draft) => draft.roomId === bareRoom)!;

    expect(bare.body).not.toMatch(/null|undefined|\{\{|Loan amount|Timeline|\n\n\n/);
    expect(drafts.map((draft) => draft.roomId).sort()).toEqual(
      [bareRoom, otherDealRoom].sort(),
    );
  });

  it('names the signed-in sender, not the team, as who we are', async () => {
    const { drafts } = await unwrap(draftLenderOutreach({ dealId }));

    expect(drafts[0]!.body).toContain("I'm Sam Buyer from Buyer Capital.");
  });

  it("names the deal by its code name, never the business, when one is set", async () => {
    const codedDeal = await seedDeal(teamId, 'Cedar Plumbing');
    await appendEvent(codedDeal, codedDeal, 'deal', 'deal.updated', {
      code_name: 'Project Kestrel',
    });
    await seedRoomFor(
      { accountId: teamId, dealId: codedDeal },
      'First Bank',
      bankDomain,
    );

    const {
      drafts: [draft],
    } = await unwrap(draftLenderOutreach({ dealId: codedDeal }));

    expect(draft!.subject).toContain('Project Kestrel');
    expect(draft!.subject).not.toContain('Cedar Plumbing');
  });

  it('never shows the lender the deal description', async () => {
    const describedDeal = await seedDeal(teamId, 'Maple Roofing');
    await appendEvent(describedDeal, describedDeal, 'deal', 'deal.updated', {
      description: 'Zanzibar-private-description',
    });
    await seedRoomFor(
      { accountId: teamId, dealId: describedDeal },
      'First Bank',
      bankDomain,
    );

    const {
      drafts: [draft],
    } = await unwrap(draftLenderOutreach({ dealId: describedDeal }));

    expect(draft!.subject).not.toContain('Zanzibar-private-description');
    expect(draft!.body).not.toContain('Zanzibar-private-description');
  });

  it('drafts only open rooms', async () => {
    const { drafts, skipped } = await unwrap(draftLenderOutreach({ dealId }));

    expect([...drafts, ...skipped].map((row) => row.roomId)).not.toContain(
      closedRoom,
    );
  });

  it('skips, with a reason, a room whose lender is not saved with a primary contact email', async () => {
    const strandedDeal = await seedDeal(teamId, 'Stranded Deal');
    const unsavedRoom = await seedRoomFor(
      { accountId: teamId, dealId: strandedDeal },
      'Unsaved Bank',
      `unsaved-${suffix}.test`,
    );

    expect(await unwrap(draftLenderOutreach({ dealId: strandedDeal }))).toEqual({
      drafts: [],
      skipped: [
        {
          roomId: unsavedRoom,
          roomName: 'Unsaved Bank',
          reason: 'Save this lender with a primary contact to draft',
        },
      ],
    });
  });

  it('drafts to the lender the room is linked to, and skips a room with no linked lender, whatever domain it carries', async () => {
    const linkedDomain = `linked-${suffix}.test`;
    await seedLender(teamId, linkedDomain, 'Linked Bank', [
      { name: 'Lee Linked', email: `lee@${linkedDomain}`, isPrimary: true },
    ]);
    const { data: linked } = await admin
      .from('lender')
      .select('id')
      .eq('account_id', teamId)
      .eq('domain', linkedDomain)
      .single()
      .throwOnError();
    const linkDeal = await seedDeal(teamId, 'Link Deal');
    const relinked = await seedRoomFor(
      { accountId: teamId, dealId: linkDeal },
      'Relinked Bank',
      bankDomain,
    );
    await admin
      .from('lender_room')
      .update({ lender_id: linked.id })
      .eq('id', relinked)
      .throwOnError();
    const unlinked = await seedRoomFor(
      { accountId: teamId, dealId: linkDeal },
      'Unlinked Bank',
      bareDomain,
    );
    await admin
      .from('lender_room')
      .update({ lender_id: null })
      .eq('id', unlinked)
      .throwOnError();

    const { drafts, skipped } = await unwrap(
      draftLenderOutreach({ dealId: linkDeal }),
    );

    expect(drafts).toMatchObject([
      { roomId: relinked, lenderName: 'Linked Bank', to: `lee@${linkedDomain}` },
    ]);
    expect(skipped).toEqual([
      {
        roomId: unlinked,
        roomName: 'Unlinked Bank',
        reason: 'Save this lender with a primary contact to draft',
      },
    ]);
  });

  it('lets a team member draft', async () => {
    caller.client = member;
    const { drafts } = await unwrap(draftLenderOutreach({ dealId }));
    caller.client = owner;

    expect(drafts.map((draft) => draft.roomId)).toEqual([firstRoom]);
  });

  it('refuses a read-only teammate', async () => {
    caller.client = readOnly;
    const result = await draftLenderOutreach({ dealId });
    caller.client = owner;

    expect(result).toEqual({
      ok: false,
      refusal: 'Only the deal team can do that',
    });
  });

  it("fills the team's saved template instead of the default", async () => {
    await unwrap(
      saveOutreachTemplate({
        accountId: teamId,
        subject: 'Hello {{lenderName}}',
        body: '{{contactName}}, about {{dealName}}',
      }),
    );

    const {
      drafts: [draft],
    } = await unwrap(draftLenderOutreach({ dealId }));

    expect(draft).toMatchObject({
      subject: 'Hello First Bank',
      body: 'Dana Reed, about Acme HVAC',
    });
  });
});
