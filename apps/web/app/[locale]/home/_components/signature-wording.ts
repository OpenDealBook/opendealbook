import { z } from 'zod';

import { signatureWording } from '@odb/lender-rooms/requests-ui/wording.ts';
import type { Enums } from '@odb/supabase';

export type SignatureStatus = Enums<'lender_signature_status'>;

export const signatureStatusWording = {
  ...signatureWording,
  draft: 'Draft in Documenso, not yet out for signature',
  sent: 'Out for signature',
  cancelled: 'Cancelled',
} satisfies Record<SignatureStatus, string>;

export const documensoLinkWording =
  'Open in Documenso to place signature fields';

export function signatureInProgress(status: SignatureStatus | null): boolean {
  return status === 'draft' || status === 'sent';
}

const contractSignature = z
  .object({
    contractVersionId: z.string(),
    signingStatus: z
      .enum(['draft', 'sent', 'completed', 'declined', 'expired'])
      .nullable(),
    editorUrl: z.string().nullable(),
  })
  .nullable();

const offerContractSignatures = z.object({
  loi: contractSignature,
  apa: contractSignature,
  canGenerate: z.object({ loi: z.boolean(), apa: z.boolean() }),
});

export type ContractSignatures = z.infer<typeof offerContractSignatures>;

export function contractSignatures(loaded: unknown): ContractSignatures {
  return offerContractSignatures.parse(loaded);
}
