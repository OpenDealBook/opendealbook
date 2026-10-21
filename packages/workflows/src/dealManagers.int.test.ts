import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  provisionAccount,
  type IntegrationAccount,
} from '../test-support/integration-harness';
import { dealManagerIds } from './dealManagers';

let owner: IntegrationAccount;
let manager: IntegrationAccount;
let teamId: string;

beforeAll(async () => {
  owner = await provisionAccount();
  manager = await provisionAccount();
  const { data: team } = await owner.admin
    .rpc('create_team_account', {
      account_name: 'Acme Capital',
      user_id: owner.userId,
      account_slug: `managers-${crypto.randomUUID().slice(0, 8)}`,
    })
    .throwOnError();
  teamId = team.id;
  await owner.admin
    .from('accounts_memberships')
    .insert({
      account_id: teamId,
      user_id: manager.userId,
      account_role: 'admin',
    })
    .throwOnError();
  await owner.admin
    .from('accounts_memberships')
    .update({ account_role: 'member' })
    .eq('account_id', teamId)
    .eq('user_id', owner.userId)
    .throwOnError();
});

afterAll(async () => {
  await owner.admin.from('accounts').delete().eq('id', teamId).throwOnError();
  await manager.cleanup();
  await owner.cleanup();
});

describe('dealManagerIds (integration)', () => {
  it('leaves out a primary owner whose role does not manage deals', async () => {
    expect(await dealManagerIds(teamId)).toEqual([manager.userId]);
  });
});
