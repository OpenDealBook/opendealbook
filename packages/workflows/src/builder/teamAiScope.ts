import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';

import { resolveTeamAi, type TeamAi } from './teamAiKey';

export { aiJson, privateAiUrlsAllowed } from './aiClient';
export { CapReached } from './caps';
export { embedTexts } from '../documentIngestion/embeddings';
export {
  ADD_EMBEDDING_MODEL,
  ANTHROPIC_HAS_NO_EMBEDDINGS,
  completeMetered,
  CONNECT_AI_PROVIDER,
  meterTeamAiCall,
  type TeamAi,
  TeamAiNotConnected,
} from './teamAiKey';

type Client = SupabaseClient<Database>;

declare const verified: unique symbol;

export interface AiScope {
  readonly accountId: string;
  readonly dealId?: string;
  readonly [verified]: true;
}

export interface DealAiScope extends AiScope {
  readonly dealId: string;
}

export async function dealAiScope(
  client: Client,
  dealId: string,
  permission: 'deals.work' | 'deals.manage',
): Promise<DealAiScope | 'not_found' | 'forbidden'> {
  const { data: deal } = await client
    .from('deal')
    .select('account_id')
    .eq('id', dealId)
    .maybeSingle()
    .throwOnError();

  if (!deal) {
    return 'not_found';
  }

  const { data: allowed } = await client
    .rpc('has_deal_permission', { deal_id: dealId, permission })
    .throwOnError();

  return allowed ? ({ accountId: deal.account_id, dealId } as DealAiScope) : 'forbidden';
}

export async function accountAiScope(
  client: Client,
  userId: string,
  accountId: string,
): Promise<AiScope | null> {
  const { data: allowed } = await client
    .rpc('has_permission', { user_id: userId, account_id: accountId, permission_name: 'deals.create' })
    .throwOnError();

  return allowed ? ({ accountId } as AiScope) : null;
}

export function resolveScopedTeamAi(scope: AiScope, kind: 'chat' | 'embedding'): Promise<TeamAi | null> {
  return resolveTeamAi(scope.accountId, kind);
}
