'use server';

import { enhanceAction } from '@odb/next/actions';
import type { TablesInsert, TablesUpdate } from '@odb/supabase';
import { getSupabaseServerClient } from '@odb/supabase/server';

import {
  completeMeetingActionItemSchema,
  meetingActionItemSchema,
} from '../schema/meeting-action-item.schema';
import { scheduleMeetingSchema } from '../schema/meeting.schema';
import {
  meetingSeriesSchema,
  updateMeetingSeriesSchema,
} from '../schema/meeting-series.schema';

export const createMeetingSeries = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();

    const insert: TablesInsert<'meeting_series'> = {
      account_id: data.account_id,
      deal_id: data.deal_id,
      weekday: data.weekday ?? null,
      time_of_day: data.time_of_day ?? null,
      timezone: data.timezone ?? null,
      duration_mins: data.duration_mins ?? null,
      video_provider: data.video_provider ?? null,
      status: data.status ?? null,
    };

    const { data: row, error } = await client
      .from('meeting_series')
      .insert(insert)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return row;
  },
  { auth: true, schema: meetingSeriesSchema },
);

export const updateMeetingSeries = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();

    const { id, ...update } = data;

    const { data: row, error } = await client
      .from('meeting_series')
      .update(update satisfies TablesUpdate<'meeting_series'>)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return row;
  },
  { auth: true, schema: updateMeetingSeriesSchema },
);

export const scheduleMeeting = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();

    const insert: TablesInsert<'meeting'> = {
      account_id: data.account_id,
      deal_id: data.deal_id,
      series_id: data.series_id ?? null,
      type: data.type,
      scheduled_at: data.scheduled_at ?? null,
      status: data.status ?? null,
      notes: data.notes ?? null,
    };

    const { data: row, error } = await client
      .from('meeting')
      .insert(insert)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return row;
  },
  { auth: true, schema: scheduleMeetingSchema },
);

export const addMeetingActionItem = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();

    const insert: TablesInsert<'meeting_action_item'> = {
      account_id: data.account_id,
      deal_id: data.deal_id,
      meeting_id: data.meeting_id,
      description: data.description,
      owner_user_id: data.owner_user_id ?? null,
      owner_is_seller: data.owner_is_seller ?? false,
      due_at: data.due_at ?? null,
      checklist_item_id: data.checklist_item_id ?? null,
      schedule_week_id: data.schedule_week_id ?? null,
    };

    const { data: row, error } = await client
      .from('meeting_action_item')
      .insert(insert)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return row;
  },
  { auth: true, schema: meetingActionItemSchema },
);

export const completeMeetingActionItem = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();

    const { data: row, error } = await client
      .from('meeting_action_item')
      .update({ status: 'reviewed' })
      .eq('id', data.id)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return row;
  },
  { auth: true, schema: completeMeetingActionItemSchema },
);
