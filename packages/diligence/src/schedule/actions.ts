'use server';

import { z } from 'zod';

import { enhanceAction } from '@tuckin/next/actions';
import type { TablesInsert } from '@tuckin/supabase';
import { getSupabaseServerClient } from '@tuckin/supabase/server';

import { buildWeeks } from './build-weeks';

const createScheduleSchema = z.object({
  dealId: z.uuid(),
  startDate: z.string(),
  targetApaDate: z.string().optional(),
  templateId: z.uuid().optional(),
});

export const createSchedule = enhanceAction(
  async (input, user) => {
    const client = getSupabaseServerClient();

    const { data: deal } = await client
      .from('deal')
      .select('account_id')
      .eq('id', input.dealId)
      .single()
      .throwOnError();

    const { data: schedule } = await client
      .from('diligence_schedule')
      .insert({
        account_id: deal.account_id,
        deal_id: input.dealId,
        start_date: input.startDate,
        target_apa_date: input.targetApaDate ?? null,
        template_id: input.templateId ?? null,
        created_by: user.id,
      })
      .select('*')
      .single()
      .throwOnError();

    const weekRows: TablesInsert<'schedule_week'>[] = buildWeeks(
      input.startDate,
    ).map((week) => ({
      schedule_id: schedule.id,
      account_id: deal.account_id,
      week_no: week.week_no,
      theme: week.theme,
      starts_on: week.starts_on,
    }));

    const { data: weeks } = await client
      .from('schedule_week')
      .insert(weekRows)
      .select('*')
      .throwOnError();

    return { schedule, weeks };
  },
  { auth: true, schema: createScheduleSchema },
);

const scheduleIdSchema = z.object({ scheduleId: z.uuid() });

export const proposeSchedule = enhanceAction(
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
  { auth: true, schema: scheduleIdSchema },
);

export const acceptSchedule = enhanceAction(
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
  { auth: true, schema: scheduleIdSchema },
);

const assignItemToWeekSchema = z.object({
  checklistItemId: z.uuid(),
  weekId: z.uuid(),
});

export const assignItemToWeek = enhanceAction(
  async (input) => {
    const client = getSupabaseServerClient();

    const { data } = await client
      .from('checklist_item')
      .update({ schedule_week_id: input.weekId })
      .eq('id', input.checklistItemId)
      .select('*')
      .single()
      .throwOnError();

    return data;
  },
  { auth: true, schema: assignItemToWeekSchema },
);

const slipUnreceivedSchema = z.object({ weekId: z.uuid() });

export const slipUnreceived = enhanceAction(
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

    const { data: slipped } = await client
      .from('checklist_item')
      .update({ schedule_week_id: nextWeek.id })
      .eq('schedule_week_id', input.weekId)
      .in('status', ['not_started', 'requested'])
      .select('*')
      .throwOnError();

    await client
      .from('schedule_week')
      .update({ status: 'slipped' })
      .eq('id', input.weekId)
      .throwOnError();

    return slipped;
  },
  { auth: true, schema: slipUnreceivedSchema },
);

const answerSellerQuestionSchema = z.object({
  questionId: z.uuid(),
  answer: z.string().min(1),
});

export const answerSellerQuestion = enhanceAction(
  async (input) => {
    const client = getSupabaseServerClient();

    const { data } = await client
      .from('seller_question')
      .update({
        answer: input.answer,
        answered_at: new Date().toISOString(),
        status: 'received',
      })
      .eq('id', input.questionId)
      .select('*')
      .single()
      .throwOnError();

    return data;
  },
  { auth: true, schema: answerSellerQuestionSchema },
);

const sellerWeekViewSchema = z.object({
  dealId: z.uuid(),
  weekNo: z.number().int(),
});

export const sellerWeekView = enhanceAction(
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
  { auth: true, schema: sellerWeekViewSchema },
);
