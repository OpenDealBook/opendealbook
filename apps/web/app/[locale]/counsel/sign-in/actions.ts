'use server';

import { after } from 'next/server';

import { z } from 'zod';

import { requestCounselSignIn } from '@odb/deal-counsel/sign-in-request.ts';
import { requireEnv } from '@odb/shared/env';
import { getLogger } from '@odb/shared/logger';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import { env } from '../../../../env';

export interface SignInLinkSent {
  email: string;
  sender: string | undefined;
}

const schema = z.object({
  email: z.email().toLowerCase(),
  next: z.string(),
});

export async function requestCounselSignInLink(
  _state: SignInLinkSent | null,
  formData: FormData,
): Promise<SignInLinkSent> {
  const input = schema.parse({
    email: formData.get('email'),
    next: formData.get('next'),
  });
  const from = env.SELLER_DELIVERY_FROM_EMAIL;

  // Everything happens after the response so that timing and outcome are the
  // same whether or not the address is counsel on the deal.
  after(async () => {
    try {
      if (!from) {
        throw new Error('Counsel email is not set up');
      }

      await requestCounselSignIn(getSupabaseServerAdminClient(), input, {
        origin: requireEnv('NEXT_PUBLIC_SITE_URL'),
        from,
      });
    } catch (error) {
      getLogger().error({ err: error }, 'Counsel sign-in link was not sent');
    }
  });

  return { email: input.email, sender: from };
}
