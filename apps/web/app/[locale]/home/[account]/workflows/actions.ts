'use server';

import { z } from 'zod';

import { refusableAction } from '@odb/next/actions/refusable-action';
import { Refusal } from '@odb/next/refusal';
import { getSupabaseServerClient } from '@odb/supabase/server';
import {
  ManualRunRefused,
  startManualWorkflowRun,
} from '@odb/workflows/builder/client';

import {
  manageWorkflow,
  refuseIfArchived,
  syncSchedulesOrRefuse,
} from './require-workflows-manager';

const UNPUBLISHED_ENABLE_DB_ERROR = 'a workflow needs a published version to be enabled';

const SAVED_BUT_NOT_SYNCED = "Saved, but schedules couldn't be updated; try again";

export const setWorkflowEnabled = refusableAction(
  async ({ workflowId, enabled }, user) => {
    const { client, accountId, archived } = await manageWorkflow(workflowId, user.id);

    refuseIfArchived(enabled && archived);

    const { error } = await client
      .from('workflow')
      .update({ enabled })
      .eq('id', workflowId);

    if (error?.message === UNPUBLISHED_ENABLE_DB_ERROR) {
      throw new Refusal('Publish this workflow first');
    }
    if (error) {
      throw error;
    }
    await syncSchedulesOrRefuse(accountId, workflowId, SAVED_BUT_NOT_SYNCED);
  },
  z.object({ workflowId: z.uuid(), enabled: z.boolean() }),
);

export const setWorkflowArchived = refusableAction(
  async ({ workflowId, archived }, user) => {
    const { client, accountId } = await manageWorkflow(workflowId, user.id);

    await client
      .from('workflow')
      .update(
        archived
          ? { archived_at: new Date().toISOString(), enabled: false }
          : { archived_at: null },
      )
      .eq('id', workflowId)
      .throwOnError();
    await syncSchedulesOrRefuse(accountId, workflowId, SAVED_BUT_NOT_SYNCED);
  },
  z.object({ workflowId: z.uuid(), archived: z.boolean() }),
);

export const runWorkflowNow = refusableAction(
  async ({ workflowId, requestId }) => {
    try {
      return await startManualWorkflowRun({
        client: getSupabaseServerClient(),
        workflowId,
        requestId,
      });
    } catch (error) {
      if (error instanceof ManualRunRefused) {
        throw new Refusal(error.message);
      }
      throw error;
    }
  },
  z.object({ workflowId: z.uuid(), requestId: z.uuid() }),
);
