import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import { AI_NODE_TYPES } from './nodeKinds';

export async function aiProviderProblem(
  accountId: string,
  graph: { nodes: { type: string }[] },
): Promise<string | null> {
  if (!graph.nodes.some((node) => AI_NODE_TYPES.includes(node.type))) {
    return null;
  }
  const { count } = await getSupabaseServerAdminClient()
    .from('llm_endpoint')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .not('api_key_secret_id', 'is', null)
    .not('chat_model', 'is', null)
    .throwOnError();
  return count === 0 ? 'Connect an AI provider first' : null;
}
