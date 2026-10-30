import { z } from 'zod';

import {
  contractPartySchema,
  createSupabaseContractStorage,
} from '@odb/contracts';
import {
  AlreadySignedInDocumenso,
  type ExternalSignature,
  createDocumensoClient,
  recordExternalSignature,
} from '@odb/contracts/esign';
import { setUpLoiSigned } from '@odb/deal-timeline/loi-signed-setup.ts';
import {
  getSupabaseServerAdminClient,
  getSupabaseServerClient,
} from '@odb/supabase/server';

import { Refusal } from './refusal';

const SIGNED_COPY_NAME = /\.(pdf|docx)$/i;

function utcTomorrow(): string {
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  return tomorrow.toISOString().slice(0, 10);
}

export const signedCopySchema = z.object({
  party: contractPartySchema,
  signed_on: z.iso
    .date()
    .refine(
      (signedOn) => signedOn <= utcTomorrow(),
      'The signing date cannot be in the future',
    ),
  file: z
    .instanceof(File)
    .refine(
      (file) => SIGNED_COPY_NAME.test(file.name),
      'Upload the signed contract as a PDF or a .docx file',
    ),
});

export async function recordSignedCopy(
  signature: Omit<ExternalSignature, 'copy'> & { file: File },
  authorUserId: string,
): Promise<string> {
  const client = getSupabaseServerClient();
  const admin = getSupabaseServerAdminClient();

  try {
    return await recordExternalSignature(
      {
        ...signature,
        copy: {
          kind: /\.pdf$/i.test(signature.file.name) ? 'pdf' : 'docx',
          bytes: new Uint8Array(await signature.file.arrayBuffer()),
        },
      },
      {
        client,
        admin,
        documenso: createDocumensoClient(),
        storage: createSupabaseContractStorage(client),
        authorUserId,
        onLoiSigned: (loi) =>
          setUpLoiSigned(admin, loi, {
            actor: { actorKind: 'service', actorVia: 'paper-signing' },
          }),
      },
    );
  } catch (failure) {
    if (failure instanceof AlreadySignedInDocumenso) {
      throw new Refusal(
        'Documenso shows this was already signed. Use Check signature status to record it.',
      );
    }

    throw failure;
  }
}
