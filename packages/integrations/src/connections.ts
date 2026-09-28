import type { Tables, TablesInsert } from '@odb/supabase';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

const TABLE = 'integration_connection';

export type IntegrationConnection = Tables<'integration_connection'>;

export interface SaveConnectionInput {
  accountId: string;
  userId?: string;
  provider: string;
  nangoConnectionId: string;
  scopes: string[];
  status: string;
}

export async function saveConnection(
  input: SaveConnectionInput,
): Promise<IntegrationConnection> {
  const insert: TablesInsert<'integration_connection'> = {
    account_id: input.accountId,
    user_id: input.userId ?? null,
    provider: input.provider,
    nango_connection_id: input.nangoConnectionId,
    scopes: input.scopes,
    status: input.status,
  };

  const { data } = await getSupabaseServerAdminClient()
    .from(TABLE)
    .insert(insert)
    .select('*')
    .single()
    .throwOnError();

  return data;
}

export interface GetConnectionInput {
  accountId: string;
  provider: string;
  userId?: string;
}

export async function getConnection({
  accountId,
  provider,
  userId,
}: GetConnectionInput): Promise<IntegrationConnection | null> {
  const base = getSupabaseServerAdminClient()
    .from(TABLE)
    .select('*')
    .eq('account_id', accountId)
    .eq('provider', provider);

  const scoped = userId ? base.eq('user_id', userId) : base.is('user_id', null);

  const { data } = await scoped.maybeSingle().throwOnError();

  return data;
}

export async function listConnections(
  accountId: string,
): Promise<IntegrationConnection[]> {
  const { data } = await getSupabaseServerAdminClient()
    .from(TABLE)
    .select('*')
    .eq('account_id', accountId)
    .throwOnError();

  return data;
}

export async function deleteConnection(id: string): Promise<void> {
  await getSupabaseServerAdminClient()
    .from(TABLE)
    .delete()
    .eq('id', id)
    .throwOnError();
}
