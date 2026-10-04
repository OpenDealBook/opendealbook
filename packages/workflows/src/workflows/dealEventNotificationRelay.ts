import { continueAsNew, proxyActivities, sleep } from '@temporalio/workflow';

import { planDealEventNotifications } from '@odb/notifications/relay';

import type * as activities from '../activities';

const { fetchDealNotificationEvents, notifyDealEvent } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: '5 minutes',
  });

const BATCH_SIZE = 100;
const IDLE_POLL = '30 seconds';

export interface DealEventNotificationRelayInput {
  lastGlobalSeq?: number;
}

export async function dealEventNotificationRelay(
  input: DealEventNotificationRelayInput = {},
): Promise<void> {
  const cursor = input.lastGlobalSeq ?? 0;

  const events = await fetchDealNotificationEvents({
    afterGlobalSeq: cursor,
    limit: BATCH_SIZE,
  });
  const plan = planDealEventNotifications(events, cursor);

  for (const step of plan.steps) {
    await notifyDealEvent({
      workflowId: step.workflowId,
      dealId: step.event.dealId,
      accountId: step.event.accountId,
      actorRef: step.event.actorRef,
      eventType: step.event.eventType,
    });
  }

  if (events.length === 0) {
    await sleep(IDLE_POLL);
  }

  await continueAsNew<typeof dealEventNotificationRelay>({
    lastGlobalSeq: plan.cursor,
  });
}
