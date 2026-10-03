import { z } from 'zod';

export const connectMailboxSchema = z.object({
  accountId: z.uuid(),
  provider: z.enum(['gmail', 'microsoft']),
  nangoConnectionId: z.string().min(1),
  providerConfigKey: z.string().min(1),
  emailAddress: z.email(),
  status: z.string().default('active'),
});

export const seedDefaultSequencesSchema = z.object({
  accountId: z.uuid(),
});

export const outreachStepSchema = z.object({
  ordinal: z.number().int(),
  delayDays: z.number().int(),
  subject: z.string().min(1),
  body: z.string().min(1),
});

export const createSequenceSchema = z.object({
  accountId: z.uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  steps: z.array(outreachStepSchema),
});

export const updateSequenceSchema = z.object({
  accountId: z.uuid(),
  sequenceId: z.uuid(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  enabled: z.boolean().optional(),
  steps: z.array(outreachStepSchema).optional(),
});

export const enrollTargetsSchema = z.object({
  accountId: z.uuid(),
  sequenceId: z.uuid(),
  firmIds: z.array(z.uuid()).optional(),
  contactIds: z.array(z.uuid()).optional(),
});

export const setOutreachSettingSchema = z.object({
  accountId: z.uuid(),
  dailyCap: z.number().int().positive(),
  maxTouches: z.number().int().positive(),
});

export const suppressEmailSchema = z.object({
  accountId: z.uuid(),
  email: z.email(),
  reason: z.string().min(1),
});
