'use server';

import { appendDealEvent } from '@odb/events';
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

    const id = crypto.randomUUID();

    await appendDealEvent(client, {
      dealId: data.deal_id,
      aggregateType: 'meeting',
      aggregateId: id,
      eventType: 'meeting.scheduled',
      payload: {
        series_id: data.series_id ?? null,
        type: data.type,
        scheduled_at: data.scheduled_at ?? null,
        status: data.status ?? null,
      },
    });

    return id;
  },
  { auth: true, schema: scheduleMeetingSchema },
);

export const addMeetingActionItem = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();

    const id = crypto.randomUUID();

    await appendDealEvent(client, {
      dealId: data.deal_id,
      aggregateType: 'meeting_action_item',
      aggregateId: id,
      eventType: 'meeting_action_item.added',
      payload: {
        meeting_id: data.meeting_id,
        description: data.description,
        owner_user_id: data.owner_user_id ?? null,
        owner_is_seller: data.owner_is_seller ?? false,
        due_at: data.due_at ?? null,
        status: null,
        checklist_item_id: data.checklist_item_id ?? null,
      },
    });

    return id;
  },
  { auth: true, schema: meetingActionItemSchema },
);

export const completeMeetingActionItem = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();

    const { data: item, error } = await client
      .from('meeting_action_item')
      .select('deal_id')
      .eq('id', data.id)
      .single();

    if (error) {
      throw error;
    }

    await appendDealEvent(client, {
      dealId: item.deal_id,
      aggregateType: 'meeting_action_item',
      aggregateId: data.id,
      eventType: 'meeting_action_item.updated',
      payload: { status: 'reviewed' },
    });

    return data.id;
  },
  { auth: true, schema: completeMeetingActionItemSchema },
);
