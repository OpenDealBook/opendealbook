import { z } from 'zod';

export const dealSourceSchema = z.enum([
  'manual',
  'broker',
  'outreach',
  'marketplace',
  'referral',
]);

export const firmStatusSchema = z.enum([
  'imported',
  'enriched',
  'scored',
  'contacted',
  'responded',
  'deal_created',
  'disqualified',
]);

export const participantPartySchema = z.enum([
  'buyer',
  'seller',
  'broker',
  'lender',
]);

export const participantScopeSchema = z.enum([
  'deal',
  'contract',
  'data_room_folder',
  'checklist',
]);

export const participantPermissionSchema = z.enum([
  'view',
  'comment',
  'suggest',
  'edit',
  'sign',
]);

export const checklistStatusSchema = z.enum([
  'not_started',
  'requested',
  'received',
  'reviewed',
]);

export const checklistOutcomeSchema = z.enum([
  'accepted',
  'follow_up',
  'rejected',
]);

export const approvalSubjectSchema = z.enum([
  'stage_move',
  'loi',
  'apa',
  'schedule',
  'participant_change',
]);

export const approvalDecisionSchema = z.enum(['approved', 'declined']);

// Provisional stage ordering. The schema lane pins only stage default 'pre_nda';
// reconcile this list against the deal stage enum once it lands.
export const DEAL_STAGES = [
  'pre_nda',
  'nda',
  'diligence',
  'loi',
  'apa',
  'closing',
  'closed',
] as const;

export type DealStage = (typeof DEAL_STAGES)[number];

export function isPastLoi(stage: string): boolean {
  return DEAL_STAGES.indexOf(stage as DealStage) > DEAL_STAGES.indexOf('loi');
}

export type DealSource = z.infer<typeof dealSourceSchema>;
export type FirmStatus = z.infer<typeof firmStatusSchema>;
export type ParticipantParty = z.infer<typeof participantPartySchema>;
export type ParticipantScope = z.infer<typeof participantScopeSchema>;
export type ParticipantPermission = z.infer<typeof participantPermissionSchema>;
export type ChecklistStatus = z.infer<typeof checklistStatusSchema>;
export type ChecklistOutcome = z.infer<typeof checklistOutcomeSchema>;
export type ApprovalSubject = z.infer<typeof approvalSubjectSchema>;
export type ApprovalDecision = z.infer<typeof approvalDecisionSchema>;
