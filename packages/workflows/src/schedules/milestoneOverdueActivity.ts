import { notifyOverdueMilestones as notifyOverdueMilestonesAt } from '@odb/deal-timeline/overdue.ts';

import { heartbeating } from '../heartbeating';

export function notifyOverdueMilestones(at: string): Promise<void> {
  return heartbeating(() => notifyOverdueMilestonesAt(at));
}
