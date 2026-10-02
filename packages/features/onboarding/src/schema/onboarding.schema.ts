import { z } from 'zod';

export const profileStepSchema = z.object({
  name: z.string().trim().min(2).max(100),
  pictureUrl: z
    .union([z.url(), z.literal('')])
    .optional()
    .transform((value) => value || undefined),
});

export const workspaceStepSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('personal') }),
  z.object({
    kind: z.literal('team'),
    teamName: z.string().trim().min(2).max(100),
  }),
]);

export const termsStepSchema = z.object({
  acceptedTerms: z
    .boolean()
    .refine((value) => value, 'You must accept the terms to continue.'),
  compPoolOptin: z.boolean(),
});

export const dealBoxCriteriaSchema = z.object({
  industries: z.array(z.string()).optional(),
  naics: z.array(z.string()).optional(),
  states: z.array(z.string()).optional(),
  minRevenue: z.number().nonnegative().optional(),
  maxAskingPrice: z.number().nonnegative().optional(),
});

export const dealBoxStepSchema = z.object({
  criteria: dealBoxCriteriaSchema,
});

export const mfaStepSchema = z.object({
  enroll: z.boolean(),
});

export const onboardingSubmissionSchema = z.object({
  profile: profileStepSchema,
  workspace: workspaceStepSchema,
  terms: termsStepSchema,
  dealBox: dealBoxStepSchema.optional(),
  mfa: mfaStepSchema.optional(),
});

export type ProfileStep = z.infer<typeof profileStepSchema>;
export type WorkspaceStep = z.infer<typeof workspaceStepSchema>;
export type TermsStep = z.infer<typeof termsStepSchema>;
export type DealBoxCriteria = z.infer<typeof dealBoxCriteriaSchema>;
export type DealBoxStep = z.infer<typeof dealBoxStepSchema>;
export type MfaStep = z.infer<typeof mfaStepSchema>;
export type OnboardingSubmission = z.infer<typeof onboardingSubmissionSchema>;
