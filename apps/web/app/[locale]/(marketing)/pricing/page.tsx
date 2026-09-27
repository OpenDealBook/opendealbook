import Link from 'next/link';

import { Badge } from '@tuckin/ui/badge';
import { Button } from '@tuckin/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@tuckin/ui/card';
import { Separator } from '@tuckin/ui/separator';

import billingConfig from '~/config/billing.config';

export default async function PricingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  await params;

  return (
    <section className={'mx-auto w-full max-w-6xl px-6 py-16'}>
      <div className={'flex flex-col items-center gap-3 text-center'}>
        <h1 className={'text-4xl font-bold'}>Pricing</h1>
        <p className={'text-muted-foreground'}>
          Choose the plan that fits how your team works.
        </p>
      </div>

      <div className={'mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3'}>
        {billingConfig.products.map((product) => (
          <Card key={product.id} className={'flex flex-col'}>
            <CardHeader>
              <CardTitle>{product.name}</CardTitle>
              <CardDescription>{product.description}</CardDescription>
            </CardHeader>

            <CardContent className={'flex flex-1 flex-col gap-6'}>
              {product.features?.length ? (
                <ul className={'flex flex-col gap-2 text-sm'}>
                  {product.features.map((feature) => (
                    <li key={feature} className={'text-muted-foreground'}>
                      {feature}
                    </li>
                  ))}
                </ul>
              ) : null}

              <Separator />

              <div className={'flex flex-col gap-4'}>
                {product.plans.map((plan) => (
                  <div key={plan.id} className={'flex flex-col gap-2'}>
                    <div className={'flex items-center justify-between'}>
                      <span className={'font-medium'}>{plan.name}</span>
                      <Badge variant={'outline'}>{plan.interval}</Badge>
                    </div>
                    <ul className={'flex flex-col gap-1 text-sm text-muted-foreground'}>
                      {plan.lineItems.map((lineItem) => (
                        <li
                          key={lineItem.id}
                          className={'flex items-center justify-between'}
                        >
                          <span>{lineItem.name}</span>
                          <span>
                            {product.currency} {lineItem.cost}
                            {lineItem.type === 'per_seat'
                              ? ` / ${lineItem.unit ?? 'seat'}`
                              : lineItem.type === 'metered'
                                ? ` / ${lineItem.unit ?? 'unit'}`
                                : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </CardContent>

            <CardFooter>
              <Button asChild className={'w-full'}>
                <Link href={'/auth/sign-up'}>Get started</Link>
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </section>
  );
}
