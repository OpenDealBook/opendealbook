'use server';

import { redirect } from 'next/navigation';

import { createBillingGatewayService } from '@odb/billing-gateway';
import { createStripeBillingStrategy } from '@odb/stripe';
import { getSupabaseServerClient } from '@odb/supabase/server';

import appConfig from '~/config/app.config';

export async function createCheckout(params: {
  productId: string;
  planId: string;
}) {
  const client = getSupabaseServerClient();

  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    redirect('/auth/sign-in');
  }

  const gateway = createBillingGatewayService(createStripeBillingStrategy());

  const { checkoutToken } = await gateway.createCheckoutSession({
    accountId: user.id,
    productId: params.productId,
    planId: params.planId,
    returnUrl: `${appConfig.url}/home/billing`,
    customerEmail: user.email,
  });

  return checkoutToken;
}
