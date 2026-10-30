'use server';

import type { PostgrestError } from '@supabase/supabase-js';

import { z } from 'zod';

import { enhanceAction } from '@odb/next/actions';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { contractTypeSchema } from '../types';
import { visibleVersion } from '../versioning/queries';
import {
  CANNOT_CHANGE_REVIEW_GATE,
  CANNOT_CHANGE_TEAM_REVIEW_GATE,
  CANNOT_OVERRIDE_SIGNING,
  CANNOT_REVIEW,
  SELLER_HAS_COUNSEL,
} from './refusals';

type Outcome = { ok: true } | { ok: false; refusal: string };

const refused = (refusal: string): Outcome => ({ ok: false, refusal });

function outcomeOf(error: PostgrestError | null, refusal: string): Outcome {
  if (error?.message.startsWith('new row violates row-level security')) {
    return refused(refusal);
  }

  if (error) {
    throw error;
  }

  return { ok: true };
}

const verdict = z.object({
  contractVersionId: z.uuid(),
  decision: z.enum(['approved', 'changes_needed', 'approved_with_comments']),
  note: z.string().trim().min(1).optional(),
});

const gate = {
  type: contractTypeSchema.exclude(['loi_extension']),
  required: z.boolean(),
};

export const requestContractReview = enhanceAction(
  async (input) => {
    const client = getSupabaseServerClient();
    const version = await visibleVersion(client, input.contractVersionId);

    if (!version) {
      return refused(CANNOT_REVIEW);
    }

    const { error } = await client.from('contract_review_request').insert({
      account_id: version.accountId,
      contract_version_id: input.contractVersionId,
    });

    return outcomeOf(error, CANNOT_REVIEW);
  },
  { auth: true, schema: z.object({ contractVersionId: z.uuid() }) },
);

export const decideContractReview = enhanceAction(
  async (input, user) => {
    const client = getSupabaseServerClient();
    const version = await visibleVersion(client, input.contractVersionId);

    if (!version) {
      return refused(CANNOT_REVIEW);
    }

    const decision = {
      account_id: version.accountId,
      contract_version_id: input.contractVersionId,
      decision: input.decision,
      note: input.note,
      decided_by: user.id,
    };

    for (const side of ['buyer', 'seller'] as const) {
      const { data: isCounsel } = await client
        .rpc('is_deal_counsel', { deal_id: version.dealId, side })
        .throwOnError();

      if (isCounsel) {
        const { error } = await client
          .from('contract_review_decision')
          .insert({ ...decision, side, without_counsel: false });

        return outcomeOf(error, CANNOT_REVIEW);
      }
    }

    const { error } = await client
      .from('contract_review_decision')
      .insert({ ...decision, side: 'buyer', without_counsel: true });

    return outcomeOf(error, CANNOT_REVIEW);
  },
  { auth: true, schema: verdict },
);

// The seller is not on the team and the seller side has no insert policy, so
// the decision is written with the service role once the seller is proven.
export const sellerConfirmContractReview = enhanceAction(
  async (input, user) => {
    const client = getSupabaseServerClient();
    const admin = getSupabaseServerAdminClient();
    // Service role: a closed room hides its contracts from the seller. The
    // reason is given only to someone on the seller side of that deal.
    const { data: ofDeal } = await admin
      .from('contract_version')
      .select('contract!inner(deal_id)')
      .eq('id', input.contractVersionId)
      .maybeSingle()
      .throwOnError();
    const { data: readOnlyReason } = ofDeal
      ? await client
          .rpc('seller_side_read_only_reason', {
            deal_id: ofDeal.contract.deal_id,
          })
          .throwOnError()
      : { data: null };

    if (readOnlyReason) {
      return refused(readOnlyReason);
    }

    const version = await visibleVersion(client, input.contractVersionId);

    if (!version) {
      return refused(CANNOT_REVIEW);
    }

    const { data: isSeller } = await client
      .rpc('is_deal_seller_room_member', { deal_id: version.dealId })
      .throwOnError();

    if (!isSeller) {
      return refused(CANNOT_REVIEW);
    }

    const { data: sellerCounsel } = await admin
      .from('deal_counsel')
      .select('id')
      .eq('deal_id', version.dealId)
      .eq('side', 'seller')
      .throwOnError();

    if (sellerCounsel.length > 0) {
      return refused(SELLER_HAS_COUNSEL);
    }

    await admin
      .from('contract_review_decision')
      .insert({
        account_id: version.accountId,
        contract_version_id: input.contractVersionId,
        side: 'seller',
        decision: input.decision,
        note: input.note,
        decided_by: user.id,
        without_counsel: true,
      })
      .throwOnError();

    return { ok: true } as const;
  },
  { auth: true, schema: verdict },
);

export const overrideContractSigning = enhanceAction(
  async (input) => {
    const client = getSupabaseServerClient();
    const version = await visibleVersion(client, input.contractVersionId);

    if (!version) {
      return refused(CANNOT_OVERRIDE_SIGNING);
    }

    const { error } = await client.from('contract_signing_override').insert({
      account_id: version.accountId,
      contract_version_id: input.contractVersionId,
      reason: input.reason,
    });

    return outcomeOf(error, CANNOT_OVERRIDE_SIGNING);
  },
  {
    auth: true,
    schema: z.object({
      contractVersionId: z.uuid(),
      reason: z.string().trim().min(1),
    }),
  },
);

export const setDealReviewGate = enhanceAction(
  async (input) => {
    const client = getSupabaseServerClient();
    const { data: deal } = await client
      .from('deal')
      .select('account_id')
      .eq('id', input.dealId)
      .maybeSingle()
      .throwOnError();

    if (!deal) {
      return refused(CANNOT_CHANGE_REVIEW_GATE);
    }

    const { data: required } = await client
      .rpc('contract_review_required', {
        deal_id: input.dealId,
        contract_type: input.type,
      })
      .throwOnError();

    if (required === input.required) {
      return { ok: true } as const;
    }

    const { error } = await client
      .from('deal_contract_review_gate_change')
      .insert({
        account_id: deal.account_id,
        deal_id: input.dealId,
        contract_type: input.type,
        required: input.required,
      });

    return outcomeOf(error, CANNOT_CHANGE_REVIEW_GATE);
  },
  { auth: true, schema: z.object({ dealId: z.uuid(), ...gate }) },
);

export const setTeamReviewGate = enhanceAction(
  async (input) => {
    const client = getSupabaseServerClient();
    const { data: required } = await client
      .rpc('contract_review_team_required', {
        account_id: input.accountId,
        contract_type: input.type,
      })
      .throwOnError();

    if (required === input.required) {
      return { ok: true } as const;
    }

    const { error } = await client
      .from('contract_review_gate_default_change')
      .insert({
        account_id: input.accountId,
        contract_type: input.type,
        required: input.required,
      });

    return outcomeOf(error, CANNOT_CHANGE_TEAM_REVIEW_GATE);
  },
  { auth: true, schema: z.object({ accountId: z.uuid(), ...gate }) },
);
