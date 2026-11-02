import { continueAsNew, proxyActivities, sleep } from '@temporalio/workflow';

import type * as activities from '../activities';
import { DOCUMENT_INGESTION_RELAY_WORKFLOW_ID } from '../ids';
import { RELAY_EVENT_ATTEMPTS, relayOrSetAside } from '../relayCursor/setAside';

const {
  fetchAddedDocuments,
  loadRelayCursor,
  saveRelayCursor,
  startRelayCursorAtLatest,
  recordRelayFailedEvent,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 minutes',
});

const { startDocumentIngestion } = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 minutes',
  retry: { maximumAttempts: RELAY_EVENT_ATTEMPTS },
});

const BATCH_SIZE = 100;
const IDLE_POLL = '30 seconds';

export interface DocumentIngestionRelayInput {
  lastGlobalSeq?: number;
}

export async function documentIngestionRelay(
  input: DocumentIngestionRelayInput = {},
): Promise<void> {
  const cursor =
    input.lastGlobalSeq ??
    (await loadRelayCursor(DOCUMENT_INGESTION_RELAY_WORKFLOW_ID)) ??
    (await startRelayCursorAtLatest(DOCUMENT_INGESTION_RELAY_WORKFLOW_ID));

  const added = await fetchAddedDocuments({
    afterGlobalSeq: cursor,
    limit: BATCH_SIZE,
  });

  for (const event of added) {
    await relayOrSetAside(
      DOCUMENT_INGESTION_RELAY_WORKFLOW_ID,
      event.globalSeq,
      () => startDocumentIngestion({ drDocumentId: event.drDocumentId }),
      recordRelayFailedEvent,
    );
  }

  const next = added.at(-1)?.globalSeq ?? cursor;
  if (added.length === 0) {
    await sleep(IDLE_POLL);
  } else {
    await saveRelayCursor({
      name: DOCUMENT_INGESTION_RELAY_WORKFLOW_ID,
      lastGlobalSeq: next,
    });
  }

  await continueAsNew<typeof documentIngestionRelay>({ lastGlobalSeq: next });
}
