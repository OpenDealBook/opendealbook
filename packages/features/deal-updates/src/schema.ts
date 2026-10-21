import { z } from 'zod';

export const recipientGroups = [
  'team',
  'lenders',
  'sellers',
  'buyers_counsel',
  'sellers_counsel',
  'brokers',
] as const;

export type RecipientGroup = (typeof recipientGroups)[number];

export const picksSchema = z.object({
  groups: z.array(z.enum(recipientGroups)),
  people: z.array(z.string()),
});

export type Picks = z.infer<typeof picksSchema>;

const content = {
  subject: z.string().trim().min(1, 'Give the update a subject.'),
  body: z.string().trim().min(1, 'Write the update.'),
  picks: picksSchema,
};

export const createUpdateSchema = z.object({ dealId: z.uuid(), ...content });

export const editUpdateSchema = z.object({ updateId: z.uuid(), ...content });

export const submitUpdateSchema = z.object({ updateId: z.uuid() });
