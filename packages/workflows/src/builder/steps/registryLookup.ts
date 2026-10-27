import { z } from 'zod';

import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import { NODE_CONFIG_SCHEMAS } from '../graph';
import { defineStep } from '../step';
import { teamRow } from '../teamRow';

const nullableText = z.string().nullable();

export const registryLookup = defineStep({
  type: 'registry_lookup',
  runOnce: false,
  configSchema: NODE_CONFIG_SCHEMAS.registry_lookup,
  inputSchema: z.object({}),
  outputSchema: z.union([
    z.object({ found: z.literal(false) }),
    z.object({
      found: z.literal(true),
      entity: z.object({
        state: z.string(),
        entityNumber: z.string(),
        name: z.string(),
        registeredAgent: nullableText,
        mailingAddress: z.object({ line1: nullableText, city: nullableText, state: nullableText, postalCode: nullableText }),
      }),
      officers: z.array(z.object({ name: z.string(), title: nullableText })),
      formationDate: nullableText,
      status: nullableText,
      asOf: z.string(),
    }),
  ]),
  async run({ context, config }) {
    const firm = await teamRow(config.firmId, 'That firm is not on this team', (id) =>
      getSupabaseServerAdminClient()
        .from('firm')
        .select('public_business_id')
        .eq('id', id)
        .eq('account_id', context.accountId)
        .maybeSingle()
        .throwOnError(),
    );
    if (!firm.public_business_id) {
      return { found: false as const };
    }

    const { data: entity } = await getSupabaseServerAdminClient()
      .from('state_registry_entity')
      .select(
        'state, entity_number, name, status, formation_date, registered_agent, mailing_address_line1, mailing_city, mailing_state, mailing_postal_code, fetched_at, state_registry_officer (name, title)',
      )
      .eq('business_id', firm.public_business_id)
      .order('fetched_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .throwOnError();
    if (!entity) {
      return { found: false as const };
    }

    return {
      found: true as const,
      entity: {
        state: entity.state,
        entityNumber: entity.entity_number,
        name: entity.name,
        registeredAgent: entity.registered_agent,
        mailingAddress: {
          line1: entity.mailing_address_line1,
          city: entity.mailing_city,
          state: entity.mailing_state,
          postalCode: entity.mailing_postal_code,
        },
      },
      officers: entity.state_registry_officer,
      formationDate: entity.formation_date,
      status: entity.status,
      asOf: entity.fetched_at,
    };
  },
});
