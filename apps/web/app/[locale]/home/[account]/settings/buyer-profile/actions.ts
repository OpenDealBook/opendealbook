'use server';

import { z } from 'zod';

import { saveBuyerProfile } from '@odb/buyer-profile/server';
import { enhanceAction } from '@odb/next/actions';
import { getSupabaseServerClient } from '@odb/supabase/server';

const saveSchema = z.object({
  accountId: z.string(),
  display_name: z.string().nullable(),
  headline: z.string().nullable(),
  about: z.string().nullable(),
  experience: z.string().nullable(),
  motivation: z.string().nullable(),
  target_statement: z.string().nullable(),
  value_proposition: z.string().nullable(),
  expertise_json: z.object({ areas: z.array(z.string()) }).nullable(),
  financing_json: z
    .object({
      cash_available: z.string(),
      max_purchase_price: z.string(),
      sba_prequalified: z.boolean(),
    })
    .nullable(),
  contact_json: z
    .object({
      email: z.string(),
      phone: z.string(),
      website: z.string(),
    })
    .nullable(),
  interested_json: z.array(z.string()).nullable(),
  not_interested_json: z.array(z.string()).nullable(),
  photo_path: z.string().nullable(),
  include_sensitive: z.boolean(),
  sensitive_json: z
    .object({
      credit_score: z.string(),
      pre_approval: z.string(),
      phone: z.string(),
    })
    .nullable(),
});

export const saveBuyerProfileAction = enhanceAction(
  async (input, user) => {
    const client = getSupabaseServerClient();

    const { data: allowed, error } = await client.rpc('has_permission', {
      account_id: input.accountId,
      permission_name: 'buyer_profile.manage',
      user_id: user.id,
    });

    if (error) {
      throw error;
    }

    if (!allowed) {
      throw new Error('Not permitted to manage the buyer profile');
    }

    const { accountId, ...draft } = input;

    await saveBuyerProfile(client, accountId, draft);
  },
  { auth: true, schema: saveSchema },
);
