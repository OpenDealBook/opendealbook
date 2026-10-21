import { APPROVAL_WAITING_EVENT } from '@odb/notifications/server';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import { noticeDealManagers } from './managerNotice';

export function noticeApprovalWaiting(input: {
  step: {
    account_id: string;
    workflow_run: {
      accounts: { slug: string | null };
      workflow: { name: string };
    };
  };
  dedupeKey: (userId: string) => string;
}): Promise<void> {
  const { step } = input;

  return noticeDealManagers({
    accountId: step.account_id,
    message: `${step.workflow_run.workflow.name} is waiting for approval`,
    path: `/home/${step.workflow_run.accounts.slug}/approvals`,
    type: 'info',
    event: APPROVAL_WAITING_EVENT,
    dedupeKey: input.dedupeKey,
  });
}

export async function notifyApprovalWaiting(input: {
  stepRunId: string;
}): Promise<void> {
  const { data: step } = await getSupabaseServerAdminClient()
    .from('workflow_step_run')
    .select('id, account_id, workflow_run(accounts(slug), workflow(name))')
    .eq('id', input.stepRunId)
    .single()
    .throwOnError();

  await noticeApprovalWaiting({
    step,
    dedupeKey: (userId) => `workflow_approval_waiting:${step.id}:${userId}`,
  });
}
