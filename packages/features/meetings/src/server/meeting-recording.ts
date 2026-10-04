'use server';

import { generateStructured } from '@odb/ai/server';
import { appendDealEvent } from '@odb/events';
import { enhanceAction } from '@odb/next/actions';
import { getSupabaseServerClient } from '@odb/supabase/server';

import {
  attachMeetingRecordingSchema,
  meetingRecordingUploadUrlSchema,
  summarizeMeetingSchema,
} from '../schema/meeting.schema';

const BUCKET = 'meeting-recordings';

const SUMMARY_SYSTEM =
  'You summarize an M&A deal meeting transcript into a concise recap of ' +
  'decisions, open questions, and next steps. Reply as JSON {"summary": string}.';

export const createMeetingRecordingUploadUrl = enhanceAction(
  async (data) => {
    const path = `deal/${data.deal_id}/${data.meeting_id}/${data.filename}`;

    const { data: signed, error } = await getSupabaseServerClient()
      .storage.from(BUCKET)
      .createSignedUploadUrl(path);

    if (error) {
      throw error;
    }

    return { path, token: signed.token, signedUrl: signed.signedUrl };
  },
  { auth: true, schema: meetingRecordingUploadUrlSchema },
);

export const attachMeetingRecording = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();

    await appendDealEvent(client, {
      dealId: data.deal_id,
      aggregateType: 'meeting',
      aggregateId: data.id,
      eventType: 'meeting.updated',
      payload: {
        recording_path: data.recording_path ?? null,
        transcript_path: data.transcript_path ?? null,
        transcript_text: data.transcript_text ?? null,
      },
    });

    return data.id;
  },
  { auth: true, schema: attachMeetingRecordingSchema },
);

export const summarizeMeeting = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();

    const { summary } = await generateStructured<{ summary: string }>(client, {
      accountId: data.account_id,
      system: SUMMARY_SYSTEM,
      prompt: data.transcript_text,
      parse: (raw) => ({ summary: String((raw as { summary: string }).summary) }),
    });

    await appendDealEvent(client, {
      dealId: data.deal_id,
      aggregateType: 'meeting',
      aggregateId: data.id,
      eventType: 'meeting.updated',
      payload: { summary },
    });

    return summary;
  },
  { auth: true, schema: summarizeMeetingSchema },
);
