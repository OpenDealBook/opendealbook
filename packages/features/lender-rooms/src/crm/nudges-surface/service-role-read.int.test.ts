import { afterAll, beforeAll, expect, it } from 'vitest';

import {
  type Person,
  admin,
  removeEverythingSeeded,
} from '../../asks/integration-harness';
import { listLendersToNudge } from '../nudges/nudges';
import { seedQuietTeam } from './test-support';

let owner: Person;
let teamId: string;
let quietRoom: string;

beforeAll(async () => {
  ({ owner, teamId, roomId: quietRoom } = await seedQuietTeam());
});

afterAll(removeEverythingSeeded);

it('lets the daily job, running with the service role, see the rooms a deal manager sees', async () => {
  const managerView = await listLendersToNudge(owner.client, teamId);
  const jobView = await listLendersToNudge(admin, teamId);

  expect(managerView.flatMap((l) => l.deals.map((d) => d.roomId))).toEqual([
    quietRoom,
  ]);
  expect(jobView).toEqual(managerView);
});
