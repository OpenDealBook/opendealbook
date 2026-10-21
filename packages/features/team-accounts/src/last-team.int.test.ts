import { afterAll, beforeAll, expect, it } from 'vitest';

import {
  admin,
  cleanUp,
  type Person,
  provisionPerson,
  provisionTeam,
} from '@odb/seller-rooms/test-support/world.ts';

import { rememberLastTeam } from './last-team';

let person: Person;
let alpha: string;
let bravo: string;

async function personalAccount() {
  const { data } = await admin
    .from('accounts')
    .select('last_team_account_id, updated_at')
    .eq('primary_owner_user_id', person.userId)
    .eq('is_personal_account', true)
    .single()
    .throwOnError();

  return data;
}

beforeAll(async () => {
  person = await provisionPerson();
  alpha = await provisionTeam(person, 'Alpha');
  bravo = await provisionTeam(person, 'Bravo');
});

afterAll(async () => {
  await cleanUp([alpha, bravo]);
});

it('remembers the team visited, and a repeat visit writes nothing', async () => {
  await rememberLastTeam(person.client, person.userId, alpha);
  const first = await personalAccount();

  await rememberLastTeam(person.client, person.userId, alpha);
  const repeat = await personalAccount();

  await rememberLastTeam(person.client, person.userId, bravo);
  const switched = await personalAccount();

  expect(first.last_team_account_id).toBe(alpha);
  expect(repeat.updated_at).toBe(first.updated_at);
  expect(switched.last_team_account_id).toBe(bravo);
});
