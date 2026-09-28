import { z } from 'zod';

export const contractTypeSchema = z.enum(['loi', 'apa']);
export const contractPartySchema = z.enum(['buyer', 'seller']);
export const contractSourceSchema = z.enum([
  'editor_save',
  'upload',
  'generated',
]);

export type ContractType = z.infer<typeof contractTypeSchema>;
export type ContractParty = z.infer<typeof contractPartySchema>;
export type ContractSource = z.infer<typeof contractSourceSchema>;
