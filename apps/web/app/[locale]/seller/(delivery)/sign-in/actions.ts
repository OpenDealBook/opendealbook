'use server';

import { after } from 'next/server';

import { z } from 'zod';

import { requestSellerSignIn } from '@odb/seller-rooms/members/sign-in-request.ts';
import { requireEnv } from '@odb/shared/env';
import { getLogger } from '@odb/shared/logger';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import { env } from '../../../../../env';

export interface SignInLinkSent {
  email: string;
  sender: string | undefined;
}

const schema = z.object({
  email: z.email().toLowerCase(),
  next: z.string(),
});

export async function requestSellerSignInLink(
  _state: SignInLinkSent | null,
  formData: FormData,
): Promise<SignInLinkSent> {
  const input = schema.parse({
    email: formData.get('email'),
    next: formData.get('next'),
  });
  const from = env.SELLER_DELIVERY_FROM_EMAIL;

  after(async () => {
    try {
      if (!from) {
        throw new Error('Seller email is not set up');
      }

      await requestSellerSignIn(getSupabaseServerAdminClient(), input, {
        origin: requireEnv('NEXT_PUBLIC_SITE_URL'),
        from,
      });
    } catch (error) {
      getLogger().error({ err: error }, 'Seller sign-in link was not sent');
    }
  });

  return { email: input.email, sender: from };
}
