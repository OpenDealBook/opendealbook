'use server';

import { z } from 'zod';

import { enhanceAction } from '@odb/next/actions';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { assertDealsManager } from '../permissions';
import { sharePermissionSchema } from '../types';
import { createSellerDeliveryClient, sendToSeller } from './send-to-seller';

const sendToSellerSchema = z.object({
  generatedDocumentId: z.string(),
  recipientUserId: z.string(),
  permission: sharePermissionSchema,
  expiresAt: z.string().nullable().default(null),
});

export const sendToSellerAction = enhanceAction(
  async (input, user) => {
    const client = getSupabaseServerClient();

    const { data: generated, error } = await client
      .from('generated_document')
      .select('account_id')
      .eq('id', input.generatedDocumentId)
      .single();

    if (error) {
      throw error;
    }

    await assertDealsManager(client, generated.account_id, user.id);

    return sendToSeller(input, {
      client,
      workflow: createSellerDeliveryClient(),
    });
  },
  { auth: true, schema: sendToSellerSchema },
);
