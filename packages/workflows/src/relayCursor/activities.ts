import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

export async function loadRelayCursor(name: string): Promise<number | null> {
  const client = getSupabaseServerAdminClient();

  const { data, error } = await client
    .from('relay_cursor')
    .select('last_global_seq')
    .eq('name', name)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.last_global_seq ?? null;
}

export async function startRelayCursorAtLatest(name: string): Promise<number> {
  const client = getSupabaseServerAdminClient();

  const { data: latest, error } = await client
    .from('deal_event')
    .select('global_seq')
    .order('global_seq', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const { error: insertError } = await client
    .from('relay_cursor')
    .upsert(
      { name, last_global_seq: latest?.global_seq ?? 0 },
      { onConflict: 'name', ignoreDuplicates: true },
    );

  if (insertError) {
    throw insertError;
  }

  return (await loadRelayCursor(name))!;
}

export async function saveRelayCursor(input: {
  name: string;
  lastGlobalSeq: number;
}): Promise<void> {
  const client = getSupabaseServerAdminClient();

  const { error } = await client
    .from('relay_cursor')
    .upsert({ name: input.name, last_global_seq: input.lastGlobalSeq });

  if (error) {
    throw error;
  }
}

export interface RelayFailedEvent {
  relayName: string;
  globalSeq: number;
  error: string;
  attempts: number;
}

export async function recordRelayFailedEvent(
  failure: RelayFailedEvent,
): Promise<void> {
  const client = getSupabaseServerAdminClient();

  const { error } = await client.from('relay_failed_event').upsert({
    relay_name: failure.relayName,
    global_seq: failure.globalSeq,
    error: failure.error,
    attempts: failure.attempts,
  });

  if (error) {
    throw error;
  }

  console.error(
    `Relay ${failure.relayName} event ${failure.globalSeq} set aside after ${failure.attempts} failed attempts: ${failure.error}`,
  );

  const { data: superAdmins } = await client
    .from('accounts')
    .select('id, primary_owner_user_id')
    .eq('is_personal_account', true)
    .in('primary_owner_user_id', await superAdminUserIds(client))
    .throwOnError();

  await client
    .from('notifications')
    .upsert(
      superAdmins.map((account) => ({
        account_id: account.id,
        recipient_user_id: account.primary_owner_user_id,
        type: 'error' as const,
        body: `Relay ${failure.relayName} set aside event ${failure.globalSeq} after ${failure.attempts} failed attempts`,
        link: '/admin',
        dedupe_key: `relay_failed:${failure.relayName}:${failure.globalSeq}:${account.primary_owner_user_id}`,
      })),
      { onConflict: 'dedupe_key', ignoreDuplicates: true },
    )
    .throwOnError();
}

async function superAdminUserIds(
  client: ReturnType<typeof getSupabaseServerAdminClient>,
): Promise<string[]> {
  const perPage = 1000;
  const ids: string[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw error;
    }
    ids.push(
      ...data.users
        .filter((user) => user.app_metadata.role === 'super-admin')
        .map((user) => user.id),
    );
    if (data.users.length < perPage) {
      return ids;
    }
  }
}
