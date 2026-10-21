import { getSupabaseServerClient } from '@odb/supabase/server';

import { WorkflowsList } from '../../_components/workflows-list';
import { loadTeamWorkspace } from '../layout';

export default async function TeamWorkflowsPage({
  params,
  searchParams,
}: {
  params: Promise<{ account: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { account } = await params;
  const view = (await searchParams).view === 'archived' ? 'archived' : 'active';
  const { team, permissions } = await loadTeamWorkspace(account);

  const query = getSupabaseServerClient()
    .from('workflow')
    .select(
      `id, name, enabled, archived_at,
       versions:workflow_version!workflow_version_workflow_id_account_id_fkey(published_at),
       runs:workflow_run!workflow_run_workflow_id_account_id_fkey(status, started_at)`,
    )
    .eq('account_id', team.id)
    .not('versions.published_at', 'is', null)
    .order('published_at', { referencedTable: 'versions', ascending: false })
    .limit(1, { referencedTable: 'versions' })
    .order('started_at', { referencedTable: 'runs', ascending: false })
    .limit(1, { referencedTable: 'runs' })
    .order('name');
  const { data: workflows } = await (view === 'archived'
    ? query.not('archived_at', 'is', null)
    : query.is('archived_at', null)
  ).throwOnError();

  return (
    <main className={'flex flex-col gap-6 p-4 md:p-8'}>
      <h1 className={'font-serif text-2xl font-medium'}>Workflows</h1>
      <WorkflowsList
        view={view}
        canManage={permissions.includes('workflows.manage')}
        basePath={`/home/${account}/workflows`}
        workflows={workflows.map((workflow) => ({
          id: workflow.id,
          name: workflow.name,
          enabled: workflow.enabled,
          archived: workflow.archived_at !== null,
          publishedAt: workflow.versions[0]?.published_at ?? null,
          lastRun: workflow.runs[0]
            ? {
                status: workflow.runs[0].status,
                startedAt: workflow.runs[0].started_at,
              }
            : null,
        }))}
      />
    </main>
  );
}
