import { z } from 'zod';

export const checklistStatusSchema = z.enum([
  'not_started',
  'requested',
  'received',
  'reviewed',
]);

export const transitionStepSchema = z.enum([
  'engagement_letter',
  'consent_7216',
  'efile_auth',
  'portal_migration',
]);

export type ChecklistStatus = z.infer<typeof checklistStatusSchema>;
export type TransitionStep = z.infer<typeof transitionStepSchema>;
