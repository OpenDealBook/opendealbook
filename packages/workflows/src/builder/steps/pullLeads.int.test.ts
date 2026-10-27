import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { provisionAccount, type IntegrationAccount } from '../../../test-support/integration-harness';
import { pullLeads } from './pullLeads';

let owner: IntegrationAccount;
const businessIds: string[] = [];

function yearsAgo(years: number): string {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - years);
  return date.toISOString().slice(0, 10);
}

async function seedBusiness(business: {
  name: string;
  state?: string;
  jobs?: number;
  loan?: number;
  headcount?: number;
  formedYearsAgo?: number;
  registryStatus?: string;
}): Promise<string> {
  const { admin } = owner;
  const unique = crypto.randomUUID();
  const { data } = await admin
    .from('public_business')
    .insert({ name: business.name })
    .select('id')
    .single()
    .throwOnError();
  const businessId = data.id as string;
  businessIds.push(businessId);
  const state = business.state ?? 'MP';
  if (business.jobs !== undefined || business.loan !== undefined) {
    await admin
      .from('ppp_loan')
      .insert({
        loan_number: `ppp-${unique}`,
        business_id: businessId,
        borrower_name: business.name,
        state,
        jobs_reported: business.jobs,
        loan_amount: business.loan,
      })
      .throwOnError();
  }
  if (business.headcount !== undefined) {
    await admin
      .from('form_5500_filing')
      .insert({
        ack_id: `ack-${unique}`,
        business_id: businessId,
        ein: String(Math.floor(100_000_000 + Math.random() * 899_999_999)),
        sponsor_name: business.name,
        state,
        participant_count: business.headcount,
      })
      .throwOnError();
  }
  if (business.formedYearsAgo !== undefined) {
    await admin
      .from('state_registry_entity')
      .insert({
        state,
        entity_number: `reg-${unique}`,
        business_id: businessId,
        name: business.name,
        formation_date: yearsAgo(business.formedYearsAgo),
        status: business.registryStatus,
        source: 'bulk_file',
        fetched_at: new Date().toISOString(),
      })
      .throwOnError();
  }
  return businessId;
}

const fits = { jobs: 20, loan: 300_000, headcount: 30, formedYearsAgo: 12 };

let fitting: string;
let fittingToo: string;
let fewJobs: string;
let bigLoan: string;
let young: string;
let manyStaff: string;
let elsewhere: string;
let alreadyOurs: string;
let rejected: string;

function pull(idempotencyKey: string, config: Record<string, unknown>) {
  return pullLeads.execute({
    context: { accountId: owner.accountId, runId: 'run-1', idempotencyKey },
    config,
    input: {},
  });
}

async function teamBusinessIds(): Promise<string[]> {
  const { data } = await owner.admin
    .from('firm')
    .select('public_business_id')
    .eq('account_id', owner.accountId)
    .not('public_business_id', 'is', null)
    .throwOnError();
  return data.map((firm: { public_business_id: string }) => firm.public_business_id).sort();
}

beforeAll(async () => {
  owner = await provisionAccount();
  await owner.admin
    .from('deal_box')
    .insert({
      account_id: owner.accountId,
      version: 1,
      criteria_json: {
        states: ['MP'],
        size: {
          jobs: { min: 10, max: 50 },
          pppLoanAmount: { min: 100_000, max: 1_000_000 },
          form5500Participants: { min: 5, max: 100 },
          minBusinessAgeYears: 5,
        },
      },
    })
    .throwOnError();

  fitting = await seedBusiness({ name: 'Rowan Fixture Plumbing', ...fits });
  fittingToo = await seedBusiness({ name: 'Tinian Electric', ...fits });
  fewJobs = await seedBusiness({ name: 'Tiny Roofing', ...fits, jobs: 4 });
  bigLoan = await seedBusiness({ name: 'Large Loan HVAC', ...fits, loan: 2_000_000 });
  young = await seedBusiness({ name: 'New Paving', ...fits, formedYearsAgo: 2 });
  manyStaff = await seedBusiness({ name: 'Staffed Glass', ...fits, headcount: 400 });
  elsewhere = await seedBusiness({ name: 'Guam Masonry', ...fits, state: 'GU' });
  alreadyOurs = await seedBusiness({ name: 'Rota Pest Control', ...fits });
  rejected = await seedBusiness({ name: 'Rejected Fencing', ...fits });

  await owner.admin
    .from('firm')
    .insert({ account_id: owner.accountId, name: 'Rota Pest Control', public_business_id: alreadyOurs })
    .throwOnError();
  for (const table of ['ppp_loan', 'form_5500_filing', 'state_registry_entity'] as const) {
    const key = { ppp_loan: 'loan_number', form_5500_filing: 'ack_id', state_registry_entity: 'id' }[table];
    const reviewColumn = {
      ppp_loan: 'ppp_loan_number',
      form_5500_filing: 'form_5500_ack_id',
      state_registry_entity: 'registry_entity_id',
    }[table];
    const { data: record } = await owner.admin
      .from(table)
      .select(key)
      .eq('business_id', rejected)
      .single()
      .throwOnError();
    await owner.admin
      .from('business_match_review')
      .insert({
        account_id: owner.accountId,
        business_id: rejected,
        [reviewColumn]: (record as unknown as Record<string, string>)[key],
        score: 0.7,
        status: 'rejected',
        reviewed_by: owner.userId,
        reviewed_at: new Date().toISOString(),
      })
      .throwOnError();
  }
});

afterAll(async () => {
  await owner.admin.from('accounts').delete().eq('id', owner.accountId);
  for (const table of ['ppp_loan', 'form_5500_filing', 'state_registry_entity']) {
    await owner.admin.from(table).delete().in('business_id', businessIds);
  }
  await owner.admin.from('public_business').delete().in('id', businessIds);
  await owner.cleanup();
});

describe('pull_leads step (integration)', () => {
  it('fails at once when the team has no deal box', async () => {
    const bare = await provisionAccount();

    await expect(
      pullLeads.execute({
        context: { accountId: bare.accountId, runId: 'run-1', idempotencyKey: 'run-1:pull:bare' },
        config: { sources: ['ppp'] },
        input: {},
      }),
    ).rejects.toMatchObject({ nonRetryable: true, message: 'Set your deal box before pulling leads.' });
    await bare.admin.from('accounts').delete().eq('id', bare.accountId);
    await bare.cleanup();
  });

  it('refuses a lower maximum than the deal box', async () => {
    await expect(
      pull('run-1:pull:narrow-max', { sources: ['ppp'], widen: { maxPppLoan: 500_000 } }),
    ).rejects.toMatchObject({
      nonRetryable: true,
      message: 'This pull is narrower than your deal box on maxPppLoan. A pull may only go wider.',
    });
  });

  it('refuses a states list when the deal box covers every state', async () => {
    const nationwide = await provisionAccount();
    await nationwide.admin
      .from('deal_box')
      .insert({ account_id: nationwide.accountId, version: 1, criteria_json: { states: [] } })
      .throwOnError();

    await expect(
      pullLeads.execute({
        context: { accountId: nationwide.accountId, runId: 'run-1', idempotencyKey: 'run-1:pull:nationwide' },
        config: { sources: ['ppp'], widen: { states: ['MP'] } },
        input: {},
      }),
    ).rejects.toMatchObject({
      nonRetryable: true,
      message: 'This pull is narrower than your deal box on states. A pull may only go wider.',
    });
    await nationwide.admin.from('accounts').delete().eq('id', nationwide.accountId);
    await nationwide.cleanup();
  });

  it('refuses at once, adding nothing, when the pull is narrower than the deal box', async () => {
    await expect(
      pull('run-1:pull:narrow', { sources: ['ppp'], widen: { minJobs: 15 } }),
    ).rejects.toMatchObject({
      nonRetryable: true,
      message: 'This pull is narrower than your deal box on minJobs. A pull may only go wider.',
    });
    await expect(
      pull('run-1:pull:narrow-states', { sources: ['ppp'], widen: { states: ['GU'] } }),
    ).rejects.toMatchObject({
      nonRetryable: true,
      message: 'This pull is narrower than your deal box on states. A pull may only go wider.',
    });
    expect(await teamBusinessIds()).toEqual([alreadyOurs]);
  });

  it("adds the matched businesses inside the deal box as the team's firms, skipping firms it has and rejected matches", async () => {
    const output = await pull('run-1:pull:0', { sources: ['ppp', 'form_5500'] });

    expect(output.count).toBe(2);
    const { data: firms } = await owner.admin
      .from('firm')
      .select('id, name, public_business_id')
      .in('id', output.firmIds as string[])
      .eq('account_id', owner.accountId)
      .throwOnError();
    expect(firms.map((firm: { public_business_id: string }) => firm.public_business_id).sort()).toEqual(
      [fitting, fittingToo].sort(),
    );
    expect(firms.map((firm: { name: string }) => firm.name).sort()).toEqual(['Rowan Fixture Plumbing', 'Tinian Electric']);
    expect(await teamBusinessIds()).not.toEqual(expect.arrayContaining([fewJobs]));
    expect(await teamBusinessIds()).toEqual([alreadyOurs, fitting, fittingToo].sort());
  });

  it('returns the same firms without adding more when the step is retried', async () => {
    const first = await pull('run-1:pull:0', { sources: ['ppp'] });
    await owner.admin.from('firm').delete().eq('account_id', owner.accountId).eq('public_business_id', fitting);

    const again = await pull('run-1:pull:0', { sources: ['ppp'] });

    expect(again).toEqual(first);
    expect(await teamBusinessIds()).toEqual([alreadyOurs, fittingToo].sort());
  });

  it('goes wider than the deal box when the step widens it', async () => {
    const output = await pull('run-1:pull:1', {
      sources: ['ppp'],
      widen: { minJobs: 1, maxPppLoan: 5_000_000, minAgeYears: 1, maxHeadcount: 1000, states: ['MP', 'GU'] },
    });

    expect(output.count).toBe(6);
    expect(await teamBusinessIds()).toEqual(
      [alreadyOurs, fittingToo, fitting, fewJobs, bigLoan, young, manyStaff, elsewhere].sort(),
    );
  });

  it('pulls only from the chosen sources and at most the step limit', async () => {
    await owner.admin.from('firm').delete().eq('account_id', owner.accountId).neq('public_business_id', alreadyOurs);

    expect(await pull('run-1:pull:2', { sources: ['sba_7a'] })).toEqual({ firmIds: [], count: 0 });
    const limited = await pull('run-1:pull:3', { sources: ['state_registry'], limit: 1 });

    expect(limited.count).toBe(1);
    expect(await teamBusinessIds()).toHaveLength(2);
  });

  it('skips a business whose newest registry record is dissolved or inactive', async () => {
    const olderRecord = async (businessId: string, status: string) =>
      owner.admin
        .from('state_registry_entity')
        .insert({
          state: 'MP',
          entity_number: `reg-${crypto.randomUUID()}`,
          business_id: businessId,
          name: 'Earlier filing',
          formation_date: yearsAgo(12),
          status,
          source: 'bulk_file',
          fetched_at: '2020-01-01T00:00:00Z',
        })
        .throwOnError();
    const dissolved = await seedBusiness({ name: 'Closed Drywall', ...fits, registryStatus: 'Administratively Dissolved' });
    await olderRecord(dissolved, 'Good Standing');
    const inactive = await seedBusiness({ name: 'Idle Welding', ...fits, registryStatus: 'Inactive' });
    const revived = await seedBusiness({ name: 'Revived Masonry', ...fits, registryStatus: 'Active - In Good Standing' });
    await olderRecord(revived, 'Dissolved');

    await pull('run-1:pull:active', { sources: ['ppp'] });

    const pulled = await teamBusinessIds();
    expect(pulled).toContain(revived);
    expect(pulled).not.toContain(dissolved);
    expect(pulled).not.toContain(inactive);
  });

  it('links a team firm with the same EIN and no public business instead of adding another firm', async () => {
    const ein = String(Math.floor(100_000_000 + Math.random() * 899_999_999));
    const business = await seedBusiness({ name: 'Known Cabinetry LLC', ...fits });
    await owner.admin.from('public_business').update({ ein }).eq('id', business).throwOnError();
    const { data: known } = await owner.admin
      .from('firm')
      .insert({ account_id: owner.accountId, name: 'Known Cabinetry', ein })
      .select('id')
      .single()
      .throwOnError();

    const output = await pull('run-1:pull:ein', { sources: ['ppp'] });

    expect(output.firmIds).toContain(known.id);
    const { data: firms } = await owner.admin
      .from('firm')
      .select('id, name')
      .eq('account_id', owner.accountId)
      .eq('public_business_id', business)
      .throwOnError();
    expect(firms).toEqual([{ id: known.id, name: 'Known Cabinetry' }]);
  });

  it("fills a new firm's city and state from the business's newest record that has them, registry first", async () => {
    const registered = await seedBusiness({ name: 'Registered Tile', ...fits });
    await owner.admin
      .from('state_registry_entity')
      .update({ mailing_city: 'Saipan', mailing_state: 'MP' })
      .eq('business_id', registered)
      .throwOnError();
    await owner.admin
      .from('ppp_loan')
      .update({ city: 'Garapan' })
      .eq('business_id', registered)
      .throwOnError();
    const loanOnly = await seedBusiness({ name: 'Loan Only Tile', ...fits });
    await owner.admin
      .from('ppp_loan')
      .insert([
        { loan_number: `ppp-${crypto.randomUUID()}`, business_id: loanOnly, borrower_name: 'Loan Only Tile', city: 'Rota', state: 'MP', approved_on: '2020-05-01' },
        { loan_number: `ppp-${crypto.randomUUID()}`, business_id: loanOnly, borrower_name: 'Loan Only Tile', city: 'Tinian', state: 'MP', approved_on: '2021-05-01' },
      ])
      .throwOnError();

    await pull('run-1:pull:places', { sources: ['ppp'] });

    const { data: firms } = await owner.admin
      .from('firm')
      .select('public_business_id, city, state')
      .eq('account_id', owner.accountId)
      .in('public_business_id', [registered, loanOnly])
      .throwOnError();
    expect(firms).toEqual(
      expect.arrayContaining([
        { public_business_id: registered, city: 'Saipan', state: 'MP' },
        { public_business_id: loanOnly, city: 'Tinian', state: 'MP' },
      ]),
    );
  });
});
