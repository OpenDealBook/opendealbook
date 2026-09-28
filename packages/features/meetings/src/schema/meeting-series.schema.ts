import { z } from 'zod';

export const meetingSeriesSchema = z.object({
  account_id: z.uuid(),
  deal_id: z.uuid(),
  weekday: z.number().int().min(0).max(6).optional(),
  time_of_day: z.string().optional(),
  timezone: z.string().optional(),
  duration_mins: z.number().int().positive().optional(),
  video_provider: z.string().optional(),
  status: z.string().optional(),
});

export type MeetingSeriesPayload = z.infer<typeof meetingSeriesSchema>;

export const updateMeetingSeriesSchema = z.object({
  id: z.uuid(),
  weekday: z.number().int().min(0).max(6).optional(),
  time_of_day: z.string().optional(),
  timezone: z.string().optional(),
  duration_mins: z.number().int().positive().optional(),
  video_provider: z.string().optional(),
  status: z.string().optional(),
});

export type UpdateMeetingSeriesPayload = z.infer<
  typeof updateMeetingSeriesSchema
>;
