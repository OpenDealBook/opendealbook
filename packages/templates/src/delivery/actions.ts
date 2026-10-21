'use server';

import { enhanceAction } from '@odb/next/actions';
import { requireEnv } from '@odb/shared/env';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { assertDealsManager } from '../permissions';
import {
  createSellerDeliveryClient,
  sendToSeller,
  sendToSellerInputSchema,
} from './send-to-seller';

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
      admin: getSupabaseServerAdminClient(),
      workflow: createSellerDeliveryClient(),
      siteOrigin: requireEnv('NEXT_PUBLIC_SITE_URL'),
      senderUserId: user.id,
      sellerFromEmail: process.env.SELLER_DELIVERY_FROM_EMAIL,
    });
  },
  { auth: true, schema: sendToSellerInputSchema },
);
