'use client';

import { useTransition } from 'react';

import { Button } from '@odb/ui/button';

import { createCheckout } from '../checkout-action';

export function CheckoutForm({
  productId,
  planId,
}: {
  productId: string;
  planId: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const checkoutToken = await createCheckout({ productId, planId });

          window.location.assign(checkoutToken);
        })
      }
    >
      Checkout
    </Button>
  );
}
