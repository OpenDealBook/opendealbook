'use server';

import type { PostgrestError } from '@supabase/supabase-js';

import {
  type DealEventInput,
  appendDealEvent,
  appendDealEvents,
} from '@odb/events';
import type { Json } from '@odb/supabase';
import { getSupabaseServerClient } from '@odb/supabase/server';

import {
  addOfferVersionSchema,
  createOfferSchema,
  offerIdSchema,
  type OfferAuthorSide,
  type OfferVersion,
} from '../schema/offer.schema';
import { Refusal, refusableAction } from './refusal';

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

export const createOffer = refusableAction(
  async (data) => {
    const client = getSupabaseServerClient();

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
    ]).catch((error: PostgrestError) => {
      if (
        error.code === '23505' &&
        error.message.includes('"ux_offer_live_per_deal"')
      ) {
        throw new Refusal('Deal already has a live offer');
      }
      throw error;
    });

    return offerId;
  },
  createOfferSchema,
  { what: 'draft offers', needs: 'deals.work' },
);

export const addOfferVersion = refusableAction(
  async (data) => {
    const client = getSupabaseServerClient();
    const offer = await loadOffer(client, data.offer_id);
    assertOfferOpen(offer.status);

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
  addOfferVersionSchema,
  { what: 'revise offers', needs: 'deals.work' },
);

export const submitOffer = refusableAction(
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
  offerIdSchema,
  { what: 'submit offers', needs: 'deals.manage' },
);

export const acceptOffer = refusableAction(
  async (data) => {
    const client = getSupabaseServerClient();
    const offer = await loadOffer(client, data.offer_id);
    assertOfferOpen(offer.status);

    await appendDealEvent(client, {
      dealId: offer.deal_id,
      aggregateType: 'offer',
      aggregateId: data.offer_id,
      eventType: 'offer.accepted',
      payload: {},
    });

    return { success: true };
  },
  offerIdSchema,
  { what: 'accept offers', needs: 'deals.manage' },
);

async function stageBeforeFirstSubmit(
  client: ServerClient,
  dealId: string,
  offerId: string,
): Promise<string | null> {
  const { data: submitted } = await client
    .from('deal_event')
    .select('deal_seq')
    .eq('aggregate_type', 'offer')
    .eq('aggregate_id', offerId)
    .eq('event_type', 'offer.submitted')
    .order('deal_seq', { ascending: true })
    .limit(1)
    .maybeSingle()
    .throwOnError();

  if (submitted === null) {
    return null;
  }

  const { data: prior } = await client
    .from('deal_event')
    .select('payload')
    .eq('deal_id', dealId)
    .eq('aggregate_type', 'deal')
    .in('event_type', ['deal.created', 'deal.stage_changed'])
    .lt('deal_seq', submitted.deal_seq)
    .order('deal_seq', { ascending: false })
    .limit(1)
    .single()
    .throwOnError();

  // deal.created without a stage projects as 'sourcing' (project_deal).
  return (prior.payload as { stage?: string }).stage ?? 'sourcing';
}

function offerStatusAction(
  eventType: 'offer.rejected' | 'offer.withdrawn' | 'offer.expired',
) {
  return refusableAction(
    async (data) => {
      const client = getSupabaseServerClient();
      const offer = await loadOffer(client, data.offer_id);
      assertOfferOpen(offer.status);

      const { data: deal } = await client
        .from('deal')
        .select('stage')
        .eq('id', offer.deal_id)
        .single()
        .throwOnError();

      const events: DealEventInput[] = [
        {
          aggregateType: 'offer',
          aggregateId: data.offer_id,
          eventType,
          payload: {},
        },
      ];

      const restoredStage =
        deal.stage === 'loi_submitted'
          ? await stageBeforeFirstSubmit(client, offer.deal_id, data.offer_id)
          : null;

      if (restoredStage !== null) {
        events.push({
          aggregateType: 'deal',
          aggregateId: offer.deal_id,
          eventType: 'deal.stage_changed',
          payload: { stage: restoredStage },
        });
      }

      await appendDealEvents(client, offer.deal_id, events);

      return { success: true };
    },
    offerIdSchema,
    { what: 'update offers', needs: 'deals.manage' },
  );
}

export const rejectOffer = offerStatusAction('offer.rejected');
export const withdrawOffer = offerStatusAction('offer.withdrawn');
export const expireOffer = offerStatusAction('offer.expired');
