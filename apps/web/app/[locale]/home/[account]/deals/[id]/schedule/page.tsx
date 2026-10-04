import { fetchDealSchedule } from '@odb/diligence/server';
import { getSupabaseServerClient } from '@odb/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';

import { loadTeamWorkspace } from '../../../layout';
import { ScheduleManager } from './schedule-manager';

interface TeamDealSchedulePageProps {
  params: Promise<{ locale: string; account: string; id: string }>;
}

export default async function TeamDealSchedulePage({
  params,
}: TeamDealSchedulePageProps) {
  const { account, id } = await params;
  await loadTeamWorkspace(account);

  const client = getSupabaseServerClient();
  const { schedule, weeks } = await fetchDealSchedule(client, id);

  return (
    <main className={'flex flex-col gap-6 p-8'}>
      <Card>
        <CardHeader>
          <CardTitle>Diligence schedule</CardTitle>
        </CardHeader>
        <CardContent>
          {schedule === null ? (
            <p className={'text-muted-foreground text-sm'}>
              No diligence schedule for this deal yet
            </p>
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
