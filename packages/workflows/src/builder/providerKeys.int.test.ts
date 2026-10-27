import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { provisionAccount, type IntegrationAccount } from '../../test-support/integration-harness';
import { providerKey } from './providerKeys';

let owner: IntegrationAccount;

beforeAll(async () => {
  owner = await provisionAccount();
  await owner.user
    .rpc('save_provider_credential', {
      p_account_id: owner.accountId,
      p_kind: 'email_lookup',
      p_api_key: 'apify-team-key',
      p_actor_id: 'acme~site-contacts',
    })
    .throwOnError();
});

afterAll(async () => {
  await owner.admin.from('accounts').delete().eq('id', owner.accountId);
  await owner.cleanup();
});

describe('providerKey', () => {
  it("returns the team's email lookup key with its actor", async () => {
    expect(await providerKey(owner.accountId, 'email_lookup')).toEqual({
      apiKey: 'apify-team-key',
      actorId: 'acme/site-contacts',
      provider: 'apify',
      baseUrl: 'https://api.apify.com/v2',
    });
  });

  it('returns null for a kind the team has not connected', async () => {
    expect(await providerKey(owner.accountId, 'letters')).toBeNull();
  });

  it('returns the letters key once connected', async () => {
    await owner.user
      .rpc('save_provider_credential', {
        p_account_id: owner.accountId,
        p_kind: 'letters',
        p_api_key: 'lob-team-key',
      })
      .throwOnError();

    expect(await providerKey(owner.accountId, 'letters')).toEqual({
      apiKey: 'lob-team-key',
      provider: 'lob',
      baseUrl: 'https://api.lob.com/v1',
    });
  });

  it("returns the team's CourtListener token once connected", async () => {
    await owner.user
      .rpc('save_provider_credential', {
        p_account_id: owner.accountId,
        p_kind: 'courts',
        p_api_key: 'cl-team-token',
      })
      .throwOnError();

    expect(await providerKey(owner.accountId, 'courts')).toEqual({
      apiKey: 'cl-team-token',
      provider: 'courtlistener',
      baseUrl: 'https://www.courtlistener.com/api/rest/v4',
    });
  });
});
