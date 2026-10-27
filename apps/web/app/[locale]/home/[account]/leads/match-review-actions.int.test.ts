import type { SupabaseClient } from '@supabase/supabase-js';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  admin,
  cleanUp,
  provisionPerson,
  provisionTeam,
  type Person,
  withLockedTeam,
} from '@odb/seller-rooms/test-support/world.ts';

const world = vi.hoisted(() => ({
  client: null as unknown as SupabaseClient,
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => world.client,
}));

import { TEAM_READ_ONLY } from '@odb/next';

import { decideMatchReview } from './match-review-actions';

let owner: Person;
let member: Person;
let outsider: Person;
let teamId: string;
let outsiderTeamId: string;
let businessId: string;
let reviewId: string;
const loanNumber = `review-${crypto.randomUUID().slice(0, 8)}`;

function as(person: Person) {
  world.client = person.client;
}

async function review() {
  const { data } = await admin
    .from('business_match_review')
    .select('status, reviewed_by')
    .eq('id', reviewId)
    .single()
    .throwOnError();
  return data;
}

async function sharedRecords() {
  const [{ data: loan }, { data: business }] = await Promise.all([
    admin.from('ppp_loan').select('business_id, borrower_name').eq('loan_number', loanNumber).single().throwOnError(),
    admin.from('public_business').select('name, ein, match_key').eq('id', businessId).single().throwOnError(),
  ]);
  return { loan, business };
}

beforeAll(async () => {
  owner = await provisionPerson();
  member = await provisionPerson();
  outsider = await provisionPerson();
  teamId = await provisionTeam(owner, 'Harbor Holdings');
  outsiderTeamId = await provisionTeam(outsider, 'Elsewhere Capital');
  await admin
    .from('accounts_memberships')
    .insert({ account_id: teamId, user_id: member.userId, account_role: 'member' })
    .throwOnError();

  const { data: business } = await admin
    .from('public_business')
    .insert({ name: 'Acme Plumbing LLC' })
    .select('id')
    .single()
    .throwOnError();
  businessId = business.id;
  await admin
    .from('ppp_loan')
    .insert({ loan_number: loanNumber, borrower_name: 'Acme Plumbing and Heating' })
    .throwOnError();
  const { data: created } = await admin
    .from('business_match_review')
    .insert({ account_id: teamId, business_id: businessId, ppp_loan_number: loanNumber, score: 0.7 })
    .select('id')
    .single()
    .throwOnError();
  reviewId = created.id;
});

beforeEach(async () => {
  await admin
    .from('business_match_review')
    .update({ status: 'pending', reviewed_by: null, reviewed_at: null })
    .eq('id', reviewId)
    .throwOnError();
});

afterAll(async () => {
  await admin.from('ppp_loan').delete().eq('loan_number', loanNumber).throwOnError();
  await admin.from('public_business').delete().eq('id', businessId).throwOnError();
  await cleanUp([teamId, outsiderTeamId]);
});

describe('decideMatchReview', () => {
  it('lets a deal manager accept a weak match for the team, leaving the shared records unchanged', async () => {
    const before = await sharedRecords();
    as(owner);

    expect(await decideMatchReview({ reviewId, accept: true })).toEqual({ ok: true, value: undefined });

    expect(await review()).toEqual({ status: 'accepted', reviewed_by: owner.userId });
    expect(await sharedRecords()).toEqual(before);
  });

  it('lets a deal manager reject a weak match for the team', async () => {
    as(owner);

    await decideMatchReview({ reviewId, accept: false });

    expect(await review()).toEqual({ status: 'rejected', reviewed_by: owner.userId });
  });

  it('refuses a team member without deals.manage', async () => {
    as(member);

    expect(await decideMatchReview({ reviewId, accept: true })).toEqual({
      ok: false,
      refusal: 'Only deal managers can review matches. Ask a deal manager.',
    });
    expect(await review()).toEqual({ status: 'pending', reviewed_by: null });
  });

  it("refuses a deal manager of another team", async () => {
    as(outsider);

    expect((await decideMatchReview({ reviewId, accept: true })).ok).toBe(false);
    expect(await review()).toEqual({ status: 'pending', reviewed_by: null });
  });

  it('refuses with the read-only notice while the team is locked', async () => {
    as(owner);

    await withLockedTeam(teamId, async () => {
      expect(await decideMatchReview({ reviewId, accept: true })).toEqual({ ok: false, refusal: TEAM_READ_ONLY });
    });
    expect(await review()).toEqual({ status: 'pending', reviewed_by: null });
  });
});
