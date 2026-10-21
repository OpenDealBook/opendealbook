'use server';

import { z } from 'zod';

import { refusableAction } from '@odb/next/actions/refusable-action';
import { Refusal } from '@odb/next/refusal';
import { getSupabaseServerClient } from '@odb/supabase/server';
import {
  RunActionRefused,
  cancelWaitingRuns,
  cancelWorkflowRun,
  retryWorkflowRun,
} from '@odb/workflows/builder/client';

async function requireManage(accountId: string, userId: string) {
  const { data: canManage } = await getSupabaseServerClient()
    .rpc('has_permission', {
      user_id: userId,
      account_id: accountId,
      permission_name: 'workflows.manage',
    })
    .throwOnError();

  if (!canManage) {
    throw new Refusal('Cancelling or retrying runs needs workflows.manage');
  }
}

async function asRefusal(call: Promise<void>) {
  try {
    await call;
  } catch (error) {
    if (error instanceof RunActionRefused) {
      throw new Refusal(error.message);
    }
    throw error;
  }
}

const runInput = z.object({ accountId: z.uuid(), runId: z.uuid() });

export const cancelRunAction = refusableAction(async (input, user) => {
  await requireManage(input.accountId, user.id);
  await asRefusal(cancelWorkflowRun(input));
}, runInput);

export const retryRunAction = refusableAction(async (input, user) => {
  await requireManage(input.accountId, user.id);
  await asRefusal(retryWorkflowRun(input));
}, runInput);

export const cancelWaitingRunsAction = refusableAction(
  async (input, user) => {
    await requireManage(input.accountId, user.id);

    return cancelWaitingRuns(input);
  },
  z.object({ accountId: z.uuid(), workflowId: z.uuid() }),
);
