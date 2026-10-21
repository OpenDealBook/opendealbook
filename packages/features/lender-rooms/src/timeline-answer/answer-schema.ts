import { z } from 'zod';

export const timelineAnswerSchema = z.object({
  roomId: z.uuid(),
  answer: z.enum(['yes', 'no', 'need_to_talk']),
});

export const lenderTimelineAnswerSchema = timelineAnswerSchema.extend({
  note: z.string().nullable().default(null),
  earliestCloseDate: z.iso.date().nullable().default(null),
});
