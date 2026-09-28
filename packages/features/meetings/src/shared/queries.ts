import type { Tables } from '@odb/supabase';
import type { getSupabaseBrowserClient } from '@odb/supabase/client';

type Client = ReturnType<typeof getSupabaseBrowserClient>;

export async function fetchMeetings(
  client: Client,
  dealId: string,
): Promise<Tables<'meeting'>[]> {
  const { data, error } = await client
    .from('meeting')
    .select('*')
    .eq('deal_id', dealId)
    .order('scheduled_at', { ascending: false });

  if (error) {
    throw error;
  }

  return data;
}

export async function fetchMeeting(
  client: Client,
  meetingId: string,
): Promise<Tables<'meeting'>> {
  const { data, error } = await client
    .from('meeting')
    .select('*')
    .eq('id', meetingId)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function fetchMeetingActionItems(
  client: Client,
  dealId: string,
): Promise<Tables<'meeting_action_item'>[]> {
  const { data, error } = await client
    .from('meeting_action_item')
    .select('*')
    .eq('deal_id', dealId)
    .order('due_at', { ascending: true });

  if (error) {
    throw error;
  }

  return data;
}
