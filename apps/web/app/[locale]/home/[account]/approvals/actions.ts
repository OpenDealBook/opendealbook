'use server';

import { z } from 'zod';

import { refusableAction } from '@odb/next/actions/refusable-action';
import { Refusal } from '@odb/next/refusal';
import { getSupabaseServerClient } from '@odb/supabase/server';
import { signalApprovalDecided } from '@odb/workflows/builder/client';

const reason = z.string().trim().min(1, 'Give a reason');
const factBody = z.string().trim().min(1, 'Write the fact');
const waitingStep = {
  accountId: z.uuid(),
  runId: z.uuid(),
  stepRunId: z.uuid(),
};
const STEP_NOT_WAITING_CODES = ['23505', '42501'];

async function decideThenWake(
  record: () => PromiseLike<unknown>,
  step: { accountId: string; runId: string; stepRunId: string },
) {
  await Promise.resolve(record()).catch((error: { code?: string }) => {
    if (STEP_NOT_WAITING_CODES.includes(error.code ?? '')) {
      throw new Refusal('This was already decided. Refresh to see it.');
    }
    throw error;
  });
  await signalApprovalDecided(step).catch((error: unknown) => {
    console.error(
      `Waking workflow run ${step.runId} after a decision failed`,
      error,
    );
  });
}

export const decideApprovalAction = refusableAction(
  async ({ accountId, runId, stepRunId, approved }) => {
    await decideThenWake(
      () =>
        getSupabaseServerClient()
          .from('workflow_approval')
          .insert({ step_run_id: stepRunId, account_id: accountId, approved })
          .throwOnError(),
      { accountId, runId, stepRunId },
    );
  },
  z.object({ ...waitingStep, approved: z.boolean() }),
);

export const decideVerdictAction = refusableAction(
  async (input) => {
    await decideThenWake(
      () =>
        getSupabaseServerClient()
          .rpc('decide_firm_verdict', {
            p_step_run_id: input.stepRunId,
            p_verdict_id: input.verdictId,
            p_approved: input.approved,
            p_reason: input.reason,
          })
          .throwOnError(),
      {
        accountId: input.accountId,
        runId: input.runId,
        stepRunId: input.stepRunId,
      },
    );
  },
  z.object({
    ...waitingStep,
    verdictId: z.uuid(),
    approved: z.boolean(),
    reason: reason.optional(),
  }),
);

export const revokeVerdictAction = refusableAction(
  async ({ accountId, verdictId, reason }) => {
    await getSupabaseServerClient()
      .from('firm_verdict_revocation')
      .insert({ verdict_id: verdictId, account_id: accountId, reason })
      .throwOnError();
  },
  z.object({ accountId: z.uuid(), verdictId: z.uuid(), reason }),
);

export const addFactAction = refusableAction(
  async ({ accountId, body }) => {
    await getSupabaseServerClient()
      .from('decision_fact')
      .insert({ account_id: accountId, body })
      .throwOnError();
  },
  z.object({ accountId: z.uuid(), body: factBody }),
);

export const editFactAction = refusableAction(
  async ({ factId, body }) => {
    await getSupabaseServerClient()
      .from('decision_fact')
      .update({ body })
      .eq('id', factId)
      .throwOnError();
  },
  z.object({ factId: z.uuid(), body: factBody }),
);

export const deleteFactAction = refusableAction(
  async ({ factId }) => {
    await getSupabaseServerClient()
      .from('decision_fact')
      .delete()
      .eq('id', factId)
      .throwOnError();
  },
  z.object({ factId: z.uuid() }),
);
