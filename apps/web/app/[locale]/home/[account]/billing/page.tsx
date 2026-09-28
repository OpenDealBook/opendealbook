import { TeamBillingPanel } from '@odb/team-accounts';

import appConfig from '~/config/app.config';
import billingConfig from '~/config/billing.config';

import { loadTeamWorkspace } from '../layout';
import { CheckoutForm } from './_components/checkout-form';

interface TeamBillingPageProps {
  params: Promise<{ locale: string; account: string }>;
}

export default async function TeamBillingPage({
  params,
}: TeamBillingPageProps) {
  const { account } = await params;
  const { team, subscriptionStatus } = await loadTeamWorkspace(account);

  const product = billingConfig.products[0];
  const plan = product?.plans[0];

  return (
    <main className={'p-8'}>
      <TeamBillingPanel
        accountId={team.id}
        subscriptionStatus={subscriptionStatus}
      >
        {product && plan ? (
          <CheckoutForm
            accountId={team.id}
            productId={product.id}
            planId={plan.id}
            returnUrl={`${appConfig.url}/home/${account}/billing`}
          />
        ) : null}
      </TeamBillingPanel>
    </main>
  );
}
