'use server';

import { z } from 'zod';

import { applyChecklistTemplateTo } from '@odb/deal-timeline/checklist-template.ts';
import { setUpLoiSigned } from '@odb/deal-timeline/loi-signed-setup.ts';
import {
  appendDealEvent,
  appendDealEvents,
  type DealMilestoneSetPayload,
} from '@odb/events';
import {
  type Denied,
  refusableAction,
} from '@odb/next/actions/refusable-action';
import { Refusal } from '@odb/next/refusal';
import { getSupabaseServerClient } from '@odb/supabase/server';

const CHECK_VIOLATION = '23514';

const scheduleChange: Denied<unknown> = {
  what: "change this deal's schedule",
  needs: 'checklists.manage',
};

const dealScheduleChange: Denied<{ dealId: string }> = {
  ...scheduleChange,
  dealId: (input) => input.dealId,
};

const scheduleIdSchema = z.object({ scheduleId: z.uuid() });

export const proposeSchedule = refusableAction(
  async (input) => {
    const client = getSupabaseServerClient();

    const { data } = await client
      .from('diligence_schedule')
      .update({ status: 'proposed' })
      .eq('id', input.scheduleId)
      .select('*')
      .single()
      .throwOnError();

    return data;
  },
  scheduleIdSchema,
  scheduleChange,
);

export const acceptSchedule = refusableAction(
  async (input) => {
    const client = getSupabaseServerClient();

    const { data } = await client
      .from('diligence_schedule')
      .update({ status: 'active' })
      .eq('id', input.scheduleId)
      .select('*')
      .single()
      .throwOnError();

    return data;
  },
  scheduleIdSchema,
  scheduleChange,
);

const assignItemToWeekSchema = z.object({
  checklistItemId: z.uuid(),
  weekId: z.uuid(),
});

export const assignItemToWeek = refusableAction(
  async (input) => {
    const client = getSupabaseServerClient();

    const { data: item } = await client
      .from('checklist_item')
      .select('deal_id')
      .eq('id', input.checklistItemId)
      .single()
      .throwOnError();

    return appendDealEvent(client, {
      dealId: item.deal_id,
      aggregateType: 'checklist_item',
      aggregateId: input.checklistItemId,
      eventType: 'checklist_item.rescheduled',
      payload: { schedule_week_id: input.weekId },
    });
  },
  assignItemToWeekSchema,
  scheduleChange,
);

const slipUnreceivedSchema = z.object({ weekId: z.uuid() });

export const slipUnreceived = refusableAction(
  async (input) => {
    const client = getSupabaseServerClient();

    const { data: week } = await client
      .from('schedule_week')
      .select('schedule_id, week_no')
      .eq('id', input.weekId)
      .single()
      .throwOnError();

    const { data: nextWeek } = await client
      .from('schedule_week')
      .select('id')
      .eq('schedule_id', week.schedule_id)
      .eq('week_no', week.week_no! + 1)
      .single()
      .throwOnError();

    const { data: schedule } = await client
      .from('diligence_schedule')
      .select('deal_id')
      .eq('id', week.schedule_id)
      .single()
      .throwOnError();

    const { data: slipped } = await client
      .from('checklist_item')
      .select('id')
      .eq('schedule_week_id', input.weekId)
      .in('status', ['not_started', 'requested'])
      .throwOnError();

    await appendDealEvents(
      client,
      schedule.deal_id,
      slipped.map((item) => ({
        aggregateType: 'checklist_item',
        aggregateId: item.id,
        eventType: 'checklist_item.rescheduled',
        payload: { schedule_week_id: nextWeek.id },
      })),
    );

    await client
      .from('schedule_week')
      .update({ status: 'slipped' })
      .eq('id', input.weekId)
      .throwOnError();

    return slipped;
  },
  slipUnreceivedSchema,
  scheduleChange,
);

const sellerWeekViewSchema = z.object({
  dealId: z.uuid(),
  weekNo: z.number().int(),
});

export const sellerWeekView = refusableAction(
  async (input) => {
    const client = getSupabaseServerClient();

    const { data: schedule } = await client
      .from('diligence_schedule')
      .select('id')
      .eq('deal_id', input.dealId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
      .throwOnError();

    const { data: week } = await client
      .from('schedule_week')
      .select('*')
      .eq('schedule_id', schedule.id)
      .eq('week_no', input.weekNo)
      .single()
      .throwOnError();

    const { data: items } = await client
      .from('checklist_item')
      .select('*')
      .eq('schedule_week_id', week.id)
      .throwOnError();

    const { data: questions } = await client
      .from('seller_question')
      .select('*')
      .eq('schedule_week_id', week.id)
      .throwOnError();

    return { week, items, questions };
  },
  sellerWeekViewSchema,
);

const scheduleFromTemplateSchema = z.object({
  dealId: z.uuid(),
  templateId: z.uuid(),
  startDate: z.iso.date(),
});

export const scheduleFromTemplate = refusableAction(
  async (input, user) => {
      const client = getSupabaseServerClient();

      await applyChecklistTemplateTo(client, {
        dealId: input.dealId,
        templateId: input.templateId,
      });
      await client
        .rpc('create_diligence_schedule', {
          p_deal_id: input.dealId,
          p_start_date: input.startDate,
          p_template_id: input.templateId,
          p_created_by: user.id,
        })
        .throwOnError();
    },
  scheduleFromTemplateSchema,
  dealScheduleChange,
);

const scheduleFromLoiSignedSchema = z.object({
  dealId: z.uuid(),
  signedOn: z.iso.date(),
});

export const scheduleFromLoiSigned = refusableAction(
  async (input, user) => {
      const client = getSupabaseServerClient();
      const { data: existing } = await client
        .from('deal_milestone')
        .select('id, target_on, shared')
        .eq('deal_id', input.dealId)
        .eq('kind', 'loi_signed')
        .maybeSingle()
        .throwOnError();

      await appendDealEvent(client, {
        dealId: input.dealId,
        aggregateType: 'deal_milestone',
        aggregateId: existing?.id ?? crypto.randomUUID(),
        eventType: 'deal_milestone.set',
        payload: {
          kind: 'loi_signed',
          target_on: existing?.target_on ?? null,
          actual_on: input.signedOn,
          shared: existing?.shared ?? true,
        } satisfies DealMilestoneSetPayload,
      }).catch((error: { code?: string }) => {
        if (error.code === CHECK_VIOLATION) {
          throw new Refusal('An LOI signed date cannot be in the future.');
        }
        throw error;
      });

      await setUpLoiSigned(client, input, {
        actor: {},
        createdBy: user.id,
      });
    },
  scheduleFromLoiSignedSchema,
  dealScheduleChange,
);
