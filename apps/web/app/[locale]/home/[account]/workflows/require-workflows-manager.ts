import { TEAM_READ_ONLY } from '@odb/next';
import { Refusal } from '@odb/next/refusal';
import { getSupabaseServerClient } from '@odb/supabase/server';
import { syncWorkflowSchedules } from '@odb/workflows/builder/schedule';

export async function requireWorkflowsManager(
  accountId: string,
  userId: string,
) {
  const client = getSupabaseServerClient();
  const { data: canManage } = await client
    .rpc('has_permission', {
      user_id: userId,
      account_id: accountId,
      permission_name: 'workflows.manage',
    })
    .throwOnError();

  if (!canManage) {
    throw new Refusal('Changing a workflow needs workflows.manage');
  }

  return client;
}

export async function manageWorkflow(workflowId: string, userId: string) {
  const { data: workflow } = await getSupabaseServerClient()
    .from('workflow')
    .select('account_id, archived_at')
    .eq('id', workflowId)
    .single()
    .throwOnError();

  return {
    client: await requireWorkflowsManager(workflow.account_id, userId),
    accountId: workflow.account_id,
    archived: workflow.archived_at !== null,
  };
}

export async function refuseIfTeamLocked(accountId: string) {
  const { data: locked } = await getSupabaseServerClient()
    .rpc('is_account_locked', { target_account_id: accountId })
    .throwOnError();

  if (locked) {
    throw new Refusal(TEAM_READ_ONLY);
  }
}

export function refuseIfArchived(archived: boolean) {
  if (archived) {
    throw new Refusal('Unarchive this workflow first');
  }
}

export async function syncSchedulesOrRefuse(
  accountId: string,
  workflowId: string,
  refusal: string,
) {
  await syncWorkflowSchedules({ accountId, workflowId }).catch(() => {
    throw new Refusal(refusal);
  });
}
