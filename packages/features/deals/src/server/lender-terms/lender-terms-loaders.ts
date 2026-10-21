import type { FundingSource } from '@odb/calculators';
import type { getSupabaseServerClient } from '@odb/supabase/server';

import {
  type ProposedTerms,
  proposeTermsFromFundingSources,
} from './propose-terms';

type Client = ReturnType<typeof getSupabaseServerClient>;

export async function fetchCloseDeadline(client: Client, dealId: string) {
  const { data } = await client
    .from('deal_close_deadline')
    .select('*')
    .eq('deal_id', dealId)
    .maybeSingle()
    .throwOnError();

  return data;
}

export async function fetchDealTermsSought(client: Client, dealId: string) {
  const { data } = await client
    .from('deal_terms_sought')
    .select('*')
    .eq('deal_id', dealId)
    .maybeSingle()
    .throwOnError();

  return data;
}

async function fetchPrimaryDealCalcSources(client: Client, dealId: string) {
  const { data: version } = await client
    .from('calc_version')
    .select('id')
    .eq('deal_id', dealId)
    .eq('type', 'deal')
    .eq('is_primary', true)
    .maybeSingle()
    .throwOnError();

  if (version === null) {
    return [];
  }

  const { data } = await client
    .from('funding_source')
    .select('*')
    .eq('calc_version_id', version.id)
    .order('created_at')
    .throwOnError();

  return data as unknown as FundingSource[];
}

export async function loadDealTermsSought(
  client: Client,
  dealId: string,
): Promise<
  | {
      source: 'saved';
      terms: NonNullable<Awaited<ReturnType<typeof fetchDealTermsSought>>>;
    }
  | { source: 'proposed'; terms: ProposedTerms }
> {
  const saved = await fetchDealTermsSought(client, dealId);

  if (saved !== null) {
    return { source: 'saved', terms: saved };
  }

  return {
    source: 'proposed',
    terms: proposeTermsFromFundingSources(
      await fetchPrimaryDealCalcSources(client, dealId),
    ),
  };
}
