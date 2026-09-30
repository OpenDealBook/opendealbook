import type { Plan } from '@odb/billing';

import appConfig from '~/config/app.config';
import billingConfig from '~/config/billing.config';

type TierPrice =
  | { kind: 'billed'; currency: string; monthly: number; yearly: number }
  | { kind: 'placeholder'; label: string }
  | { kind: 'contact'; label: string };

type TierCta = { label: string; href: string };

type TierId = 'operator' | 'deal-team' | 'enterprise';

export type PricingTier = {
  id: TierId;
  name: string;
  tagline: string;
  price: TierPrice;
  cta: TierCta;
  featured: boolean;
};

type MatrixValue = boolean | string;

export type FeatureRow = {
  label: string;
  values: Record<TierId, MatrixValue>;
};

function planTotal(plan: Plan) {
  return plan.lineItems.reduce((total, lineItem) => total + lineItem.cost, 0);
}

const dealTeamProduct = billingConfig.products[0]!;
const monthlyPlan = dealTeamProduct.plans.find(
  (plan) => plan.interval === 'month',
);
const yearlyPlan = dealTeamProduct.plans.find(
  (plan) => plan.interval === 'year',
);

const dealTeamPrice: TierPrice =
  monthlyPlan && yearlyPlan
    ? {
        kind: 'billed',
        currency: dealTeamProduct.currency,
        monthly: planTotal(monthlyPlan),
        yearly: planTotal(yearlyPlan),
      }
    : { kind: 'placeholder', label: 'Price TBD' };

export const pricingTiers: PricingTier[] = [
  {
    id: 'operator',
    name: 'Operator',
    tagline: 'For the independent sponsor running acquisitions on their own.',
    price: { kind: 'placeholder', label: 'Price TBD' },
    cta: { label: 'Talk to sales', href: '/contact' },
    featured: false,
  },
  {
    id: 'deal-team',
    name: 'Deal Team',
    tagline: 'For the corp-dev team running a shared acquisition pipeline.',
    price: dealTeamPrice,
    cta: { label: 'Start 30-day trial', href: '/auth/sign-up' },
    featured: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline:
      'For acquirers running roll-ups at scale who need self-hosting and SSO.',
    price: { kind: 'contact', label: 'Contact us' },
    cta: { label: 'Talk to sales', href: '/contact' },
    featured: false,
  },
];

export const featureRows: FeatureRow[] = [
  {
    label: 'Deal pipeline',
    values: { operator: true, 'deal-team': true, enterprise: true },
  },
  {
    label: 'Diligence checklists',
    values: { operator: true, 'deal-team': true, enterprise: true },
  },
  {
    label: 'Secure data room',
    values: { operator: true, 'deal-team': true, enterprise: true },
  },
  {
    label: 'Comparables',
    values: { operator: true, 'deal-team': true, enterprise: true },
  },
  {
    label: 'DSCR underwriting',
    values: { operator: true, 'deal-team': true, enterprise: true },
  },
  {
    label: 'Seats',
    values: { operator: '1', 'deal-team': 'TBD', enterprise: 'Custom' },
  },
  {
    label: 'Self-hosting',
    values: { operator: false, 'deal-team': false, enterprise: true },
  },
  {
    label: 'SSO and SAML',
    values: { operator: false, 'deal-team': false, enterprise: true },
  },
  {
    label: 'Support',
    values: {
      operator: 'Email',
      'deal-team': 'Priority',
      enterprise: 'Dedicated (TBD)',
    },
  },
];

const inStock = 'https://schema.org/InStock';
const pricingUrl = `${appConfig.url}/pricing`;
const contactUrl = `${appConfig.url}/contact`;

function tierOffers(tier: PricingTier) {
  if (tier.price.kind === 'billed') {
    return [
      {
        '@type': 'Offer',
        name: `${tier.name} monthly`,
        priceCurrency: tier.price.currency,
        price: String(tier.price.monthly),
        url: pricingUrl,
        availability: inStock,
      },
      {
        '@type': 'Offer',
        name: `${tier.name} yearly`,
        priceCurrency: tier.price.currency,
        price: String(tier.price.yearly),
        url: pricingUrl,
        availability: inStock,
      },
    ];
  }

  return [
    {
      '@type': 'Offer',
      name: tier.name,
      url: contactUrl,
      availability: inStock,
    },
  ];
}

export function pricingOfferSchema() {
  const offers = pricingTiers.flatMap(tierOffers);
  const billedPrices = pricingTiers.flatMap((tier) =>
    tier.price.kind === 'billed'
      ? [tier.price.monthly, tier.price.yearly]
      : [],
  );

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: appConfig.name,
    description: dealTeamProduct.description,
    url: pricingUrl,
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: dealTeamProduct.currency,
      lowPrice: String(Math.min(...billedPrices)),
      highPrice: String(Math.max(...billedPrices)),
      offerCount: offers.length,
      offers,
    },
  };
}
