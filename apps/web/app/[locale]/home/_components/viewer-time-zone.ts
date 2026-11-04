import { getSupabaseServerClient } from '@odb/supabase/server';

export function pickTimeZone(zones: {
  personal: string | null;
  team: string | null;
}): string {
  return zones.personal ?? zones.team ?? 'UTC';
}

export async function viewerTimeZone(
  teamAccountId: string | null,
): Promise<string> {
  const client = getSupabaseServerClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  const { data: accounts } = await client
    .from('accounts')
    .select('id, timezone')
    .in('id', teamAccountId === null ? [user!.id] : [user!.id, teamAccountId])
    .throwOnError();
  const zoneOf = (id: string | null) =>
    accounts.find((account) => account.id === id)?.timezone ?? null;

  return pickTimeZone({
    personal: zoneOf(user!.id),
    team: zoneOf(teamAccountId),
  });
}
