import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  provisionAccount,
  type IntegrationAccount,
} from '../../../test-support/integration-harness';
import { registryLookup } from './registryLookup';

let owner: IntegrationAccount;
let outsider: IntegrationAccount;
let businessId: string;
let principalBusinessId: string;
let firmId: string;
let principalFirmId: string;
let unregisteredFirmId: string;
let outsiderFirmId: string;

function lookUp(config: Record<string, unknown>) {
  return registryLookup.execute({
    context: {
      accountId: owner.accountId,
      runId: 'run-1',
      idempotencyKey: 'run-1:registry:0',
    },
    config,
    input: {},
  });
}

beforeAll(async () => {
  [owner, outsider] = await Promise.all([
    provisionAccount(),
    provisionAccount(),
  ]);
  const { data: business } = await owner.admin
    .from('public_business')
    .insert({ name: 'Rowan Fixture Plumbing LLC' })
    .select('id')
    .single()
    .throwOnError();
  businessId = business.id;
  const { data: principalBusiness } = await owner.admin
    .from('public_business')
    .insert({ name: 'Peak Fixture Roofing LLC' })
    .select('id')
    .single()
    .throwOnError();
  principalBusinessId = principalBusiness.id;
  await owner.admin
    .from('state_registry_entity')
    .insert({
      state: 'CO',
      entity_number: `reg-${crypto.randomUUID()}`,
      business_id: principalBusinessId,
      name: 'Peak Fixture Roofing LLC',
      principal_address_line1: '12 Sample Ave',
      principal_city: 'Denver',
      principal_state: 'CO',
      principal_postal_code: '80202',
      source: 'bulk_file',
      fetched_at: '2026-09-30T00:00:00Z',
    })
    .throwOnError();
  const { data: entity } = await owner.admin
    .from('state_registry_entity')
    .insert({
      state: 'MP',
      entity_number: `reg-${crypto.randomUUID()}`,
      business_id: businessId,
      name: 'Rowan Fixture Plumbing LLC',
      status: 'Active - Good Standing',
      formation_date: '2009-04-01',
      registered_agent: 'Island Agents Inc',
      mailing_address_line1: '12 Beach Rd',
      mailing_city: 'Saipan',
      mailing_state: 'MP',
      mailing_postal_code: '96950',
      source: 'bulk_file',
      fetched_at: '2026-09-30T00:00:00Z',
    })
    .select('id, entity_number')
    .single()
    .throwOnError();
  await owner.admin
    .from('state_registry_officer')
    .insert([
      {
        entity_id: entity.id,
        name: 'Ana Delgado-Ruiz',
        title: 'Managing Member',
      },
      { entity_id: entity.id, name: 'Rowan Fictional', title: null },
    ])
    .throwOnError();

  const firms = await owner.admin
    .from('firm')
    .insert([
      {
        account_id: owner.accountId,
        name: 'Rowan Fixture Plumbing',
        public_business_id: businessId,
      },
      { account_id: owner.accountId, name: 'Unregistered Painting' },
      {
        account_id: owner.accountId,
        name: 'Peak Fixture Roofing',
        public_business_id: principalBusinessId,
      },
    ])
    .select('id, name')
    .throwOnError();
  firmId = firms.data.find(
    (firm: { name: string }) => firm.name === 'Rowan Fixture Plumbing',
  )!.id;
  unregisteredFirmId = firms.data.find(
    (firm: { name: string }) => firm.name === 'Unregistered Painting',
  )!.id;
  principalFirmId = firms.data.find(
    (firm: { name: string }) => firm.name === 'Peak Fixture Roofing',
  )!.id;
  const { data: outsiderFirm } = await outsider.admin
    .from('firm')
    .insert({
      account_id: outsider.accountId,
      name: 'Rowan Fixture Plumbing',
      public_business_id: businessId,
    })
    .select('id')
    .single()
    .throwOnError();
  outsiderFirmId = outsiderFirm.id;
});

afterAll(async () => {
  await owner.admin
    .from('accounts')
    .delete()
    .in('id', [owner.accountId, outsider.accountId]);
  await owner.admin
    .from('state_registry_entity')
    .delete()
    .in('business_id', [businessId, principalBusinessId]);
  await owner.admin
    .from('public_business')
    .delete()
    .in('id', [businessId, principalBusinessId]);
  await Promise.all([owner.cleanup(), outsider.cleanup()]);
});

describe('registry_lookup step (integration)', () => {
  it("returns the global registry record linked to the firm's business", async () => {
    expect(await lookUp({ firmId })).toEqual({
      found: true,
      entity: {
        state: 'MP',
        entityNumber: expect.stringMatching(/^reg-/),
        name: 'Rowan Fixture Plumbing LLC',
        registeredAgent: 'Island Agents Inc',
        mailingAddress: {
          line1: '12 Beach Rd',
          city: 'Saipan',
          state: 'MP',
          postalCode: '96950',
        },
      },
      officers: expect.arrayContaining([
        { name: 'Ana Delgado-Ruiz', title: 'Managing Member' },
        { name: 'Rowan Fictional', title: null },
      ]),
      formationDate: '2009-04-01',
      status: 'Active - Good Standing',
      asOf: '2026-09-30T00:00:00+00:00',
    });
  });

  it('returns the principal address of a registry record that has only a principal address', async () => {
    expect(await lookUp({ firmId: principalFirmId })).toMatchObject({
      found: true,
      entity: {
        mailingAddress: {
          line1: '12 Sample Ave',
          city: 'Denver',
          state: 'CO',
          postalCode: '80202',
        },
      },
    });
  });

  it('answers not found, without failing, when no registry record is linked', async () => {
    expect(await lookUp({ firmId: unregisteredFirmId })).toEqual({
      found: false,
    });
  });

  it('refuses a firm id that is not a firm id', async () => {
    await expect(lookUp({ firmId: 'not-a-uuid' })).rejects.toMatchObject({
      nonRetryable: true,
      message: 'That firm is not on this team',
    });
  });

  it('refuses a firm on another team', async () => {
    await expect(lookUp({ firmId: outsiderFirmId })).rejects.toMatchObject({
      nonRetryable: true,
      message: 'That firm is not on this team',
    });
  });
});
