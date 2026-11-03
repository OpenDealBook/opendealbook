import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  type IntegrationAccount,
  provisionAccount,
  seedDeal,
} from '../../test-support/integration-harness';
import { accountAiScope, dealAiScope, teamAiScope } from './teamAiScope';

let team: IntegrationAccount;
let stranger: IntegrationAccount;
let dealId: string;

beforeAll(async () => {
  [team, stranger] = await Promise.all([
    provisionAccount(),
    provisionAccount(),
  ]);
  dealId = await seedDeal(team.admin, team.accountId, team.userId, {
    description: 'Acme Plumbing',
  });
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
    expect(await dealAiScope(team.user as never, dealId, 'deals.work')).toEqual(
      {
        accountId: team.accountId,
        dealId,
      },
    );
  });

  it("finds no deal for another team's member", async () => {
    expect(
      await dealAiScope(stranger.user as never, dealId, 'deals.work'),
    ).toBe('not_found');
  });
});

describe('accountAiScope', () => {
  it('scopes AI to a team the member may create deals in', async () => {
    expect(
      await accountAiScope(team.user as never, team.userId, team.accountId),
    ).toEqual({
      accountId: team.accountId,
    });
  });

  it("refuses another team's account", async () => {
    expect(
      await accountAiScope(
        stranger.user as never,
        stranger.userId,
        team.accountId,
      ),
    ).toBeNull();
  });
});

describe('teamAiScope', () => {
  const WORK_ONLY_ROLE = 'external_counsel';
  let worker: IntegrationAccount;
  let viewer: IntegrationAccount;

  async function revokeTestGrant() {
    await team.admin
      .from('role_permissions')
      .delete()
      .eq('role', WORK_ONLY_ROLE)
      .eq('permission', 'deals.work')
      .throwOnError();
  }

  beforeAll(async () => {
    [worker, viewer] = await Promise.all([
      provisionAccount(),
      provisionAccount(),
    ]);
    await revokeTestGrant();
    await team.admin
      .from('role_permissions')
      .insert({ role: WORK_ONLY_ROLE, permission: 'deals.work' })
      .throwOnError();
    await team.admin
      .from('accounts_memberships')
      .insert([
        {
          user_id: worker.userId,
          account_id: team.accountId,
          account_role: WORK_ONLY_ROLE,
        },
        {
          user_id: viewer.userId,
          account_id: team.accountId,
          account_role: 'viewer',
        },
      ])
      .throwOnError();
  });

  afterAll(async () => {
    await revokeTestGrant();
    await team.admin
      .from('accounts_memberships')
      .delete()
      .eq('account_id', team.accountId)
      .in('user_id', [worker.userId, viewer.userId])
      .throwOnError();
    await Promise.all([worker.cleanup(), viewer.cleanup()]);
  });

  it('scopes AI to the team for a member who may work deals but not create them', async () => {
    expect(
      await accountAiScope(worker.user as never, worker.userId, team.accountId),
    ).toBeNull();
    expect(
      await teamAiScope(worker.user as never, worker.userId, team.accountId),
    ).toEqual({ accountId: team.accountId });
  });

  it('refuses a member who may not work deals', async () => {
    expect(
      await teamAiScope(viewer.user as never, viewer.userId, team.accountId),
    ).toBeNull();
  });
});
