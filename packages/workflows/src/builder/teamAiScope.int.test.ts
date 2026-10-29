import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  type IntegrationAccount,
  provisionAccount,
  seedDeal,
} from '../../test-support/integration-harness';
import { accountAiScope, dealAiScope } from './teamAiScope';

let team: IntegrationAccount;
let stranger: IntegrationAccount;
let dealId: string;

beforeAll(async () => {
  [team, stranger] = await Promise.all([provisionAccount(), provisionAccount()]);
  dealId = await seedDeal(team.admin, team.accountId, team.userId, { description: 'Acme Plumbing' });
});

afterAll(async () => {
  await Promise.all([
    team.admin.from('accounts').delete().eq('id', team.accountId),
    stranger.admin.from('accounts').delete().eq('id', stranger.accountId),
  ]);
  await Promise.all([team.cleanup(), stranger.cleanup()]);
});

describe('dealAiScope', () => {
  it("scopes AI to the deal's team for a member who may work the deal", async () => {
    expect(await dealAiScope(team.user as never, dealId, 'deals.work')).toEqual({
      accountId: team.accountId,
      dealId,
    });
  });

  it("finds no deal for another team's member", async () => {
    expect(await dealAiScope(stranger.user as never, dealId, 'deals.work')).toBe('not_found');
  });
});

describe('accountAiScope', () => {
  it('scopes AI to a team the member may create deals in', async () => {
    expect(await accountAiScope(team.user as never, team.userId, team.accountId)).toEqual({
      accountId: team.accountId,
    });
  });

  it("refuses another team's account", async () => {
    expect(
      await accountAiScope(stranger.user as never, stranger.userId, team.accountId),
    ).toBeNull();
  });
});
