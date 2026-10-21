import { fetchDealSchedule } from '@odb/diligence/server';
import { getSupabaseServerClient } from '@odb/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';

import { loadTeamWorkspace } from '../../../layout';
import { ScheduleManager, ScheduleStarter } from './schedule-manager';

interface TeamDealSchedulePageProps {
  params: Promise<{ locale: string; account: string; id: string }>;
}

export default async function TeamDealSchedulePage({
  params,
}: TeamDealSchedulePageProps) {
  const { account, id } = await params;
  const { team } = await loadTeamWorkspace(account);

  const client = getSupabaseServerClient();
  const [{ schedule, weeks }, { data: templates }] = await Promise.all([
    fetchDealSchedule(client, id),
    client
      .from('checklist_template')
      .select('id, name')
      .eq('account_id', team.id)
      .eq('kind', 'diligence')
      .order('created_at')
      .throwOnError(),
  ]);

  return (
    <main className={'flex min-w-0 flex-col gap-6 p-4 md:p-8'}>
      <Card>
        <CardHeader>
          <CardTitle>Diligence schedule</CardTitle>
        </CardHeader>
        <CardContent>
          {schedule === null ? (
            <ScheduleStarter dealId={id} templates={templates} />
          ) : (
            <ScheduleManager
              scheduleId={schedule.id}
              status={schedule.status}
              weeks={weeks}
            />
          )}
        </CardContent>
      </Card>
    </main>
  );
}
