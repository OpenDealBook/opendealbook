import { z } from 'zod';

import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import { NODE_CONFIG_SCHEMAS } from '../graph';
import { defineStep } from '../step';
import { teamRow } from '../teamRow';
import { askTeamAi } from '../teamAi';

type Address = {
  line1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
};

function cleanPart(part: string | null): string | null {
  return part === null ? null : part.replaceAll('.', '').replace(/\s+/g, ' ').trim().toUpperCase();
}

function cleanPostalCode(postalCode: string | null): string | null {
  const digits = postalCode?.replace(/\D/g, '') ?? '';
  if (digits.length >= 3 && digits.length <= 5) {
    return digits.padStart(5, '0');
  }
  if (digits.length >= 6 && digits.length <= 9) {
    const zip9 = digits.padStart(9, '0');
    return `${zip9.slice(0, 5)}-${zip9.slice(5)}`;
  }
  return null;
}

function cleanAddress(address: Address): Address {
  return {
    line1: cleanPart(address.line1),
    city: cleanPart(address.city),
    state: cleanPart(address.state),
    postalCode: cleanPostalCode(address.postalCode),
  };
}

function profilePrompt(facts: unknown): string {
  return [
    'Write a one-page profile of this business for a buyer reviewing it as an acquisition target.',
    'Cover what it does, where, its size and age, and its ownership, using only these public records.',
    JSON.stringify(facts),
  ].join('\n\n');
}

const addressFields = 'address_line1, city, state, postal_code';

async function publicRecords(businessId: string) {
  const admin = getSupabaseServerAdminClient();
  const [{ data: registries }, { data: ppp }, { data: sba }, { data: form5500 }] = await Promise.all([
    admin
      .from('state_registry_entity')
      .select(
        'state, name, status, formation_date, mailing_address_line1, mailing_city, mailing_state, mailing_postal_code, state_registry_officer (title)',
      )
      .eq('business_id', businessId)
      .order('fetched_at', { ascending: false })
      .throwOnError(),
    admin
      .from('ppp_loan')
      .select(`${addressFields}, naics_code, jobs_reported, loan_amount, approved_on`)
      .eq('business_id', businessId)
      .order('approved_on', { ascending: false, nullsFirst: false })
      .throwOnError(),
    admin
      .from('sba_loan')
      .select(`${addressFields}, program, naics_code, jobs_supported, loan_amount, approved_on`)
      .eq('business_id', businessId)
      .order('approved_on', { ascending: false, nullsFirst: false })
      .throwOnError(),
    admin
      .from('form_5500_filing')
      .select(`${addressFields}, participant_count, plan_year_begin`)
      .eq('business_id', businessId)
      .order('plan_year_begin', { ascending: false, nullsFirst: false })
      .throwOnError(),
  ]);
  return { registries, ppp, sba, form5500 };
}

export const prepareFirm = defineStep({
  type: 'prepare_firm',
  runOnce: false,
  configSchema: NODE_CONFIG_SCHEMAS.prepare_firm,
  inputSchema: z.object({}),
  outputSchema: z.object({
    mailingAddress: z
      .object({ line1: z.string().nullable(), city: z.string().nullable(), state: z.string().nullable(), postalCode: z.string().nullable() })
      .nullable(),
    profileId: z.string(),
  }),
  async run({ context, config }) {
    const {
      owner_mailing_address_line1,
      owner_mailing_city,
      owner_mailing_state,
      owner_mailing_postal_code,
      ...firm
    } = await teamRow(config.firmId, 'That firm is not on this team', (id) =>
      getSupabaseServerAdminClient()
        .from('firm')
        .select('name, industry, city, state, website, employee_band, established_year, naics_code, public_business_id, owner_mailing_address_line1, owner_mailing_city, owner_mailing_state, owner_mailing_postal_code')
        .eq('id', id)
        .eq('account_id', context.accountId)
        .maybeSingle()
        .throwOnError(),
    );
    const existingAddress: Address | null = owner_mailing_address_line1
      ? {
          line1: owner_mailing_address_line1,
          city: owner_mailing_city,
          state: owner_mailing_state,
          postalCode: owner_mailing_postal_code,
        }
      : null;

    const { registries, ppp, sba, form5500 } = firm.public_business_id
      ? await publicRecords(firm.public_business_id)
      : { registries: [], ppp: [], sba: [], form5500: [] };

    const foundAddress = existingAddress
      ? null
      : ([
          ...registries.map((registry) => ({
            line1: registry.mailing_address_line1,
            city: registry.mailing_city,
            state: registry.mailing_state,
            postalCode: registry.mailing_postal_code,
          })),
          ...[...ppp, ...sba, ...form5500].map((record) => ({
            line1: record.address_line1,
            city: record.city,
            state: record.state,
            postalCode: record.postal_code,
          })),
        ]
          .map(cleanAddress)
          .find((address) => address.line1 && address.city && address.postalCode) ?? null);

    const profile = await askTeamAi({
      accountId: context.accountId,
      firmId: config.firmId,
      signal: context.signal,
      prompt: profilePrompt({ firm, registry: registries[0] ?? null, ppp, sba, form5500 }),
    });

    await getSupabaseServerAdminClient()
      .from('firm')
      .update({
        ...(foundAddress && {
          owner_mailing_address_line1: foundAddress.line1,
          owner_mailing_city: foundAddress.city,
          owner_mailing_state: foundAddress.state,
          owner_mailing_postal_code: foundAddress.postalCode,
        }),
        profile: profile.text,
        profile_model: profile.model,
        profile_generated_at: new Date().toISOString(),
      })
      .eq('id', config.firmId)
      .throwOnError();

    return { mailingAddress: existingAddress ?? foundAddress, profileId: config.firmId };
  },
});
