import type { Metadata } from 'next';
import Link from 'next/link';

import { Badge } from '@odb/ui/badge';
import { Button } from '@odb/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@odb/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@odb/ui/table';

import { StructuredData } from '~/components/structured-data';
import { pageMetadata } from '~/config/seo';

import { PricingAnalytics } from './pricing-analytics';
import {
  featureRows,
  pricingOfferSchema,
  pricingTiers,
  type PricingTier,
} from './pricing-tiers';

export const metadata: Metadata = pageMetadata({
  title: 'Pricing',
  description:
    'One plan for your entire deal team, from pipeline to close. Start free for 30 days, no credit card to begin.',
  path: '/pricing',
});

function formatPrice(currency: string, amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function TierPrice({ tier }: { tier: PricingTier }) {
  if (tier.price.kind === 'billed') {
    return (
      <div className={'flex flex-col gap-1'}>
        <span className={'text-3xl font-bold'}>
          {formatPrice(tier.price.currency, tier.price.monthly)} / month
        </span>
        <span className={'text-muted-foreground text-sm'}>
          or billed at {formatPrice(tier.price.currency, tier.price.yearly)}/yr
        </span>
      </div>
    );
  }

  return (
    <div className={'flex flex-col gap-1'}>
      <div className={'flex items-center gap-2'}>
        <span className={'text-3xl font-bold'}>{tier.price.label}</span>
        {tier.price.kind === 'placeholder' ? (
          <Badge variant={'outline'}>Placeholder</Badge>
        ) : null}
      </div>
    </div>
  );
}

function MatrixCell({ value }: { value: boolean | string }) {
  if (typeof value === 'boolean') {
    return (
      <span className={value ? '' : 'text-muted-foreground'}>
        {value ? 'Included' : 'Not included'}
      </span>
    );
  }

  return <span>{value}</span>;
}

export default async function PricingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  await params;

  return (
    <section className={'mx-auto w-full max-w-6xl px-6 py-16'}>
      <StructuredData data={pricingOfferSchema()} />
      <PricingAnalytics />

      <div className={'flex flex-col items-center gap-3 text-center'}>
        <h1 className={'text-4xl font-bold'}>
          Pricing for teams that run acquisitions
        </h1>
        <p className={'text-muted-foreground max-w-2xl'}>
          One platform for pipeline, diligence, the data room, contracts, and
          closing. Pick the tier that matches how your team runs deals.
        </p>
      </div>

      <div className={'mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3'}>
        {pricingTiers.map((tier) => (
          <Card
            key={tier.id}
            className={`flex flex-col ${tier.featured ? 'border-primary' : ''}`}
          >
            <CardHeader>
              <div className={'flex items-center justify-between gap-2'}>
                <CardTitle>{tier.name}</CardTitle>
                {tier.featured ? <Badge>Most popular</Badge> : null}
              </div>
              <CardDescription>{tier.tagline}</CardDescription>
            </CardHeader>

            <CardContent className={'flex flex-1 flex-col justify-end'}>
              <TierPrice tier={tier} />
            </CardContent>

            <CardFooter>
              <Button
                asChild
                variant={tier.featured ? 'default' : 'outline'}
                className={'w-full'}
              >
                <Link href={tier.cta.href}>{tier.cta.label}</Link>
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      <div className={'mt-16 flex flex-col gap-4'}>
        <h2 className={'text-2xl font-bold'}>Compare every tier</h2>
        <div className={'overflow-x-auto'}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Capability</TableHead>
                {pricingTiers.map((tier) => (
                  <TableHead key={tier.id}>{tier.name}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {featureRows.map((row) => (
                <TableRow key={row.label}>
                  <TableCell className={'font-medium'}>{row.label}</TableCell>
                  {pricingTiers.map((tier) => (
                    <TableCell key={tier.id}>
                      <MatrixCell value={row.values[tier.id]} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className={'text-muted-foreground text-sm'}>
          Prices and limits marked TBD or Placeholder are not final and will be
          set before launch.
        </p>
      </div>
    </section>
  );
}
