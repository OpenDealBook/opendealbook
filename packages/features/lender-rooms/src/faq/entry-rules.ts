import { z } from 'zod';

import { storageKeyName } from '@odb/supabase/storage-key';

export const DEAL_TEAM_ONLY = 'Only the deal team can do that';
const BOTH_REQUIRED = 'A question and an answer are both required';
const TOO_LONG = 'A question or answer can be at most 5,000 characters';

export const entryText = z
  .string()
  .max(5000, TOO_LONG)
  .refine((text) => text.trim() !== '', BOTH_REQUIRED);

export function faqFileKey(dealId: string, fileId: string, name: string) {
  return `deal/${dealId}/${fileId}-${storageKeyName(name)}`;
}
