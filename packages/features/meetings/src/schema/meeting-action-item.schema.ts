import { z } from 'zod';

export const meetingActionItemSchema = z.object({
  account_id: z.uuid(),
  deal_id: z.uuid(),
  meeting_id: z.uuid(),
  description: z.string().min(1),
  owner_user_id: z.uuid().optional(),
  owner_is_seller: z.boolean().optional(),
  due_at: z.string().optional(),
  checklist_item_id: z.uuid().optional(),
  schedule_week_id: z.uuid().optional(),
});

export type MeetingActionItemPayload = z.infer<typeof meetingActionItemSchema>;

export const completeMeetingActionItemSchema = z.object({
  id: z.uuid(),
});

export type CompleteMeetingActionItemPayload = z.infer<
  typeof completeMeetingActionItemSchema
>;
