import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';
import { formatOwnerNames } from '@odb/templates/generation';

export interface ContractFieldInput {
  dealId: string;
  accountId: string;
  offerVersionId: string | null;
  terms: Record<string, unknown>;
}

export async function dealOfferFieldInput(
  client: SupabaseClient<Database>,
  dealId: string,
  accountId: string,
): Promise<ContractFieldInput> {
  const { data: offer } = await client
    .from('offer')
    .select('current_version_id')
    .eq('deal_id', dealId)
    .in('status', ['draft', 'submitted', 'countered', 'accepted'])
    .maybeSingle()
    .throwOnError();

  if (!offer?.current_version_id) {
    return { dealId, accountId, offerVersionId: null, terms: {} };
  }

  const { data: version } = await client
    .from('offer_version')
    .select('terms')
    .eq('id', offer.current_version_id)
    .single()
    .throwOnError();

  return {
    dealId,
    accountId,
    offerVersionId: offer.current_version_id,
    terms: version.terms as Record<string, unknown>,
  };
}

export async function contractFieldValues(
  client: SupabaseClient<Database>,
  input: ContractFieldInput,
): Promise<Record<string, unknown>> {
  const { data: version } =
    input.offerVersionId === null
      ? { data: null }
      : await client
          .from('offer_version')
          .select(
            'purchase_price, target_close_date, exclusivity_days, diligence_days, real_estate_portion',
          )
          .eq('id', input.offerVersionId)
          .single()
          .throwOnError();
  const { data: deal } = await client
    .from('deal')
    .select('firm_id')
    .eq('id', input.dealId)
    .single()
    .throwOnError();
  const { data: firm } =
    deal.firm_id === null
      ? { data: null }
      : await client
          .from('firm')
          .select('owner_names')
          .eq('id', deal.firm_id)
          .maybeSingle()
          .throwOnError();
  const { data: account } = await client
    .from('accounts')
    .select('legal_entity_name')
    .eq('id', input.accountId)
    .single()
    .throwOnError();
  const { data: sought } = await client
    .from('deal_terms_sought')
    .select('seller_note_amount')
    .eq('deal_id', input.dealId)
    .maybeSingle()
    .throwOnError();

  const terms = input.terms as {
    purchase_price?: number;
    seller_note?: { amount: number };
  };
  const purchasePrice = terms.purchase_price ?? version?.purchase_price;
  const sellerNote =
    terms.seller_note?.amount ?? sought?.seller_note_amount ?? 0;

  return {
    buyer_name: account.legal_entity_name,
    seller_name: firm ? formatOwnerNames(firm.owner_names) : undefined,
    effective_date: new Date().toISOString().slice(0, 10),
    cash_at_close:
      purchasePrice === undefined
        ? undefined
        : Number(purchasePrice) - sellerNote,
    purchase_price: version?.purchase_price,
    target_close_date: version?.target_close_date,
    exclusivity_days: version?.exclusivity_days,
    diligence_days: version?.diligence_days,
    real_estate_portion: version?.real_estate_portion,
    ...input.terms,
  };
}
