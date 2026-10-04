import type { getSupabaseServerClient } from '@odb/supabase/server';

type ServerClient = ReturnType<typeof getSupabaseServerClient>;

export async function fetchDealSchedule(client: ServerClient, dealId: string) {
  const { data: schedule } = await client
    .from('diligence_schedule')
    .select('*')
    .eq('deal_id', dealId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
    .throwOnError();

  if (!schedule) {
    return { schedule: null, weeks: [] };
  }

  const { data: weeks } = await client
    .from('schedule_week')
    .select('*')
    .eq('schedule_id', schedule.id)
    .order('week_no', { ascending: true })
    .throwOnError();

  return { schedule, weeks };
}
