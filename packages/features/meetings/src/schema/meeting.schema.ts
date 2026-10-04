import { z } from 'zod';

export const meetingTypeSchema = z.enum(['weekly', 'site_visit']);

export type MeetingType = z.infer<typeof meetingTypeSchema>;

export const meetingStatusSchema = z.enum([
  'scheduled',
  'held',
  'skipped',
  'cancelled',
]);

export type MeetingStatus = z.infer<typeof meetingStatusSchema>;

export const scheduleMeetingSchema = z.object({
  account_id: z.uuid(),
  deal_id: z.uuid(),
  series_id: z.uuid().optional(),
  type: meetingTypeSchema,
  scheduled_at: z.string().optional(),
  status: meetingStatusSchema.optional(),
  notes: z.string().optional(),
});

export type ScheduleMeetingPayload = z.infer<typeof scheduleMeetingSchema>;

export const updateMeetingSchema = z.object({
  id: z.uuid(),
  deal_id: z.uuid(),
  status: meetingStatusSchema.optional(),
  scheduled_at: z.string().optional(),
  notes: z.string().optional(),
  decisions: z.string().optional(),
});

export type UpdateMeetingPayload = z.infer<typeof updateMeetingSchema>;

export const attachMeetingRecordingSchema = z.object({
  id: z.uuid(),
  deal_id: z.uuid(),
  recording_path: z.string().optional(),
  transcript_path: z.string().optional(),
  transcript_text: z.string().optional(),
});

export type AttachMeetingRecordingPayload = z.infer<
  typeof attachMeetingRecordingSchema
>;

export const meetingRecordingUploadUrlSchema = z.object({
  deal_id: z.uuid(),
  meeting_id: z.uuid(),
  filename: z.string().min(1),
});

export type MeetingRecordingUploadUrlPayload = z.infer<
  typeof meetingRecordingUploadUrlSchema
>;

export const summarizeMeetingSchema = z.object({
  id: z.uuid(),
  deal_id: z.uuid(),
  account_id: z.uuid(),
  transcript_text: z.string().min(1),
});

export type SummarizeMeetingPayload = z.infer<typeof summarizeMeetingSchema>;
