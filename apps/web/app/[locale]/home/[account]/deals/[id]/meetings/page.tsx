import { notFound } from 'next/navigation';

import { getSupabaseServerClient } from '@odb/supabase/server';

import { loadTeamWorkspace } from '../../../layout';
import { MeetingsManager } from './meetings-manager';

interface DealMeetingsPageProps {
  params: Promise<{ locale: string; account: string; id: string }>;
}

export default async function DealMeetingsPage({
  params,
}: DealMeetingsPageProps) {
  const { account, id } = await params;
  const { team } = await loadTeamWorkspace(account);

  const client = getSupabaseServerClient();

  const deal = await client
    .from('deal')
    .select('id')
    .eq('id', id)
    .eq('account_id', team.id)
    .maybeSingle();

  if (!deal.data) {
    notFound();
  }

  const [{ data: meetings }, { data: connections }] = await Promise.all([
    client
      .from('meeting')
      .select('id, type, scheduled_at, status, summary, recording_path')
      .eq('deal_id', id)
      .order('scheduled_at', { ascending: false }),
    client
      .from('calendar_connection')
      .select('id, provider, email')
      .eq('account_id', team.id),
  ]);

  return (
    <main className={'flex flex-col gap-6 p-8'}>
      <h1 className={'text-2xl font-semibold'}>Meetings</h1>
      <MeetingsManager
        accountId={team.id}
        dealId={id}
        meetings={meetings ?? []}
        connections={connections ?? []}
      />
    </main>
  );
}
