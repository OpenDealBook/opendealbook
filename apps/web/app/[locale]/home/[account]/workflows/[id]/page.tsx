import { notFound } from 'next/navigation';

import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { areUuids } from '../../../_components/lender-page-params';
import { WorkflowDetail } from '../../../_components/workflow-detail';
import { loadTeamWorkspace } from '../../layout';
import { renameWorkflow, retryScheduleSync } from '../editor-actions';
import { cancelWaitingRunsAction } from './actions';

export default async function WorkflowDetailPage(props: {
  params: Promise<{ account: string; id: string }>;
}) {
  const { account, id } = await props.params;

  if (!areUuids(id)) {
    notFound();
  }

  const { team, permissions } = await loadTeamWorkspace(account);
  const client = getSupabaseServerClient();

  const [{ data: workflow }, { data: versions }, { data: runs }] =
    await Promise.all([
      client
        .from('workflow')
        .select('id, name, enabled, archived_at, schedules_sync_failed_at')
        .eq('id', id)
        .eq('account_id', team.id)
        .maybeSingle()
        .throwOnError(),
      client
        .from('workflow_version')
        .select('id, published_at, published_by, saved_at')
        .eq('workflow_id', id)
        .eq('account_id', team.id)
        .order('published_at', { ascending: false, nullsFirst: true })
        .throwOnError(),
      client
        .from('workflow_run')
        .select('id, status, trigger_kind, version_id, started_at, finished_at')
        .eq('workflow_id', id)
        .eq('account_id', team.id)
        .order('started_at', { ascending: false })
        .throwOnError(),
    ]);

  if (!workflow) {
    notFound();
  }

  // Service role: teammates cannot read each other's personal accounts, and
  // these ids come from versions the caller was already allowed to read.
  const { data: publishers } = await getSupabaseServerAdminClient()
    .from('accounts')
    .select('primary_owner_user_id, name')
    .eq('is_personal_account', true)
    .in(
      'primary_owner_user_id',
      versions.flatMap((version) => version.published_by ?? []),
    )
    .throwOnError();

  const publisherNames = new Map<string | null, string>(
    publishers.map((publisher) => [
      publisher.primary_owner_user_id,
      publisher.name,
    ]),
  );

  return (
    <main className={'flex min-w-0 flex-col gap-6 p-4 md:p-8'}>
      <WorkflowDetail
        accountId={team.id}
        workflowPath={`/home/${account}/workflows/${id}`}
        workflow={workflow}
        schedulesSyncFailed={workflow.schedules_sync_failed_at !== null}
        versions={versions.map((version) => ({
          id: version.id,
          published_at: version.published_at,
          saved_at: version.saved_at,
          publisher:
            version.published_at &&
            (publisherNames.get(version.published_by) ?? 'a removed user'),
        }))}
        runs={runs}
        canManage={permissions.includes('workflows.manage')}
        cancelWaitingRuns={cancelWaitingRunsAction}
        renameWorkflow={renameWorkflow}
        retryScheduleSync={retryScheduleSync}
      />
    </main>
  );
}
