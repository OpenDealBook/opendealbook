import type { DealListGroup } from '@odb/deals';
import { getSupabaseServerClient } from '@odb/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';

import { loadTeamWorkspace } from '../layout';
import { loadPipelineReport } from './_lib/load-pipeline-report';

const GROUP_LABELS: Record<DealListGroup, string> = {
  actively_pursuing: 'Actively pursuing',
  early_funnel: 'Early funnel',
  closed_off_track: 'Closed / off track',
  archived: 'Archived',
};

interface TeamReportsPageProps {
  params: Promise<{ locale: string; account: string }>;
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className={'text-muted-foreground text-sm font-medium'}>
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <span className={'text-3xl font-semibold'}>{value}</span>
      </CardContent>
    </Card>
  );
}

export default async function TeamReportsPage({
  params,
}: TeamReportsPageProps) {
  const { account } = await params;
  const { team } = await loadTeamWorkspace(account);

  const client = getSupabaseServerClient();
  const report = await loadPipelineReport(client, team.id);

  const maxStageCount = Math.max(
    1,
    ...report.stageDistribution.map((stage) => stage.count),
  );
  const funnelTop = Math.max(1, ...report.funnel.map((step) => step.reached));

  return (
    <main className={'flex flex-col gap-6 p-8'}>
      <h1 className={'text-2xl font-semibold'}>Reports</h1>

      <section className={'grid grid-cols-2 gap-4 md:grid-cols-5'}>
        <Stat label={'Active deals'} value={report.activeTotal} />
        {report.groups.map((group) => (
          <Stat
            key={group.group}
            label={GROUP_LABELS[group.group]}
            value={group.count}
          />
        ))}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Current stage distribution</CardTitle>
        </CardHeader>
        <CardContent className={'flex flex-col gap-3'}>
          {report.stageDistribution.map((stage) => (
            <div key={stage.key} className={'flex flex-col gap-1'}>
              <div className={'flex justify-between text-sm'}>
                <span>{stage.label}</span>
                <span className={'text-muted-foreground'}>{stage.count}</span>
              </div>
              <div className={'bg-muted h-2 rounded'}>
                <div
                  className={'bg-primary h-2 rounded'}
                  style={{ width: `${(stage.count / maxStageCount) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fall-off funnel</CardTitle>
        </CardHeader>
        <CardContent className={'flex flex-col gap-3'}>
          {report.funnel.map((step) => (
            <div key={step.key} className={'flex flex-col gap-1'}>
              <div className={'flex justify-between text-sm'}>
                <span>{step.label}</span>
                <span className={'text-muted-foreground'}>
                  {step.conversion === null
                    ? `${step.reached} reached`
                    : `${step.reached} reached, ${step.dropped} dropped, ${Math.round(step.conversion * 100)}% advanced`}
                </span>
              </div>
              <div className={'bg-muted h-2 rounded'}>
                <div
                  className={'bg-primary h-2 rounded'}
                  style={{ width: `${(step.reached / funnelTop) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <section className={'grid grid-cols-2 gap-4 md:grid-cols-4'}>
        <Stat label={'Won'} value={report.resolution.won} />
        <Stat label={'Lost'} value={report.resolution.lost} />
        <Stat label={'Abandoned'} value={report.resolution.abandoned} />
        <Stat
          label={'Win rate'}
          value={`${Math.round(report.resolution.winRate * 100)}%`}
        />
      </section>
    </main>
  );
}
