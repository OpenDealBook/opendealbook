import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getSupabaseServerClient } from '@odb/supabase/server';
import {
  UNFINISHED_RUN_STATUSES,
  parseWorkflowGraph,
  stepDataRemoved,
} from '@odb/workflows/builder/client';

import { areUuids } from '../../../../../_components/lender-page-params';
import { WorkflowRunDetail } from '../../../../../_components/workflow-run-detail';
import { loadTeamWorkspace } from '../../../../layout';
import { cancelRunAction, retryRunAction } from '../../actions';

export default async function WorkflowRunPage(props: {
  params: Promise<{ account: string; id: string; runId: string }>;
}) {
  const { account, id, runId } = await props.params;

  if (!areUuids(id, runId)) {
    notFound();
  }

  const { team, permissions } = await loadTeamWorkspace(account);
  const client = getSupabaseServerClient();

  const [{ data: run }, { data: steps }] = await Promise.all([
    client
      .from('workflow_run')
      .select('id, status, workflow_version(schema_version, graph)')
      .eq('id', runId)
      .eq('workflow_id', id)
      .eq('account_id', team.id)
      .maybeSingle()
      .throwOnError(),
    client
      .from('workflow_step_run')
      .select(
        'id, node_id, attempt, status, input, output, error, started_at, finished_at, logs:workflow_step_log(id, level, message, details, created_at)',
      )
      .eq('run_id', runId)
      .eq('account_id', team.id)
      .order('started_at')
      .order('created_at', { referencedTable: 'workflow_step_log' })
      .throwOnError(),
  ]);

  if (!run) {
    notFound();
  }

  const { steps: stepNodes } = parseWorkflowGraph({
    schemaVersion: run.workflow_version.schema_version,
    graph: run.workflow_version.graph,
  });
  const labels = Object.fromEntries(
    stepNodes.flatMap((node) => (node.label ? [[node.id, node.label]] : [])),
  );

  return (
    <main className={'flex min-w-0 flex-col gap-6 p-4 md:p-8'}>
      <Link
        href={`/home/${account}/workflows/${id}`}
        className={'text-muted-foreground text-sm underline-offset-4 hover:underline'}
      >
        Back to workflow
      </Link>
      <WorkflowRunDetail
        accountId={team.id}
        run={{ id: run.id, status: run.status }}
        steps={steps}
        labels={labels}
        stepDataRemoved={stepDataRemoved(steps)}
        unfinished={UNFINISHED_RUN_STATUSES.some(
          (status) => status === run.status,
        )}
        canManage={permissions.includes('workflows.manage')}
        cancelRun={cancelRunAction}
        retryRun={retryRunAction}
      />
    </main>
  );
}
