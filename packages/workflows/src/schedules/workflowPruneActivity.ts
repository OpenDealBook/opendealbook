import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

export async function pruneWorkflowStepData(): Promise<void> {
  await getSupabaseServerAdminClient().rpc('prune_workflow_step_data').throwOnError();
}
