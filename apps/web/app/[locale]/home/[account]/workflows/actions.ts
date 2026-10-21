'use server';

import { z } from 'zod';

import { refusableAction } from '@odb/next/actions/refusable-action';
import { Refusal } from '@odb/next/refusal';
import { getSupabaseServerClient } from '@odb/supabase/server';
import {
  ManualRunRefused,
  startManualWorkflowRun,
} from '@odb/workflows/builder/client';

const UNPUBLISHED_ENABLE_DB_ERROR = 'a workflow needs a published version to be enabled';

async function requireManage(workflowId: string, userId: string) {
  const client = getSupabaseServerClient();
  const { data: workflow } = await client
    .from('workflow')
    .select('account_id, archived_at')
    .eq('id', workflowId)
    .single()
    .throwOnError();
  const { data: canManage } = await client
    .rpc('has_permission', {
      user_id: userId,
      account_id: workflow.account_id,
      permission_name: 'workflows.manage',
    })
    .throwOnError();

  if (!canManage) {
    throw new Refusal('Changing a workflow needs workflows.manage');
  }

  return { client, archived: workflow.archived_at !== null };
}

export const setWorkflowEnabled = refusableAction(
  async ({ workflowId, enabled }, user) => {
    const { client, archived } = await requireManage(workflowId, user.id);

    if (enabled && archived) {
      throw new Refusal('Unarchive this workflow first');
    }

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
  },
  z.object({ workflowId: z.uuid(), enabled: z.boolean() }),
);

export const setWorkflowArchived = refusableAction(
  async ({ workflowId, archived }, user) => {
    const { client } = await requireManage(workflowId, user.id);

    await client
      .from('workflow')
      .update(
        archived
          ? { archived_at: new Date().toISOString(), enabled: false }
          : { archived_at: null },
      )
      .eq('id', workflowId)
      .throwOnError();
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
