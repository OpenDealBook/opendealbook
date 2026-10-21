import { continueAsNew, proxyActivities, sleep } from '@temporalio/workflow';

import { planRelayDispatch } from '@odb/comps/workflow';

import type * as activities from '../activities';
import { COMP_EVENT_RELAY_WORKFLOW_ID } from '../ids';
import { RELAY_EVENT_ATTEMPTS, relayOrSetAside } from '../relayCursor/setAside';

const { fetchDealEventsSince, loadRelayCursor, saveRelayCursor, recordRelayFailedEvent } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: '5 minutes',
  });

const { recordDealActivity, detectDuplicates, anonymizeClose } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: '5 minutes',
  retry: { maximumAttempts: RELAY_EVENT_ATTEMPTS },
});

const BATCH_SIZE = 100;
const IDLE_POLL = '30 seconds';

export interface CompEventRelayInput {
  lastGlobalSeq?: number;
}

export async function compEventRelay(input: CompEventRelayInput = {}): Promise<void> {
  const cursor =
    input.lastGlobalSeq ?? (await loadRelayCursor(COMP_EVENT_RELAY_WORKFLOW_ID)) ?? 0;

  const events = await fetchDealEventsSince({ afterGlobalSeq: cursor, limit: BATCH_SIZE });
  const plan = planRelayDispatch(events, cursor);

  for (const step of plan.steps) {
    await relayOrSetAside(
      COMP_EVENT_RELAY_WORKFLOW_ID,
      step.event.globalSeq,
      async () => {
        for (const consumer of step.consumers) {
          if (consumer === 'recordDealActivity') {
            await recordDealActivity({ dealId: step.event.dealId, dealSeq: step.event.dealSeq });
          } else if (consumer === 'detectDuplicates') {
            await detectDuplicates({ dealId: step.event.dealId });
          } else {
            await anonymizeClose({ dealId: step.event.dealId, dealSeq: step.event.dealSeq });
          }
        }
      },
      recordRelayFailedEvent,
    );
  }

  if (events.length === 0) {
    await sleep(IDLE_POLL);
  } else {
    await saveRelayCursor({ name: COMP_EVENT_RELAY_WORKFLOW_ID, lastGlobalSeq: plan.cursor });
  }

  await continueAsNew<typeof compEventRelay>({ lastGlobalSeq: plan.cursor });
}
