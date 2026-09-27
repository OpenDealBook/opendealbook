import Link from 'next/link';

import type { Plan } from '@tuckin/billing';
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

function planTotal(plan: Plan) {
  return plan.lineItems.reduce((total, lineItem) => total + lineItem.cost, 0);
}

function formatPrice(currency: string, amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

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
        {billingConfig.products.map((product) => {
          const monthlyPlan = product.plans.find(
            (plan) => plan.interval === 'month',
          );
          const yearlyPlan = product.plans.find(
            (plan) => plan.interval === 'year',
          );

          return (
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

                {monthlyPlan ? (
                  <div className={'flex flex-col gap-1'}>
                    <span className={'text-3xl font-bold'}>
                      {formatPrice(product.currency, planTotal(monthlyPlan))} /
                      month
                    </span>
                    {yearlyPlan ? (
                      <span className={'text-muted-foreground text-sm'}>
                        or billed at{' '}
                        {formatPrice(product.currency, planTotal(yearlyPlan))}
                        /yr
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </CardContent>

              <CardFooter>
                <Button asChild className={'w-full'}>
                  <Link href={'/auth/sign-up'}>Get started</Link>
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
