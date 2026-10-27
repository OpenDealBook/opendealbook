import { getSupabaseServerClient } from '@odb/supabase/server';
import { UNFINISHED_RUN_STATUSES } from '@odb/workflows/builder/client';

import { BackgroundRunAgain } from '../../../../_components/background-run-again';
import { BackgroundSearches } from '../../../../_components/background-searches';
import { loadTeamWorkspace } from '../../../layout';
import { runBackgroundSearch } from './actions';

export default async function TeamDealBackgroundPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; account: string; id: string }>;
  searchParams: Promise<{ search?: string }>;
}) {
  const [{ account, id }, { search }] = await Promise.all([
    params,
    searchParams,
  ]);
  const { team } = await loadTeamWorkspace(account);
  const client = getSupabaseServerClient();

  const [{ data: runs }, { data: canManage }] = await Promise.all([
    client
      .from('workflow_run')
      .select(
        'id, status, error, started_at, workflow!inner(system_key), diligence_run(diligence_report(summary, created_at), diligence_finding(id, subject_kind, subject_name, source, severity, severity_reason, title, source_url, occurred_on)), search_steps:workflow_step_run(skipped:output->skipped)',
      )
      .eq('account_id', team.id)
      .eq('workflow.system_key', 'background_search')
      .eq('trigger_output->>dealId', id)
      .not('search_steps.output->skipped', 'is', null)
      .order('started_at', { ascending: false })
      .order('created_at', {
        referencedTable: 'diligence_run.diligence_finding',
      })
      .throwOnError(),
    client
      .rpc('has_deal_permission', { deal_id: id, permission: 'deals.manage' })
      .throwOnError(),
  ]);

  const searches = runs.map((run) => ({
    id: run.id,
    status: run.status,
    error: run.error,
    started_at: run.started_at,
    skipped: run.search_steps.flatMap((step) =>
      Object.values(step.skipped as Record<string, string>),
    ),
    report: run.diligence_run[0]?.diligence_report[0] ?? null,
    findings: run.diligence_run[0]?.diligence_finding ?? [],
  }));

  return (
    <main className={'flex min-w-0 flex-col gap-6 p-4 md:p-8'}>
      <BackgroundSearches
        searches={searches}
        selected={search}
        basePath={`/home/${account}/deals/${id}/background`}
        runAgain={
          canManage ? (
            <BackgroundRunAgain
              dealId={id}
              running={searches.some((each) =>
                UNFINISHED_RUN_STATUSES.some(
                  (status) => status === each.status,
                ),
              )}
              runBackgroundSearch={runBackgroundSearch}
            />
          ) : null
        }
      />
    </main>
  );
}
