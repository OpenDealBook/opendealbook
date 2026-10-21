import { z } from 'zod';

export const contractTypeSchema = z.enum(['loi', 'apa']);
export const contractPartySchema = z.enum(['buyer', 'seller']);
export const contractSourceSchema = z.enum([
  'editor_save',
  'upload',
  'generated',
]);

export type ContractBucket = 'generated' | 'contracts';

export type ContractType = z.infer<typeof contractTypeSchema>;
export type ContractParty = z.infer<typeof contractPartySchema>;
export type ContractSource = z.infer<typeof contractSourceSchema>;

export const MAX_COMMENT_CHARACTERS = 5000;

export const NOT_ALLOWED = 'You cannot comment on this contract.';

export const COMMENT_TOO_LONG =
  'Comments and quoted text can be at most 5,000 characters.';

export const INTERNAL_BUYER_ONLY =
  'Only the buyer side can post internal comments.';

export const CANNOT_SHARE = "You can't share contracts.";

export const APA_NEEDS_COUNSEL =
  "An APA needs buyer's counsel and seller's counsel on the deal";
