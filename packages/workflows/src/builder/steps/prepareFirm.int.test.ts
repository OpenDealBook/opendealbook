import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { fakeAiProvider, openAiReply } from '../../../test-support/fake-ai-provider';
import { provisionAccount, type IntegrationAccount } from '../../../test-support/integration-harness';
import { prepareFirm } from './prepareFirm';

const network = vi.hoisted(() => ({ trustedFakeUrl: '' }));

vi.mock('../publicUrl', () => ({
  publicAddressOf: async (url: string) =>
    url.startsWith(network.trustedFakeUrl) ? { address: '127.0.0.1', family: 4 } : null,
}));

let owner: IntegrationAccount;
let provider: Awaited<ReturnType<typeof fakeAiProvider>>;
const businessIds: string[] = [];

async function seedFirm(
  name: string,
  records: {
    registry?: Record<string, string>;
    ppp?: Record<string, string> | Record<string, string>[];
    form5500?: Record<string, string>;
  },
): Promise<string> {
  const { data: business } = await owner.admin
    .from('public_business')
    .insert({ name })
    .select('id')
    .single()
    .throwOnError();
  businessIds.push(business.id);
  if (records.registry) {
    const { data: entity } = await owner.admin
      .from('state_registry_entity')
      .insert({
        state: 'MP',
        entity_number: `reg-${crypto.randomUUID()}`,
        business_id: business.id,
        name,
        formation_date: '2009-04-01',
        source: 'bulk_file',
        fetched_at: new Date().toISOString(),
        ...records.registry,
      })
      .select('id')
      .single()
      .throwOnError();
    await owner.admin
      .from('state_registry_officer')
      .insert({ entity_id: entity.id, name: 'Ana Delgado-Ruiz', title: 'Managing Member' })
      .throwOnError();
  }
  for (const ppp of [records.ppp ?? []].flat()) {
    await owner.admin
      .from('ppp_loan')
      .insert({
        loan_number: `ppp-${crypto.randomUUID()}`,
        business_id: business.id,
        borrower_name: name,
        jobs_reported: 18,
        ...ppp,
      })
      .throwOnError();
  }
  if (records.form5500) {
    await owner.admin
      .from('form_5500_filing')
      .insert({
        ack_id: `ack-${crypto.randomUUID()}`,
        business_id: business.id,
        ein: String(Math.floor(100_000_000 + Math.random() * 899_999_999)),
        sponsor_name: name,
        ...records.form5500,
      })
      .throwOnError();
  }
  const { data: firm } = await owner.admin
    .from('firm')
    .insert({
      account_id: owner.accountId,
      name,
      industry: 'Plumbing',
      public_business_id: business.id,
      owner_names: ['Ana Delgado-Ruiz'],
    })
    .select('id')
    .single()
    .throwOnError();
  return firm.id;
}

function prepare(idempotencyKey: string, firmId: string) {
  return prepareFirm.execute({
    context: { accountId: owner.accountId, runId: 'run-1', idempotencyKey },
    config: { firmId },
    input: {},
  });
}

async function firmRow(firmId: string) {
  const { data } = await owner.admin
    .from('firm')
    .select(
      'owner_mailing_address_line1, owner_mailing_city, owner_mailing_state, owner_mailing_postal_code, profile, profile_model, profile_generated_at',
    )
    .eq('id', firmId)
    .single()
    .throwOnError();
  return data;
}

beforeAll(async () => {
  owner = await provisionAccount();
  provider = await fakeAiProvider(openAiReply('Rowan Fixture Plumbing is a family plumbing firm.'));
  await owner.admin
    .from('outreach_setting')
    .insert({ account_id: owner.accountId, daily_cap: 10, ai_monthly_cap: 100 })
    .throwOnError();
  await owner.user
    .rpc('save_llm_endpoint', {
      p_account_id: owner.accountId,
      p_provider: 'openai_compatible',
      p_model: 'profile-model',
      p_base_url: 'https://provider.example.com/v1',
      p_api_key: 'sk-team',
    })
    .throwOnError();
  network.trustedFakeUrl = provider.baseUrl;
  await owner.admin
    .from('llm_endpoint')
    .update({ base_url: provider.baseUrl })
    .eq('account_id', owner.accountId)
    .throwOnError();
});

afterAll(async () => {
  provider.close();
  await owner.admin.from('accounts').delete().eq('id', owner.accountId);
  await owner.admin.from('ppp_loan').delete().in('business_id', businessIds);
  await owner.admin.from('state_registry_entity').delete().in('business_id', businessIds);
  await owner.admin.from('public_business').delete().in('id', businessIds);
  await owner.cleanup();
});

describe('prepare_firm step (integration)', () => {
  it("writes a clean owner mailing address from the registry and a profile by the team's AI with time and model", async () => {
    const firmId = await seedFirm('Rowan Fixture Plumbing', {
      registry: {
        mailing_address_line1: '  12   beach rd. ',
        mailing_city: ' saipan',
        mailing_state: 'mp ',
        mailing_postal_code: '969501234',
      },
      ppp: { address_line1: '99 Other St', city: 'Garapan', state: 'MP', postal_code: '96950' },
    });

    const output = await prepare('run-1:prepare:0', firmId);

    const mailingAddress = { line1: '12 BEACH RD', city: 'SAIPAN', state: 'MP', postalCode: '96950-1234' };
    expect(output).toEqual({ mailingAddress, profileId: firmId });
    const firm = await firmRow(firmId);
    expect(firm).toMatchObject({
      owner_mailing_address_line1: '12 BEACH RD',
      owner_mailing_city: 'SAIPAN',
      owner_mailing_state: 'MP',
      owner_mailing_postal_code: '96950-1234',
      profile: 'Rowan Fixture Plumbing is a family plumbing firm.',
      profile_model: 'profile-model',
    });
    expect(Date.now() - Date.parse(firm.profile_generated_at!)).toBeLessThan(60_000);
    const prompt = provider.received[0]!.body.messages[0]!.content;
    expect(prompt).toContain('Rowan Fixture Plumbing');
    expect(prompt).toContain('Managing Member');
    expect(prompt).not.toContain('Ana Delgado-Ruiz');
    const { count } = await owner.admin
      .from('ai_call_log')
      .select('id', { count: 'exact', head: true })
      .eq('firm_id', firmId);
    expect(count).toBe(1);
  });

  it('converges to the same prepared firm when the step is retried', async () => {
    const firmId = await seedFirm('Tinian Electric', {
      registry: { mailing_address_line1: '1 Broadway', mailing_city: 'San Jose', mailing_state: 'MP', mailing_postal_code: '96952' },
    });
    const first = await prepare('run-1:prepare:1', firmId);
    const prepared = await firmRow(firmId);

    expect(await prepare('run-1:prepare:1', firmId)).toEqual(first);
    expect(await firmRow(firmId)).toMatchObject({ ...prepared, profile_generated_at: expect.any(String) });
  });

  it('falls back to the source record address when the registry has none', async () => {
    const firmId = await seedFirm('Rota Roofing', {
      ppp: { address_line1: '7 harbor  way', city: 'rota', state: 'mp', postal_code: '96951' },
    });

    expect(await prepare('run-1:prepare:2', firmId)).toMatchObject({
      mailingAddress: { line1: '7 HARBOR WAY', city: 'ROTA', state: 'MP', postalCode: '96951' },
    });
  });

  it('prepares the profile with no mailing address when no record has one', async () => {
    const firmId = await seedFirm('Addressless Glass', { ppp: {} });

    expect(await prepare('run-1:prepare:3', firmId)).toMatchObject({ mailingAddress: null });
    expect(await firmRow(firmId)).toMatchObject({ owner_mailing_address_line1: null, profile_model: 'profile-model' });
  });

  it('prepares a firm that is not linked to a public business from the firm alone', async () => {
    const { data: firm } = await owner.admin
      .from('firm')
      .insert({ account_id: owner.accountId, name: 'Referral Landscaping', industry: 'Landscaping' })
      .select('id')
      .single()
      .throwOnError();
    provider.received.length = 0;

    expect(await prepare('run-1:prepare:4', firm.id)).toEqual({ mailingAddress: null, profileId: firm.id });
    expect(provider.received[0]!.body.messages[0]!.content).toContain('Referral Landscaping');
  });

  it('keeps an owner mailing address the firm already has', async () => {
    const firmId = await seedFirm('Garapan Tile', {
      registry: { mailing_address_line1: '5 Registry Ave', mailing_city: 'Saipan', mailing_state: 'MP', mailing_postal_code: '96950' },
    });
    const existing = {
      owner_mailing_address_line1: 'PO Box 77',
      owner_mailing_city: 'Garapan',
      owner_mailing_state: null,
      owner_mailing_postal_code: null,
    };
    await owner.admin.from('firm').update(existing).eq('id', firmId).throwOnError();

    expect(await prepare('run-1:prepare:5', firmId)).toEqual({
      mailingAddress: { line1: 'PO Box 77', city: 'Garapan', state: null, postalCode: null },
      profileId: firmId,
    });
    expect(await firmRow(firmId)).toMatchObject({ ...existing, profile_model: 'profile-model' });
  });

  it('refuses a firm id that is not a firm id', async () => {
    await expect(prepare('run-1:prepare:6', 'not-a-uuid')).rejects.toMatchObject({
      nonRetryable: true,
      message: 'That firm is not on this team',
    });
  });

  it('pads a four-digit ZIP to five digits', async () => {
    const firmId = await seedFirm('Mystic Bakery', {
      registry: { mailing_address_line1: '9 Sample St', mailing_city: 'Mystic', mailing_state: 'CT', mailing_postal_code: '6355' },
    });

    expect(await prepare('run-1:prepare:zip4', firmId)).toMatchObject({
      mailingAddress: { line1: '9 SAMPLE ST', city: 'MYSTIC', state: 'CT', postalCode: '06355' },
    });
  });

  it('skips a record whose ZIP is empty', async () => {
    const firmId = await seedFirm('Zipless Paving', {
      ppp: { address_line1: '3 Quarry Rd', city: 'Rota', state: 'MP', postal_code: '' },
    });

    expect(await prepare('run-1:prepare:zip-empty', firmId)).toMatchObject({ mailingAddress: null });
    expect(await firmRow(firmId)).toMatchObject({ owner_mailing_address_line1: null, owner_mailing_postal_code: null });
  });

  it("tries a source's older records, newest first, when its newest has no street line", async () => {
    const firmId = await seedFirm('Streetless Bakery', {
      ppp: [
        { city: 'Saipan', state: 'MP', postal_code: '96950', approved_on: '2022-01-01' },
        { address_line1: '2 Middle Rd', city: 'Saipan', state: 'MP', postal_code: '96950', approved_on: '2021-01-01' },
        { address_line1: '1 Oldest Rd', city: 'Saipan', state: 'MP', postal_code: '96950', approved_on: '2020-01-01' },
      ],
    });

    expect(await prepare('run-1:prepare:older', firmId)).toMatchObject({ mailingAddress: { line1: '2 MIDDLE RD' } });
  });

  it('skips source records missing a city or ZIP and tries the next source', async () => {
    const firmId = await seedFirm('Patchy Records Plumbing', {
      ppp: [
        { address_line1: '1 No City Rd', state: 'MP', postal_code: '96950', approved_on: '2022-01-01' },
        { address_line1: '2 No Zip Rd', city: 'Saipan', state: 'MP', approved_on: '2021-01-01' },
      ],
      form5500: { address_line1: '3 Plan Ave', city: 'Saipan', state: 'MP', postal_code: '96950' },
    });

    expect(await prepare('run-1:prepare:next-source', firmId)).toMatchObject({ mailingAddress: { line1: '3 PLAN AVE' } });
  });

  it('uses the newest record when a source has several', async () => {
    const firmId = await seedFirm('Moving Movers', {
      ppp: [
        { address_line1: '1 Old Rd', city: 'Saipan', state: 'MP', postal_code: '96950', approved_on: '2020-05-01' },
        { address_line1: '2 New Rd', city: 'Saipan', state: 'MP', postal_code: '96950', approved_on: '2021-02-01' },
        { address_line1: '0 Older Rd', city: 'Saipan', state: 'MP', postal_code: '96950', approved_on: '2019-01-01' },
      ],
    });

    expect(await prepare('run-1:prepare:newest', firmId)).toMatchObject({
      mailingAddress: { line1: '2 NEW RD' },
    });
  });

  it('falls through to the next source when the registry address lacks a city or ZIP', async () => {
    const noCity = await seedFirm('Cityless Glass', {
      registry: { mailing_address_line1: '4 Registry Ln', mailing_state: 'MP', mailing_postal_code: '96950' },
      ppp: { address_line1: '8 Loan St', city: 'Saipan', state: 'MP', postal_code: '96950' },
    });
    const noZip = await seedFirm('Zipless Glass', {
      registry: { mailing_address_line1: '5 Registry Ln', mailing_city: 'Saipan', mailing_state: 'MP' },
      ppp: { address_line1: '9 Loan St', city: 'Saipan', state: 'MP', postal_code: '96950' },
    });

    expect(await prepare('run-1:prepare:no-city', noCity)).toMatchObject({ mailingAddress: { line1: '8 LOAN ST' } });
    expect(await prepare('run-1:prepare:no-zip', noZip)).toMatchObject({ mailingAddress: { line1: '9 LOAN ST' } });
  });

  it.each([
    ['501', '00501'],
    ['1234567', '00123-4567'],
  ])('pads ZIP %s to %s', async (zip, cleaned) => {
    const firmId = await seedFirm(`Zip ${zip} Supply`, {
      ppp: { address_line1: '6 Pad St', city: 'Saipan', state: 'MP', postal_code: zip },
    });

    expect(await prepare(`run-1:prepare:zip-${zip}`, firmId)).toMatchObject({
      mailingAddress: { postalCode: cleaned },
    });
  });

  it('skips a record whose ZIP has too few or too many digits', async () => {
    const firmId = await seedFirm('Odd Zip Supply', {
      ppp: [
        { address_line1: '7 Short Zip St', city: 'Saipan', state: 'MP', postal_code: '12', approved_on: '2022-01-01' },
        { address_line1: '8 Long Zip St', city: 'Saipan', state: 'MP', postal_code: '1234567890', approved_on: '2021-01-01' },
        { address_line1: '9 Good Zip St', city: 'Saipan', state: 'MP', postal_code: '96950', approved_on: '2020-01-01' },
      ],
    });

    expect(await prepare('run-1:prepare:odd-zip', firmId)).toMatchObject({ mailingAddress: { line1: '9 GOOD ZIP ST' } });
  });
});
