import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  admin,
  provisionPerson,
  type Person,
} from '../asks/integration-harness';
import { dealManagerIds } from './deal-manager-ids';

let owner: Person;
let manager: Person;
let teamId: string;

beforeAll(async () => {
  owner = await provisionPerson();
  manager = await provisionPerson();
  const { data: team } = await admin
    .rpc('create_team_account', {
      account_name: 'Acme Capital',
      user_id: owner.userId,
      account_slug: `managers-${crypto.randomUUID().slice(0, 8)}`,
    })
    .throwOnError();
  teamId = team.id;
  await admin
    .from('accounts_memberships')
    .insert({
      account_id: teamId,
      user_id: manager.userId,
      account_role: 'admin',
    })
    .throwOnError();
  await admin
    .from('accounts_memberships')
    .update({ account_role: 'member' })
    .eq('account_id', teamId)
    .eq('user_id', owner.userId)
    .throwOnError();
});

afterAll(async () => {
  await admin.from('accounts').delete().eq('id', teamId).throwOnError();
  await admin.auth.admin.deleteUser(manager.userId);
  await admin.auth.admin.deleteUser(owner.userId);
});

describe('dealManagerIds (integration)', () => {
  it('leaves out a primary owner whose role does not manage deals', async () => {
    expect(await dealManagerIds(admin, teamId)).toEqual([manager.userId]);
  });
});
