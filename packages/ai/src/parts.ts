import { z } from 'zod';

export const answerPart = z.object({
  id: z.int(),
  kind: z.literal('document'),
  v: z.literal(1),
  documentId: z.string(),
  documentName: z.string(),
  version: z.int(),
  page: z.int().optional(),
  sheet: z.string().optional(),
  note: z.string().optional(),
});

export type AnswerPart = z.infer<typeof answerPart>;
