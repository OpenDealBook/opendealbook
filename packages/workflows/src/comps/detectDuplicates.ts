import { classifyDuplicates, type DedupeSubject } from '@odb/comps';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

export interface DetectDuplicatesInput {
  dealId: string;
}

export async function detectDuplicates(input: DetectDuplicatesInput): Promise<void> {
  const client = getSupabaseServerAdminClient();

  const { data: deal, error } = await client
    .from('deal')
    .select('account_id, source_url, description, duplicate_of')
    .eq('id', input.dealId)
    .single();

  if (error) {
    throw error;
  }

  if (deal.duplicate_of !== null) {
    return;
  }

  const { data: others, error: othersError } = await client
    .from('deal')
    .select('id, source_url, description')
    .eq('account_id', deal.account_id)
    .neq('id', input.dealId);

  if (othersError) {
    throw othersError;
  }

  const subject: DedupeSubject = {
    dealId: input.dealId,
    sourceUrl: deal.source_url,
    description: deal.description,
  };
  const existing: DedupeSubject[] = others.map((row) => ({
    dealId: row.id,
    sourceUrl: row.source_url,
    description: row.description,
  }));

  const decision = classifyDuplicates(subject, existing);

  if (decision.autoFlag) {
    const { error: appendError } = await client.rpc('append_deal_event', {
      p_deal_id: input.dealId,
      p_aggregate_type: 'deal',
      p_aggregate_id: input.dealId,
      p_event_type: 'deal.duplicate_flagged',
      p_payload: { duplicate_of: decision.autoFlag.duplicateOf },
      p_actor_kind: 'service',
      p_actor_via: 'workflow',
    });
    if (appendError) {
      throw appendError;
    }
    return;
  }

  if (decision.candidates.length > 0) {
    const rows = decision.candidates.map((candidate) => ({
      account_id: deal.account_id,
      deal_id: input.dealId,
      candidate_deal_id: candidate.candidateDealId,
      signal: candidate.signal,
      score: candidate.score,
    }));
    const { error: candidateError } = await client
      .from('duplicate_candidate')
      .upsert(rows, { onConflict: 'deal_id,candidate_deal_id' });
    if (candidateError) {
      throw candidateError;
    }
  }
}
