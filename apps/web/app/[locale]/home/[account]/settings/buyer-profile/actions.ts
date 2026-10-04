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
