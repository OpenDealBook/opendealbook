'use server';

import {
  type DealEventInput,
  appendDealEvent,
  appendDealEvents,
} from '@odb/events';
import { enhanceAction } from '@odb/next/actions';
import type { Json } from '@odb/supabase';
import { getSupabaseServerClient } from '@odb/supabase/server';

import {
  addOfferVersionSchema,
  createOfferSchema,
  offerIdSchema,
  type OfferAuthorSide,
  type OfferVersion,
} from '../schema/offer.schema';

type ServerClient = ReturnType<typeof getSupabaseServerClient>;

const TERMINAL_OFFER_STATUSES = [
  'accepted',
  'rejected',
  'withdrawn',
  'expired',
];

async function loadOffer(client: ServerClient, offerId: string) {
  const { data } = await client
    .from('offer')
    .select('deal_id, status, current_version_id')
    .eq('id', offerId)
    .single()
    .throwOnError();

  return data;
}

function assertOfferOpen(status: string) {
  if (TERMINAL_OFFER_STATUSES.includes(status)) {
    throw new Error('Offer is already resolved');
  }
}

function versionAddedPayload(
  version: OfferVersion,
  versionId: string,
  number: number,
  authorSide: OfferAuthorSide,
): Json {
  return {
    version_id: versionId,
    number,
    author_side: authorSide,
    purchase_price: version.purchase_price,
    real_estate_portion: version.real_estate_portion ?? null,
    target_close_date: version.target_close_date ?? null,
    offer_expires_at: version.offer_expires_at ?? null,
    exclusivity_days: version.exclusivity_days ?? null,
    diligence_days: version.diligence_days ?? null,
    calc_version_id: version.calc_version_id ?? null,
    approved_by: version.approved_by ?? null,
    approved_at: version.approved_at ?? null,
    terms: version.terms as unknown as Json,
  };
}

export const createOffer = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();

    const { data: existing } = await client
      .from('offer')
      .select('id')
      .eq('deal_id', data.deal_id)
      .maybeSingle();

    if (existing) {
      throw new Error('Deal already has an offer');
    }

    const offerId = crypto.randomUUID();
    const versionId = crypto.randomUUID();

    await appendDealEvents(client, data.deal_id, [
      {
        aggregateType: 'offer',
        aggregateId: offerId,
        eventType: 'offer.drafted',
        payload: {},
      },
      {
        aggregateType: 'offer',
        aggregateId: offerId,
        eventType: 'offer.version_added',
        payload: versionAddedPayload(data.first_version, versionId, 1, 'buyer'),
      },
    ]);

    return offerId;
  },
  { auth: true, schema: createOfferSchema },
);

export const addOfferVersion = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();
    const offer = await loadOffer(client, data.offer_id);

    const { data: latest } = await client
      .from('offer_version')
      .select('number')
      .eq('offer_id', data.offer_id)
      .order('number', { ascending: false })
      .limit(1)
      .maybeSingle();

    const versionId = crypto.randomUUID();
    const number = (latest?.number ?? 0) + 1;

    const events: DealEventInput[] = [
      {
        aggregateType: 'offer',
        aggregateId: data.offer_id,
        eventType: 'offer.version_added',
        payload: versionAddedPayload(
          data.version,
          versionId,
          number,
          data.author_side,
        ),
      },
    ];

    if (data.author_side === 'seller') {
      events.push({
        aggregateType: 'offer',
        aggregateId: data.offer_id,
        eventType: 'offer.countered',
        payload: {},
      });
    }

    await appendDealEvents(client, offer.deal_id, events);

    return versionId;
  },
  { auth: true, schema: addOfferVersionSchema },
);

export const submitOffer = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();
    const offer = await loadOffer(client, data.offer_id);
    assertOfferOpen(offer.status);

    await appendDealEvents(client, offer.deal_id, [
      {
        aggregateType: 'offer',
        aggregateId: data.offer_id,
        eventType: 'offer.submitted',
        payload: {},
      },
      {
        aggregateType: 'deal',
        aggregateId: offer.deal_id,
        eventType: 'deal.stage_changed',
        payload: { stage: 'loi_submitted' },
      },
    ]);

    return { success: true };
  },
  { auth: true, schema: offerIdSchema },
);

export const acceptOffer = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();
    const offer = await loadOffer(client, data.offer_id);
    assertOfferOpen(offer.status);

    const contractId = crypto.randomUUID();

    await appendDealEvents(client, offer.deal_id, [
      {
        aggregateType: 'offer',
        aggregateId: data.offer_id,
        eventType: 'offer.accepted',
        payload: {},
      },
      {
        aggregateType: 'deal',
        aggregateId: offer.deal_id,
        eventType: 'deal.stage_changed',
        payload: { stage: 'loi_accepted' },
      },
      {
        aggregateType: 'contract',
        aggregateId: contractId,
        eventType: 'contract.created',
        payload: {
          type: 'loi',
          status: 'draft',
          current_version: 0,
          source_offer_version_id: offer.current_version_id,
        },
      },
    ]);

    return { success: true };
  },
  { auth: true, schema: offerIdSchema },
);

function offerStatusAction(
  eventType: 'offer.rejected' | 'offer.withdrawn' | 'offer.expired',
) {
  return enhanceAction(
    async (data) => {
      const client = getSupabaseServerClient();
      const offer = await loadOffer(client, data.offer_id);
      assertOfferOpen(offer.status);

      await appendDealEvent(client, {
        dealId: offer.deal_id,
        aggregateType: 'offer',
        aggregateId: data.offer_id,
        eventType,
        payload: {},
      });

      return { success: true };
    },
    { auth: true, schema: offerIdSchema },
  );
}

export const rejectOffer = offerStatusAction('offer.rejected');
export const withdrawOffer = offerStatusAction('offer.withdrawn');
export const expireOffer = offerStatusAction('offer.expired');
