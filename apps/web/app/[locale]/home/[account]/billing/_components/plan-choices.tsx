import type { Product } from '@odb/billing';

import { CheckoutForm } from './checkout-form';

export function PlanChoices({
  accountId,
  product,
  returnUrl,
}: {
  accountId: string;
  product: Product;
  returnUrl: string;
}) {
  return (
    <ul className={'flex flex-col gap-3'}>
      {product.plans.map((plan) => (
        <li key={plan.id} className={'flex items-center justify-between gap-4'}>
          <span>
            <span className={'font-medium'}>{plan.name}</span>{' '}
            <span className={'text-muted-foreground'}>
              ${plan.lineItems[0]!.cost} per {plan.interval}
            </span>
          </span>
          <CheckoutForm
            accountId={accountId}
            productId={product.id}
            planId={plan.id}
            returnUrl={returnUrl}
          />
        </li>
      ))}
    </ul>
  );
}
