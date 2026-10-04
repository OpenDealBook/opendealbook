import { z } from 'zod';

export const calendarProviderSchema = z.enum(['google', 'microsoft']);

export type CalendarProvider = z.infer<typeof calendarProviderSchema>;

export const createCalendarConnectSessionSchema = z.object({
  accountId: z.uuid(),
  provider: calendarProviderSchema,
});

export type CreateCalendarConnectSessionPayload = z.infer<
  typeof createCalendarConnectSessionSchema
>;

export const connectCalendarSchema = z.object({
  accountId: z.uuid(),
  provider: calendarProviderSchema,
  nangoConnectionId: z.string().min(1),
  providerConfigKey: z.string().min(1),
  email: z.email().optional(),
});

export type ConnectCalendarPayload = z.infer<typeof connectCalendarSchema>;

export const pushMeetingToCalendarsSchema = z.object({
  accountId: z.uuid(),
  dealId: z.uuid(),
  title: z.string().min(1),
  start: z.string(),
  end: z.string(),
});

export type PushMeetingToCalendarsPayload = z.infer<
  typeof pushMeetingToCalendarsSchema
>;
