import type { Client, WorkflowHandle } from '@temporalio/client';

import {
  DOCUMENT_INGESTION_BACKFILL_WORKFLOW_TYPE,
  DOCUMENT_INGESTION_RELAY_WORKFLOW_ID,
  DOCUMENT_INGESTION_RELAY_WORKFLOW_TYPE,
  TASK_QUEUE,
} from '../ids';
import { ensureSchedule } from './ensureSchedule';

export function ensureDocumentIngestionBackfillSchedule(
  client: Client,
): Promise<void> {
  return ensureSchedule(client, {
    scheduleId: 'document-ingestion-backfill',
    spec: { calendars: [{ hour: 3 }] },
    action: {
      type: 'startWorkflow',
      workflowType: DOCUMENT_INGESTION_BACKFILL_WORKFLOW_TYPE,
      taskQueue: TASK_QUEUE,
      args: [{}],
    },
  });
}

export function triggerDocumentIngestionBackfill(
  client: Client,
  accountId: string,
): Promise<WorkflowHandle> {
  return client.workflow.start(DOCUMENT_INGESTION_BACKFILL_WORKFLOW_TYPE, {
    taskQueue: TASK_QUEUE,
    workflowId: `ingest-backfill-${accountId}`,
    workflowIdConflictPolicy: 'USE_EXISTING',
    args: [{ accountId }],
  });
}

export function ensureDocumentIngestionRelay(
  client: Client,
): Promise<WorkflowHandle> {
  return client.workflow.start(DOCUMENT_INGESTION_RELAY_WORKFLOW_TYPE, {
    taskQueue: TASK_QUEUE,
    workflowId: DOCUMENT_INGESTION_RELAY_WORKFLOW_ID,
    workflowIdConflictPolicy: 'USE_EXISTING',
    args: [{}],
  });
}
