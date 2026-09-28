import { redirect } from 'next/navigation';

import { PersonalAccountBillingPanel } from '@odb/accounts/personal-account-billing';
import { getSupabaseServerClient } from '@odb/supabase/server';

import billingConfig from '~/config/billing.config';

import { CheckoutForm } from './_components/checkout-form';

export default async function PersonalAccountBillingPage(props: {
  params: Promise<{ locale: string }>;
}) {
  await props.params;

  const client = getSupabaseServerClient();

  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    redirect('/auth/sign-in');
  }

  const product = billingConfig.products[0];
  const plan = product?.plans[0];

  return (
    <main className={'flex flex-col gap-6 p-8'}>
      <h1 className={'text-2xl font-semibold'}>Billing</h1>

      <PersonalAccountBillingPanel accountId={user.id}>
        {product && plan ? (
          <CheckoutForm productId={product.id} planId={plan.id} />
        ) : null}
      </PersonalAccountBillingPanel>
    </main>
  );
}
