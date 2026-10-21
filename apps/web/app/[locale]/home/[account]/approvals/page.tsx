import { notFound } from 'next/navigation';

import { getSupabaseServerClient } from '@odb/supabase/server';
import { parseWorkflowGraph } from '@odb/workflows/builder/client';

import {
  ApprovalInbox,
  type WaitingDecision,
} from '../../_components/approval-inbox';
import { TeamFacts } from '../../_components/team-facts';
import { loadTeamWorkspace } from '../layout';
import {
  addFactAction,
  decideApprovalAction,
  decideVerdictAction,
  deleteFactAction,
  editFactAction,
  revokeVerdictAction,
} from './actions';

export default async function ApprovalsPage(props: {
  params: Promise<{ account: string }>;
}) {
  const { account } = await props.params;
  const { team, permissions } = await loadTeamWorkspace(account);

  if (!permissions.includes('deals.manage')) {
    notFound();
  }

  const client = getSupabaseServerClient();
  const [{ data: steps }, { data: teamVerdicts }, { data: facts }] =
    await Promise.all([
      client
        .from('workflow_step_run')
        .select(
          'id, run_id, node_id, output, started_at, workflow_approval(approved), workflow_run(workflow_id, workflow(name), workflow_version(schema_version, graph))',
        )
        .eq('account_id', team.id)
        .eq('status', 'waiting')
        .eq('waiting_on', 'decision')
        .order('started_at')
        .throwOnError(),
      client
        .from('firm_verdict')
        .select(
          'id, firm_id, firm(name), firm_verdict_approval(approved_at, reason, firm_verdict_revocation(verdict_id))',
        )
        .eq('account_id', team.id)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .throwOnError(),
      client
        .from('decision_fact')
        .select('id, body')
        .eq('account_id', team.id)
        .order('created_at', { ascending: false })
        .throwOnError(),
    ]);

  const awaiting = steps
    .filter((step) => step.workflow_approval.length === 0)
    .map((step) => ({
      step,
      type: parseWorkflowGraph({
        schemaVersion: step.workflow_run.workflow_version.schema_version,
        graph: step.workflow_run.workflow_version.graph,
      }).nodes.find((node) => node.id === step.node_id)!.type,
      output: step.output as { prompt?: string; verdictId?: string },
    }));
  const verdictIds = awaiting.flatMap(({ output }) => output.verdictId ?? []);
  const { data: verdicts } = await client
    .from('firm_verdict')
    .select('id, fit, reasons, firm(name)')
    .in('id', verdictIds)
    .throwOnError();

  const waiting: WaitingDecision[] = awaiting.map(({ step, type, output }) => {
    const common = {
      stepRunId: step.id,
      runId: step.run_id,
      runHref: `/home/${account}/workflows/${step.workflow_run.workflow_id}/runs/${step.run_id}`,
      workflowName: step.workflow_run.workflow.name,
      since: step.started_at,
    };
    if (type === 'approval') {
      return { ...common, kind: 'approval', prompt: output.prompt! };
    }
    const verdict = verdicts.find((each) => each.id === output.verdictId)!;
    return {
      ...common,
      kind: 'verdict',
      verdictId: verdict.id,
      firmName: verdict.firm.name,
      fit: verdict.fit,
      reasons: verdict.reasons,
    };
  });

  const latestVerdicts = teamVerdicts.filter(
    (verdict, index) =>
      teamVerdicts.findIndex((each) => each.firm_id === verdict.firm_id) ===
      index,
  );
  const approved = latestVerdicts.flatMap((verdict) => {
    const approval = verdict.firm_verdict_approval;

    return approval && approval.firm_verdict_revocation.length === 0
      ? [
          {
            verdictId: verdict.id,
            firmName: verdict.firm.name,
            approvedAt: approval.approved_at,
            overrideReason: approval.reason,
          },
        ]
      : [];
  });

  return (
    <main className={'flex min-w-0 flex-col gap-6 p-4 md:p-8'}>
      <div className={'flex flex-col gap-1'}>
        <h1 className={'text-2xl font-semibold'}>Approvals</h1>
        <p className={'text-muted-foreground text-sm'}>
          Workflow steps and firm verdicts that wait for a deal manager. Nothing
          here is decided automatically.
        </p>
      </div>
      <div className={'grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]'}>
        <ApprovalInbox
          accountId={team.id}
          waiting={waiting}
          approved={approved}
          decideApproval={decideApprovalAction}
          decideVerdict={decideVerdictAction}
          revokeVerdict={revokeVerdictAction}
        />
        <aside className={'lg:border-l lg:pl-8'}>
          <TeamFacts
            accountId={team.id}
            facts={facts}
            addFact={addFactAction}
            editFact={editFactAction}
            deleteFact={deleteFactAction}
          />
        </aside>
      </div>
    </main>
  );
}
