import type { SupabaseClient } from '@supabase/supabase-js';

import { generateStructured } from '@odb/ai/server';
import type { Database } from '@odb/supabase';

import type { DealPayload } from '../schema/deal.schema';
import {
  type DealIntakeDraft,
  dealIntakeDraftSchema,
} from '../schema/deal-intake.schema';

type Client = SupabaseClient<Database>;

const INTAKE_SYSTEM =
  'You extract structured facts about an acquisition target from a business ' +
  'listing or memo. Return only the requested JSON object and use null for ' +
  'any field the source does not state.';

const INTAKE_FIELDS = [
  'revenue, sde, ebitda, asking_price: numbers in US dollars, or null',
  'industry, location, description, employees, business_model, reason_for_sale: strings, or null',
];

function buildPrompt(text: string): string {
  return [
    'Extract these fields as JSON:',
    ...INTAKE_FIELDS.map((line) => `- ${line}`),
    '',
    'Source document:',
    text,
  ].join('\n');
}

export async function extractDealIntake(
  client: Client,
  accountId: string,
  text: string,
): Promise<DealIntakeDraft> {
  return generateStructured(client, {
    accountId,
    system: INTAKE_SYSTEM,
    prompt: buildPrompt(text),
    parse: (raw) => dealIntakeDraftSchema.parse(raw),
  });
}

function defined(
  fields: Record<string, string | number | null>,
): Record<string, string | number> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== null),
  ) as Record<string, string | number>;
}

function profileAndFinancials(
  draft: DealIntakeDraft,
): Record<string, string | number> {
  return defined({
    description: draft.description,
    asking_price: draft.asking_price,
    revenue_ttm: draft.revenue,
    sde_ttm: draft.sde,
    ebitda_ttm: draft.ebitda,
    location_raw: draft.location,
    employee_band: draft.employees,
    reason_for_sale: draft.reason_for_sale,
    industry: draft.industry,
    business_model: draft.business_model,
  });
}

export function dealFromIntakeDraft(
  accountId: string,
  draft: DealIntakeDraft,
): DealPayload {
  return {
    account_id: accountId,
    source: 'manual',
    stage: 'sourcing',
    ...profileAndFinancials(draft),
  } as DealPayload;
}

export function dealUpdateFromIntakeDraft(
  draft: DealIntakeDraft,
): Record<string, string | number> {
  return profileAndFinancials(draft);
}

export { dealIntakeDraftSchema };
