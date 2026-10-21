import { continueAsNew, proxyActivities, sleep } from '@temporalio/workflow';

import type * as activities from '../activities';
import { RELAY_EVENT_ATTEMPTS, relayOrSetAside } from '../relayCursor/setAside';
import type { EventLogName } from './client';
import type { RelayCursor } from './eventRelayActivities';
import { EVENT_LOGS, eventRelayCursorName } from './eventRelayStart';

const {
  fetchTriggerEvents,
  loadEventRelayCursor,
  saveEventRelayCursor,
  startEventRelayCursorAtLatest,
  recordRelayFailedEvent,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 minutes',
});

const { startWorkflowRunsForEvent } = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 minutes',
  retry: { maximumAttempts: RELAY_EVENT_ATTEMPTS },
});

const BATCH_SIZE = 100;
const IDLE_POLL = '30 seconds';

export type RelayCursors = Partial<Record<EventLogName, RelayCursor>>;

export async function workflowEventRelay(input: RelayCursors = {}): Promise<void> {
  const cursors: RelayCursors = {};
  let relayed = 0;

  for (const log of EVENT_LOGS) {
    const name = eventRelayCursorName(log);
    const cursor =
      input[log] ??
      (await loadEventRelayCursor(name)) ??
      (await startEventRelayCursorAtLatest({ name }));
    const events = await fetchTriggerEvents({ log, after: cursor, limit: BATCH_SIZE });

    for (const event of events) {
      await relayOrSetAside(
        name,
        event.globalSeq,
        () => startWorkflowRunsForEvent(event),
        recordRelayFailedEvent,
      );
    }

    const last = events.at(-1);
    cursors[log] = last ? { xid: last.xid, seq: last.globalSeq } : cursor;
    if (last) {
      await saveEventRelayCursor({ name, cursor: cursors[log] });
    }
    relayed += events.length;
  }

  if (relayed === 0) {
    await sleep(IDLE_POLL);
  }

  await continueAsNew<typeof workflowEventRelay>(cursors);
}
