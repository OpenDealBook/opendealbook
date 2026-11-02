import type { Client } from '@temporalio/client';
import { describe, expect, it } from 'vitest';

import * as workflows from '../workflows';
import {
  ensureDocumentIngestionBackfillSchedule,
  ensureDocumentIngestionRelay,
  triggerDocumentIngestionBackfill,
} from './documentIngestion';
import { fakeScheduleClient } from './fakeScheduleClient';

function fakeStartClient() {
  const starts: { type: string; options: Record<string, unknown> }[] = [];
  const client = {
    workflow: {
      start: async (type: string, options: Record<string, unknown>) => {
        starts.push({ type, options });
      },
    },
  } as unknown as Client;
  return { client, starts };
}

describe('document ingestion starters', () => {
  it('backfills missed documents of every team with AI connected each night at 03:00 UTC', async () => {
    const { client, schedules } = fakeScheduleClient();

    await ensureDocumentIngestionBackfillSchedule(client);

    expect([...schedules.values()]).toMatchObject([
      {
        spec: { calendars: [{ hour: 3 }] },
        action: {
          type: 'startWorkflow',
          workflowType: 'documentIngestionBackfill',
          taskQueue: 'opendealbook',
          args: [{}],
        },
      },
    ]);
    expect(workflows).toHaveProperty('documentIngestionBackfill');
  });

  it('backfills one team when it connects AI, reusing a backfill already running for it', async () => {
    const { client, starts } = fakeStartClient();

    await triggerDocumentIngestionBackfill(client, 'acct-harbor');

    expect(starts).toEqual([
      {
        type: 'documentIngestionBackfill',
        options: {
          taskQueue: 'opendealbook',
          workflowId: 'ingest-backfill-acct-harbor',
          workflowIdConflictPolicy: 'USE_EXISTING',
          args: [{ accountId: 'acct-harbor' }],
        },
      },
    ]);
  });

  it('runs one relay instance from the deal event log', async () => {
    const { client, starts } = fakeStartClient();

    await ensureDocumentIngestionRelay(client);

    expect(starts).toEqual([
      {
        type: 'documentIngestionRelay',
        options: {
          taskQueue: 'opendealbook',
          workflowId: 'document-ingestion-relay',
          workflowIdConflictPolicy: 'USE_EXISTING',
          args: [{}],
        },
      },
    ]);
    expect(workflows).toHaveProperty('documentIngestionRelay');
  });
});
