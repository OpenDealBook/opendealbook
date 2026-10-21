'use server';

import { z } from 'zod';

import {
  contractPartySchema,
  contractTypeSchema,
  createSupabaseContractStorage,
} from '@odb/contracts';
import {
  AlreadySignedInDocumenso,
  ContractNotFound,
  DOCUMENSO_NOT_CONFIGURED,
  DocumensoRejected,
  SigningNotReady,
  checkContractSignature,
  createDocumensoClient,
  isDocumensoConfigured,
  recordExternalSignature,
  requestContractSignature,
  signersSchema,
} from '@odb/contracts/esign';
import {
  getSupabaseServerAdminClient,
  getSupabaseServerClient,
} from '@odb/supabase/server';

import { generationRefusal } from './contract-signature-loader';
import { setUpDiligenceOnLoiSigned } from './loi-signed-setup';
import { Refusal, refusableAction } from './refusal';

export const checkContractSignatureStatus = refusableAction(
  async (data) => {
    if (!isDocumensoConfigured()) {
      throw new Refusal(DOCUMENSO_NOT_CONFIGURED);
    }

    try {
      const admin = getSupabaseServerAdminClient();

      await checkContractSignature(data.contract_version_id, {
        client: getSupabaseServerClient(),
        admin,
        documenso: createDocumensoClient(),
        onLoiSigned: (loi) => setUpDiligenceOnLoiSigned(admin, loi, 'documenso'),
      });
    } catch (failure) {
      if (failure instanceof ContractNotFound) {
        throw new Refusal('That contract was not found');
      }

      throw failure;
    }
  },
  z.object({ contract_version_id: z.uuid() }),
);

export const sendContractForSignature = refusableAction(
  async (data) => {
    if (!isDocumensoConfigured()) {
      throw new Refusal(DOCUMENSO_NOT_CONFIGURED);
    }

    const client = getSupabaseServerClient();
    const { data: version } = await client
      .from('contract_version')
      .select('signing_status, contract!inner(deal_id, type)')
      .eq('id', data.contract_version_id)
      .single()
      .throwOnError();

    const inProgress = generationRefusal(
      contractTypeSchema.parse(version.contract.type),
      version.signing_status,
    );

    if (inProgress) {
      throw new Refusal(inProgress);
    }

    try {
      const editorUrl = await requestContractSignature(
        {
          contractVersionId: data.contract_version_id,
          dealId: version.contract.deal_id,
          signers: data.signers,
        },
        {
          client,
          storage: createSupabaseContractStorage(client),
          documenso: createDocumensoClient(),
        },
      );

      return { editorUrl };
    } catch (failure) {
      if (failure instanceof SigningNotReady) {
        throw new Refusal(failure.message);
      }

      if (failure instanceof DocumensoRejected) {
        throw new Refusal(
          'Documenso did not accept the signature request. Check the signers and try again',
        );
      }

      throw failure;
    }
  },
  z.object({ contract_version_id: z.uuid(), signers: signersSchema }),
);

const SIGNED_COPY_NAME = /\.(pdf|docx)$/i;

function utcTomorrow(): string {
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  return tomorrow.toISOString().slice(0, 10);
}

export const recordContractSignedElsewhere = refusableAction(
  async (data, user) => {
    const client = getSupabaseServerClient();
    const admin = getSupabaseServerAdminClient();

    try {
      return await recordExternalSignature(
        {
          dealId: data.deal_id,
          type: data.type,
          contractId: data.contract_id,
          party: data.party,
          signedOn: data.signed_on,
          copy: {
            kind: /\.pdf$/i.test(data.file.name) ? 'pdf' : 'docx',
            bytes: new Uint8Array(await data.file.arrayBuffer()),
          },
        },
        {
          client,
          admin,
          documenso: createDocumensoClient(),
          storage: createSupabaseContractStorage(client),
          authorUserId: user.id,
          onLoiSigned: (loi) =>
            setUpDiligenceOnLoiSigned(admin, loi, 'paper-signing'),
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
  },
  z.object({
    deal_id: z.uuid(),
    type: contractTypeSchema,
    contract_id: z.uuid().nullable(),
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
  }),
);
