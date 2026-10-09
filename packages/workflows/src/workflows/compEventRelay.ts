import { continueAsNew, proxyActivities, sleep } from '@temporalio/workflow';

import { planRelayDispatch } from '@odb/comps/workflow';

import type * as activities from '../activities';

const { fetchDealEventsSince, recordDealActivity, detectDuplicates, anonymizeClose } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: '5 minutes',
  });

const BATCH_SIZE = 100;
const IDLE_POLL = '30 seconds';

export interface CompEventRelayInput {
  lastGlobalSeq?: number;
}

export async function compEventRelay(input: CompEventRelayInput = {}): Promise<void> {
  const cursor = input.lastGlobalSeq ?? 0;

  const events = await fetchDealEventsSince({ afterGlobalSeq: cursor, limit: BATCH_SIZE });
  const plan = planRelayDispatch(events, cursor);

  for (const step of plan.steps) {
    for (const consumer of step.consumers) {
      if (consumer === 'recordDealActivity') {
        await recordDealActivity({ dealId: step.event.dealId, dealSeq: step.event.dealSeq });
      } else if (consumer === 'detectDuplicates') {
        await detectDuplicates({ dealId: step.event.dealId });
      } else {
        await anonymizeClose({ dealId: step.event.dealId, dealSeq: step.event.dealSeq });
      }
    }
  }

  if (events.length === 0) {
    await sleep(IDLE_POLL);
  }

  await continueAsNew<typeof compEventRelay>({ lastGlobalSeq: plan.cursor });
}
