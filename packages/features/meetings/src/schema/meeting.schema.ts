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
