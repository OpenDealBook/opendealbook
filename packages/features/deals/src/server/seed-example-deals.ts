import {
  type ActorKind,
  type DealEventInput,
  appendDealEvents,
} from '@odb/events';
import type { Database, Json } from '@odb/supabase';
import { getSupabaseServerAdminClient } from '@odb/supabase/server';

import { offerTermsSchema } from '../schema/offer.schema';

type AdminClient = ReturnType<typeof getSupabaseServerAdminClient>;

const SERVICE_ACTOR: ActorKind = 'service';

const EXAMPLE_CAPTURE_METHOD = 'example';

interface ExampleOffer {
  reachedStatus: 'submitted' | 'accepted';
  terms: unknown;
}

interface ExampleDeal {
  description: string;
  source: Database['public']['Enums']['deal_source'];
  stage: string;
  askingPrice: number;
  revenueTtm: number;
  sdeTtm: number;
  ebitdaTtm: number;
  yearEstablished: number;
  locationRaw: string;
  employeeBand: string;
  website: string;
  financials?: { adoptedRevenue: number; adoptedSde: number; adoptedEbitda: number };
  offer?: ExampleOffer;
  resolution?: { resolution: 'won'; resolutionReason: 'closed' };
}

const EXAMPLE_DEALS: ExampleDeal[] = [
  {
    description:
      'Example: Harborview Tax & Advisory, a boutique tax and advisory practice in Portland, OR',
    source: 'broker',
    stage: 'nda_signed',
    askingPrice: 1_050_000,
    revenueTtm: 920_000,
    sdeTtm: 342_000,
    ebitdaTtm: 305_000,
    yearEstablished: 2004,
    locationRaw: 'Portland, OR',
    employeeBand: '6-10',
    website: 'https://harborviewtax.example.com',
  },
  {
    description:
      'Example: Cedar Peak CPAs, a tax and accounting firm serving closely held businesses in Boise, ID',
    source: 'marketplace',
    stage: 'loi_submitted',
    askingPrice: 1_600_000,
    revenueTtm: 1_400_000,
    sdeTtm: 492_000,
    ebitdaTtm: 430_000,
    yearEstablished: 1998,
    locationRaw: 'Boise, ID',
    employeeBand: '11-20',
    website: 'https://cedarpeakcpas.example.com',
    offer: {
      reachedStatus: 'submitted',
      terms: {
        purchase_price: 1_550_000,
        target_close_date: '2026-03-15',
        offer_expires_at: '2026-01-31T23:59:59.000Z',
        exclusivity_days: 30,
        diligence_days: 45,
        funding_sources: [
          { type: 'sba_7a', amount: 1_200_000, pct: 77.4, rate: 11.5, term_years: 10 },
          { type: 'cash_equity', amount: 200_000, pct: 12.9 },
          {
            type: 'seller_financing',
            amount: 150_000,
            pct: 9.7,
            rate: 7,
            term_years: 5,
            standby_months: 24,
          },
        ],
      },
    },
  },
  {
    description:
      'Example: Summit Ledger Group, a full-service CPA and advisory firm in Denver, CO',
    source: 'referral',
    stage: 'pa_submitted',
    askingPrice: 2_500_000,
    revenueTtm: 2_300_000,
    sdeTtm: 782_000,
    ebitdaTtm: 690_000,
    yearEstablished: 1991,
    locationRaw: 'Denver, CO',
    employeeBand: '21-50',
    website: 'https://summitledger.example.com',
    financials: {
      adoptedRevenue: 2_300_000,
      adoptedSde: 782_000,
      adoptedEbitda: 690_000,
    },
    offer: {
      reachedStatus: 'accepted',
      terms: {
        purchase_price: 2_450_000,
        target_close_date: '2026-02-20',
        offer_expires_at: '2026-01-20T23:59:59.000Z',
        exclusivity_days: 45,
        diligence_days: 60,
        funding_sources: [
          { type: 'sba_7a', amount: 1_900_000, pct: 77.6, rate: 11, term_years: 10 },
          { type: 'cash_equity', amount: 350_000, pct: 14.3 },
          { type: 'seller_financing', amount: 200_000, pct: 8.2, rate: 6.5, term_years: 5 },
        ],
      },
    },
  },
  {
    description:
      'Example: Riverstone Accounting Partners, an established tax and bookkeeping firm in Nashville, TN',
    source: 'outreach',
    stage: 'pa_accepted',
    askingPrice: 2_000_000,
    revenueTtm: 1_800_000,
    sdeTtm: 648_000,
    ebitdaTtm: 575_000,
    yearEstablished: 1986,
    locationRaw: 'Nashville, TN',
    employeeBand: '11-20',
    website: 'https://riverstoneaccounting.example.com',
    financials: {
      adoptedRevenue: 1_800_000,
      adoptedSde: 648_000,
      adoptedEbitda: 575_000,
    },
    offer: {
      reachedStatus: 'accepted',
      terms: {
        purchase_price: 1_975_000,
        target_close_date: '2025-11-10',
        offer_expires_at: '2025-10-15T23:59:59.000Z',
        exclusivity_days: 30,
        diligence_days: 45,
        funding_sources: [
          { type: 'conventional', amount: 1_380_000, pct: 69.9, rate: 9.25, term_years: 7 },
          { type: 'cash_equity', amount: 395_000, pct: 20 },
          { type: 'seller_financing', amount: 200_000, pct: 10.1, rate: 6, term_years: 5 },
        ],
      },
    },
    resolution: { resolution: 'won', resolutionReason: 'closed' },
  },
];

function buildDealEvents(
  deal: ExampleDeal,
  accountId: string,
  userId: string,
): { dealId: string; events: DealEventInput[] } {
  const dealId = crypto.randomUUID();

  const events: DealEventInput[] = [
    {
      aggregateType: 'deal',
      aggregateId: dealId,
      eventType: 'deal.created',
      actorKind: SERVICE_ACTOR,
      payload: {
        account_id: accountId,
        owner_user_id: userId,
        description: deal.description,
        source: deal.source,
        stage: 'sourcing',
        capture_method: EXAMPLE_CAPTURE_METHOD,
        asking_price: deal.askingPrice,
        revenue_ttm: deal.revenueTtm,
        sde_ttm: deal.sdeTtm,
        ebitda_ttm: deal.ebitdaTtm,
        year_established: deal.yearEstablished,
        location_raw: deal.locationRaw,
        employee_band: deal.employeeBand,
        website: deal.website,
      },
    },
    {
      aggregateType: 'deal',
      aggregateId: dealId,
      eventType: 'deal.stage_changed',
      actorKind: SERVICE_ACTOR,
      payload: { stage: deal.stage },
    },
  ];

  if (deal.financials) {
    events.push({
      aggregateType: 'deal',
      aggregateId: dealId,
      eventType: 'deal.financials_adopted',
      actorKind: SERVICE_ACTOR,
      payload: {
        adopted_revenue: deal.financials.adoptedRevenue,
        adopted_sde: deal.financials.adoptedSde,
        adopted_ebitda: deal.financials.adoptedEbitda,
        source_calc_version_id: null,
      },
    });
  }

  if (deal.offer) {
    const terms = offerTermsSchema.parse(deal.offer.terms);
    const offerId = crypto.randomUUID();
    const versionId = crypto.randomUUID();

    const versionPayload: Json = {
      version_id: versionId,
      number: 1,
      author_side: 'buyer',
      purchase_price: terms.purchase_price,
      target_close_date: terms.target_close_date ?? null,
      offer_expires_at: terms.offer_expires_at ?? null,
      exclusivity_days: terms.exclusivity_days ?? null,
      diligence_days: terms.diligence_days ?? null,
      calc_version_id: null,
      terms: terms as unknown as Json,
    };

    events.push(
      {
        aggregateType: 'offer',
        aggregateId: offerId,
        eventType: 'offer.drafted',
        actorKind: SERVICE_ACTOR,
        payload: {},
      },
      {
        aggregateType: 'offer',
        aggregateId: offerId,
        eventType: 'offer.version_added',
        actorKind: SERVICE_ACTOR,
        payload: versionPayload,
      },
      {
        aggregateType: 'offer',
        aggregateId: offerId,
        eventType: 'offer.submitted',
        actorKind: SERVICE_ACTOR,
        payload: {},
      },
    );

    if (deal.offer.reachedStatus === 'accepted') {
      events.push({
        aggregateType: 'offer',
        aggregateId: offerId,
        eventType: 'offer.accepted',
        actorKind: SERVICE_ACTOR,
        payload: {},
      });
    }
  }

  if (deal.resolution) {
    events.push({
      aggregateType: 'deal',
      aggregateId: dealId,
      eventType: 'deal.resolved',
      actorKind: SERVICE_ACTOR,
      payload: {
        resolution: deal.resolution.resolution,
        resolution_reason: deal.resolution.resolutionReason,
      },
    });
  }

  return { dealId, events };
}

export async function seedExampleDeals(params: {
  accountId: string;
  userId: string;
  client?: AdminClient;
}): Promise<void> {
  const client = params.client ?? getSupabaseServerAdminClient();

  const { count } = await client
    .from('deal')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', params.accountId);

  if ((count ?? 0) > 0) {
    return;
  }

  for (const deal of EXAMPLE_DEALS) {
    const { dealId, events } = buildDealEvents(
      deal,
      params.accountId,
      params.userId,
    );
    await appendDealEvents(client, dealId, events);
  }
}
