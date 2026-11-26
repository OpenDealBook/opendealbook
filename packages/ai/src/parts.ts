import { z } from 'zod';

export const answerPart = z.never();

export type AnswerPart = z.infer<typeof answerPart>;
