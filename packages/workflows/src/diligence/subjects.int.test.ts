import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  provisionAccount,
  seedDeal,
  type IntegrationAccount,
} from '../../test-support/integration-harness';
import { diligenceSubjects } from './subjects';

let owner: IntegrationAccount;
let stranger: IntegrationAccount;
let newest: IntegrationAccount;
const businessIds: string[] = [];

async function seedFirmDeal(
  account: IntegrationAccount,
  firm: Record<string, unknown>,
): Promise<{ dealId: string; firmId: string }> {
  const { data } = await account.admin
    .from('firm')
    .insert({ account_id: account.accountId, ...firm })
    .select('id')
    .single()
    .throwOnError();
  const dealId = await seedDeal(
    account.admin,
    account.accountId,
    account.userId,
    { firm_id: data.id },
  );
  return { dealId, firmId: data.id };
}

async function seedBusiness(name: string): Promise<string> {
  const { data } = await owner.admin
    .from('public_business')
    .insert({ name })
    .select('id')
    .single()
    .throwOnError();
  businessIds.push(data.id);
  return data.id;
}

async function seedRegistry(
  businessId: string,
  fields: Record<string, string>,
) {
  await owner.admin
    .from('state_registry_entity')
    .insert({
      state: 'CT',
      entity_number: `reg-${crypto.randomUUID()}`,
      business_id: businessId,
      name: 'Registered Name',
      source: 'bulk_file',
      fetched_at: new Date().toISOString(),
      ...fields,
    })
    .throwOnError();
}

async function seedPpp(businessId: string, fields: Record<string, string>) {
  await owner.admin
    .from('ppp_loan')
    .insert({
      loan_number: `ppp-${crypto.randomUUID()}`,
      business_id: businessId,
      borrower_name: 'Loan Name',
      ...fields,
    })
    .throwOnError();
}

async function addDealContact(
  dealId: string,
  name: string | null,
  side: string,
  role: string,
  account = owner,
) {
  const { data: contact } = await account.admin
    .from('contact')
    .insert({ account_id: account.accountId, name })
    .select('id')
    .single()
    .throwOnError();
  await owner.admin
    .from('deal_contact')
    .insert({
      account_id: account.accountId,
      deal_id: dealId,
      contact_id: contact.id,
      side,
      role,
    })
    .throwOnError();
}

beforeAll(async () => {
  owner = await provisionAccount();
  stranger = await provisionAccount();
  newest = await provisionAccount();
  await newest.admin
    .from('accounts')
    .update({ diligence_name_spelling: 'newest_record' })
    .eq('id', newest.accountId)
    .throwOnError();
});

afterAll(async () => {
  await owner.admin
    .from('accounts')
    .delete()
    .in('id', [owner.accountId, stranger.accountId, newest.accountId]);
  await owner.admin.from('ppp_loan').delete().in('business_id', businessIds);
  await owner.admin.from('sba_loan').delete().in('business_id', businessIds);
  await owner.admin
    .from('form_5500_filing')
    .delete()
    .in('business_id', businessIds);
  await owner.admin
    .from('state_registry_entity')
    .delete()
    .in('business_id', businessIds);
  await owner.admin.from('public_business').delete().in('id', businessIds);
  await owner.cleanup();
  await stranger.cleanup();
  await newest.cleanup();
});

describe('diligenceSubjects (integration)', () => {
  it("gathers the deal's businesses and people from its firm, public records and principals, deduped", async () => {
    const { data: business } = await owner.admin
      .from('public_business')
      .insert({ name: 'Harbor Fixture Plumbing LLC' })
      .select('id')
      .single()
      .throwOnError();
    businessIds.push(business.id);
    await owner.admin
      .from('ppp_loan')
      .insert({
        loan_number: `ppp-${crypto.randomUUID()}`,
        business_id: business.id,
        borrower_name: 'harbor   fixture plumbing',
        address_line1: '1 Loan St',
        city: 'Austin',
        state: 'TX',
        postal_code: '78701',
      })
      .throwOnError();
    await owner.admin
      .from('sba_loan')
      .insert({
        source_key: `sba-${crypto.randomUUID()}`,
        program: 'sba_7a',
        business_id: business.id,
        borrower_name: 'HFP Holdings',
      })
      .throwOnError();
    await owner.admin
      .from('form_5500_filing')
      .insert({
        ack_id: `ack-${crypto.randomUUID()}`,
        business_id: business.id,
        ein: String(Math.floor(100_000_000 + Math.random() * 899_999_999)),
        sponsor_name: 'HARBOR FIXTURE PLUMBING LLC',
      })
      .throwOnError();
    const { data: entity } = await owner.admin
      .from('state_registry_entity')
      .insert({
        state: 'MP',
        entity_number: `reg-${crypto.randomUUID()}`,
        business_id: business.id,
        name: 'Harbor Fixture Plumbing, LLC',
        source: 'bulk_file',
        fetched_at: new Date().toISOString(),
      })
      .select('id')
      .single()
      .throwOnError();
    await owner.admin
      .from('state_registry_officer')
      .insert([
        {
          entity_id: entity.id,
          name: 'ana  DELGADO-ruiz',
          title: 'Managing Member',
        },
        { entity_id: entity.id, name: 'Ben Okafor', title: 'Member' },
      ])
      .throwOnError();
    const { dealId, firmId } = await seedFirmDeal(owner, {
      name: 'Harbor Fixture Plumbing',
      state: 'mp',
      public_business_id: business.id,
      owner_names: ['Ben Okafor', 'Cora Lin'],
    });
    await addDealContact(dealId, 'Ana Delgado-Ruiz', 'seller', 'principal');
    await addDealContact(dealId, 'Seller Broker Person', 'seller', 'broker');
    await addDealContact(
      dealId,
      'Buyer Principal Person',
      'buyer',
      'principal',
    );

    expect(await diligenceSubjects(owner.accountId, dealId)).toEqual({
      dealId,
      firmId,
      state: 'MP',
      subjects: [
        {
          key: 'business:harbor fixture plumbing',
          kind: 'business',
          name: 'Harbor Fixture Plumbing',
          sources: ['firm', 'ppp_loan'],
        },
        {
          key: 'business:harbor fixture plumbing llc',
          kind: 'business',
          name: 'Harbor Fixture Plumbing LLC',
          sources: ['public_business', 'form_5500_filing'],
        },
        {
          key: 'business:hfp holdings',
          kind: 'business',
          name: 'HFP Holdings',
          sources: ['sba_loan'],
        },
        {
          key: 'business:harbor fixture plumbing, llc',
          kind: 'business',
          name: 'Harbor Fixture Plumbing, LLC',
          sources: ['state_registry_entity'],
        },
        {
          key: 'person:ana delgado-ruiz',
          kind: 'person',
          name: 'Ana Delgado-Ruiz',
          sources: ['deal_contact', 'state_registry_officer'],
        },
        {
          key: 'person:ben okafor',
          kind: 'person',
          name: 'Ben Okafor',
          sources: ['state_registry_officer', 'firm'],
        },
        {
          key: 'person:cora lin',
          kind: 'person',
          name: 'Cora Lin',
          sources: ['firm'],
        },
      ],
    });
  });

  it('gathers only the firm name and owners when the firm has no public business', async () => {
    const { dealId, firmId } = await seedFirmDeal(owner, {
      name: 'Referral Landscaping',
      owner_names: ['Dee Park'],
    });

    expect(await diligenceSubjects(owner.accountId, dealId)).toEqual({
      dealId,
      firmId,
      state: null,
      subjects: [
        {
          key: 'business:referral landscaping',
          kind: 'business',
          name: 'Referral Landscaping',
          sources: ['firm'],
        },
        {
          key: 'person:dee park',
          kind: 'person',
          name: 'Dee Park',
          sources: ['firm'],
        },
      ],
    });
  });

  it('skips principals with no name and blank names from any source', async () => {
    const business = await seedBusiness('Blankety Supply');
    await owner.admin
      .from('ppp_loan')
      .insert({
        loan_number: `ppp-${crypto.randomUUID()}`,
        business_id: business,
        borrower_name: '   ',
      })
      .throwOnError();
    const { dealId } = await seedFirmDeal(owner, {
      name: 'Blankety Supply',
      public_business_id: business,
      owner_names: ['', '  ', 'Eve Marsh'],
    });
    await addDealContact(dealId, null, 'seller', 'principal');

    expect((await diligenceSubjects(owner.accountId, dealId)).subjects).toEqual(
      [
        {
          key: 'business:blankety supply',
          kind: 'business',
          name: 'Blankety Supply',
          sources: ['firm', 'public_business'],
        },
        {
          key: 'person:eve marsh',
          kind: 'person',
          name: 'Eve Marsh',
          sources: ['firm'],
        },
      ],
    );
  });

  it("shows each name in its source's newest spelling", async () => {
    const business = await seedBusiness('Acme Roofing Holdings');
    for (const [borrower_name, approved_on] of [
      ['ACME ROOFING', '2020-01-01'],
      ['Acme Roofing', '2022-01-01'],
      ['acme roofing', '2021-01-01'],
    ]) {
      await owner.admin
        .from('ppp_loan')
        .insert({
          loan_number: `ppp-${crypto.randomUUID()}`,
          business_id: business,
          borrower_name,
          approved_on,
        })
        .throwOnError();
    }
    const { dealId } = await seedFirmDeal(owner, {
      name: 'Roofers',
      public_business_id: business,
    });
    await addDealContact(dealId, 'dana reyes', 'seller', 'principal');
    await addDealContact(dealId, 'Dana Reyes', 'seller', 'principal');

    expect((await diligenceSubjects(owner.accountId, dealId)).subjects).toEqual(
      [
        {
          key: 'business:roofers',
          kind: 'business',
          name: 'Roofers',
          sources: ['firm'],
        },
        {
          key: 'business:acme roofing holdings',
          kind: 'business',
          name: 'Acme Roofing Holdings',
          sources: ['public_business'],
        },
        {
          key: 'business:acme roofing',
          kind: 'business',
          name: 'Acme Roofing',
          sources: ['ppp_loan'],
        },
        {
          key: 'person:dana reyes',
          kind: 'person',
          name: 'Dana Reyes',
          sources: ['deal_contact'],
        },
      ],
    );
  });

  it('falls back to the state of the mailing address prepare_firm would pick', async () => {
    const fromRegistry = await seedBusiness('Registry Address Co');
    await seedRegistry(fromRegistry, {
      mailing_address_line1: '1 Main St',
      mailing_city: 'Hartford',
      mailing_state: 'ct',
      mailing_postal_code: '06103',
    });
    await seedPpp(fromRegistry, {
      address_line1: '2 Loan St',
      city: 'Austin',
      state: 'TX',
      postal_code: '78701',
    });

    const fromOlderLoan = await seedBusiness('Older Loan Address Co');
    await seedRegistry(fromOlderLoan, {
      mailing_address_line1: '3 Main St',
      mailing_city: 'Denver',
      mailing_state: 'CO',
    });
    await seedPpp(fromOlderLoan, {
      city: 'Austin',
      state: 'TX',
      postal_code: '78701',
      approved_on: '2022-01-01',
    });
    await seedPpp(fromOlderLoan, {
      address_line1: '4 Loan St',
      city: 'Des Moines',
      state: 'IA',
      postal_code: '50309',
      approved_on: '2021-01-01',
    });

    const nowhere = await seedBusiness('No Address Co');
    await seedPpp(nowhere, { address_line1: '5 Loan St', state: 'TX' });

    const stateOf = async (business: string) => {
      const { dealId } = await seedFirmDeal(owner, {
        name: `Firm ${business}`,
        public_business_id: business,
      });
      return (await diligenceSubjects(owner.accountId, dealId)).state;
    };
    expect(await stateOf(fromRegistry)).toBe('CT');
    expect(await stateOf(fromOlderLoan)).toBe('IA');
    expect(await stateOf(nowhere)).toBeNull();
  });

  it("shows each name in its newest record's spelling when the team chooses newest record", async () => {
    const { data: business } = await newest.admin
      .from('public_business')
      .insert({ name: 'HARBOR PLUMBING', created_at: '2000-01-01T00:00:00Z' })
      .select('id')
      .single()
      .throwOnError();
    businessIds.push(business.id);
    const loans = [
      ['ppp_loan', 'Harbor plumbing', '2021-01-01'],
      ['ppp_loan', 'ACME CO', '2021-06-01'],
      ['sba_loan', 'Acme Co', '2022-01-01'],
      ['ppp_loan', 'Tie Co', '2020-01-01'],
      ['sba_loan', 'TIE CO', '2020-01-01'],
      ['sba_loan', 'Mid Co', '2024-05-01'],
    ];
    for (const [table, borrower_name, approved_on] of loans) {
      await newest.admin
        .from(table as 'ppp_loan')
        .insert({
          ...(table === 'ppp_loan'
            ? { loan_number: `ppp-${crypto.randomUUID()}` }
            : { source_key: `sba-${crypto.randomUUID()}`, program: 'sba_7a' }),
          business_id: business.id,
          borrower_name,
          approved_on,
        } as never)
        .throwOnError();
    }
    await newest.admin
      .from('form_5500_filing')
      .insert({
        ack_id: `ack-${crypto.randomUUID()}`,
        business_id: business.id,
        ein: String(Math.floor(100_000_000 + Math.random() * 899_999_999)),
        sponsor_name: 'acme co',
        plan_year_begin: '2021-12-31',
      })
      .throwOnError();
    const { dealId } = await seedFirmDeal(newest, {
      name: 'harbor plumbing',
      public_business_id: business.id,
      owner_names: ['ben okafor', 'Eve Marsh'],
    });
    const registry = {
      state: 'CT',
      business_id: business.id,
      source: 'bulk_file',
    };
    const { data: entity } = await newest.admin
      .from('state_registry_entity')
      .insert({
        ...registry,
        entity_number: `reg-${crypto.randomUUID()}`,
        name: 'Harbor Plumbing',
        fetched_at: '2030-01-01T00:00:00Z',
      })
      .select('id')
      .single()
      .throwOnError();
    await newest.admin
      .from('state_registry_entity')
      .insert({
        ...registry,
        entity_number: `reg-${crypto.randomUUID()}`,
        name: 'MID CO',
        fetched_at: '2024-05-01T00:00:00Z',
      })
      .throwOnError();
    await newest.admin
      .from('state_registry_officer')
      .insert({ entity_id: entity.id, name: 'DANA REYES', title: 'Member' })
      .throwOnError();
    await addDealContact(dealId, 'dana reyes', 'seller', 'principal', newest);
    await addDealContact(dealId, 'Ben Okafor', 'seller', 'principal', newest);

    const names = (
      await diligenceSubjects(newest.accountId, dealId)
    ).subjects.map(({ key, name, sources }) => ({ key, name, sources }));

    expect(names).toEqual([
      {
        key: 'business:harbor plumbing',
        name: 'Harbor Plumbing',
        sources: [
          'firm',
          'public_business',
          'ppp_loan',
          'state_registry_entity',
        ],
      },
      {
        key: 'business:acme co',
        name: 'Acme Co',
        sources: ['ppp_loan', 'sba_loan', 'form_5500_filing'],
      },
      {
        key: 'business:tie co',
        name: 'Tie Co',
        sources: ['ppp_loan', 'sba_loan'],
      },
      {
        key: 'business:mid co',
        name: 'Mid Co',
        sources: ['sba_loan', 'state_registry_entity'],
      },
      {
        key: 'person:ben okafor',
        name: 'Ben Okafor',
        sources: ['deal_contact', 'firm'],
      },
      {
        key: 'person:dana reyes',
        name: 'DANA REYES',
        sources: ['deal_contact', 'state_registry_officer'],
      },
      { key: 'person:eve marsh', name: 'Eve Marsh', sources: ['firm'] },
    ]);
  });

  it('never lets an undated record replace a dated spelling when the team chooses newest record', async () => {
    const { data: business } = await newest.admin
      .from('public_business')
      .insert({ name: 'Undated Holdings', created_at: '2000-01-01T00:00:00Z' })
      .select('id')
      .single()
      .throwOnError();
    businessIds.push(business.id);
    await newest.admin
      .from('ppp_loan')
      .insert({
        loan_number: `ppp-${crypto.randomUUID()}`,
        business_id: business.id,
        borrower_name: 'UNDATED CO',
      })
      .throwOnError();
    await newest.admin
      .from('sba_loan')
      .insert({
        source_key: `sba-${crypto.randomUUID()}`,
        program: 'sba_7a',
        business_id: business.id,
        borrower_name: 'Undated Co',
        approved_on: '2020-01-01',
      })
      .throwOnError();
    const { dealId } = await seedFirmDeal(newest, {
      name: 'Undated Firm',
      public_business_id: business.id,
    });

    const { subjects } = await diligenceSubjects(newest.accountId, dealId);

    expect(
      subjects.find(({ key }) => key === 'business:undated co'),
    ).toMatchObject({
      name: 'Undated Co',
      sources: ['ppp_loan', 'sba_loan'],
    });
  });

  it("refuses another team's deal without retrying", async () => {
    const { dealId } = await seedFirmDeal(stranger, {
      name: 'Elsewhere Electric',
    });

    await expect(
      diligenceSubjects(owner.accountId, dealId),
    ).rejects.toMatchObject({
      nonRetryable: true,
      message: 'That deal is not on this team',
    });
  });
});
