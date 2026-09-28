'use client';

import { useTransition } from 'react';

import { Button } from '@odb/ui/button';

import { createTeamCheckoutAction } from '../checkout-action';

export function CheckoutForm({
  accountId,
  productId,
  planId,
  returnUrl,
}: {
  accountId: string;
  productId: string;
  planId: string;
  returnUrl: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const checkoutToken = await createTeamCheckoutAction({
            accountId,
            productId,
            planId,
            returnUrl,
          });

          window.location.assign(checkoutToken);
        })
      }
    >
      Checkout
    </Button>
  );
}
