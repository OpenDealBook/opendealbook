'use server';

import { appendDealEvent } from '@odb/events';
import { refusableAction } from '@odb/lender-rooms/actions/refusable-action.ts';
import type { Json } from '@odb/supabase';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { setUpLoiSigned } from './loi-signed-setup';
import { throwAsMilestoneRefusal } from './milestone-refusal';
import { removeMilestoneSchema, setMilestoneSchema } from './schema';

async function appendMilestoneEvent(input: {
  dealId: string;
  aggregateId: string;
  eventType: 'deal_milestone.set' | 'deal_milestone.removed';
  payload: Json;
}) {
  try {
    const client = getSupabaseServerClient();

    await appendDealEvent(client, {
      ...input,
      aggregateType: 'deal_milestone',
    });
    await client
      .rpc('recompute_checklist_due_dates', { p_deal_id: input.dealId })
      .throwOnError();
  } catch (error) {
    throwAsMilestoneRefusal(error);
  }
}

export const setMilestone = refusableAction(
  async ({ dealId, milestoneId, targetOn, actualOn, ...milestone }, user) => {
    await appendMilestoneEvent({
      dealId,
      aggregateId: milestoneId,
      eventType: 'deal_milestone.set',
      payload: { ...milestone, target_on: targetOn, actual_on: actualOn },
    });

    if (milestone.kind === 'loi_signed' && actualOn !== null) {
      await setUpLoiSigned(
        getSupabaseServerClient(),
        { dealId, signedOn: actualOn },
        { actor: {}, createdBy: user.id },
      );
    }
  },
  { schema: setMilestoneSchema },
);

export const removeMilestone = refusableAction(
  ({ dealId, milestoneId }) =>
    appendMilestoneEvent({
      dealId,
      aggregateId: milestoneId,
      eventType: 'deal_milestone.removed',
      payload: {},
    }),
  { schema: removeMilestoneSchema },
);
