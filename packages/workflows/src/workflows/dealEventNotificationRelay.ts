import { continueAsNew, proxyActivities, sleep } from '@temporalio/workflow';

import { planDealEventNotifications } from '@odb/notifications/relay';

import type * as activities from '../activities';
import { DEAL_EVENT_NOTIFICATION_RELAY_WORKFLOW_ID } from '../ids';
import { RELAY_EVENT_ATTEMPTS, relayOrSetAside } from '../relayCursor/setAside';

const {
  fetchDealNotificationEvents,
  loadRelayCursor,
  saveRelayCursor,
  startRelayCursorAtLatest,
  recordRelayFailedEvent,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 minutes',
});

const { notifyDealEvent } = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 minutes',
  retry: { maximumAttempts: RELAY_EVENT_ATTEMPTS },
});

const BATCH_SIZE = 100;
const IDLE_POLL = '30 seconds';

export interface DealEventNotificationRelayInput {
  lastGlobalSeq?: number;
}

export async function dealEventNotificationRelay(
  input: DealEventNotificationRelayInput = {},
): Promise<void> {
  const cursor =
    input.lastGlobalSeq ??
    (await loadRelayCursor(DEAL_EVENT_NOTIFICATION_RELAY_WORKFLOW_ID)) ??
    (await startRelayCursorAtLatest(DEAL_EVENT_NOTIFICATION_RELAY_WORKFLOW_ID));

  const events = await fetchDealNotificationEvents({
    afterGlobalSeq: cursor,
    limit: BATCH_SIZE,
  });
  const plan = planDealEventNotifications(events, cursor);

  for (const step of plan.steps) {
    await relayOrSetAside(
      DEAL_EVENT_NOTIFICATION_RELAY_WORKFLOW_ID,
      step.event.globalSeq,
      () =>
        notifyDealEvent({
          globalSeq: step.event.globalSeq,
          workflowId: step.workflowId,
          dealId: step.event.dealId,
          accountId: step.event.accountId,
          actorRef: step.event.actorRef,
          eventType: step.event.eventType,
        }),
      recordRelayFailedEvent,
    );
  }

  if (events.length === 0) {
    await sleep(IDLE_POLL);
  } else {
    await saveRelayCursor({
      name: DEAL_EVENT_NOTIFICATION_RELAY_WORKFLOW_ID,
      lastGlobalSeq: plan.cursor,
    });
  }

  await continueAsNew<typeof dealEventNotificationRelay>({
    lastGlobalSeq: plan.cursor,
  });
}
