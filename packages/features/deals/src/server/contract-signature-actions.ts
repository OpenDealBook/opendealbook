'use server';

import { z } from 'zod';

import {
  contractTypeSchema,
  createSupabaseContractStorage,
} from '@odb/contracts';
import {
  ContractNotFound,
  DOCUMENSO_NOT_CONFIGURED,
  DocumensoRejected,
  SigningNotReady,
  checkContractSignature,
  createDocumensoClient,
  isDocumensoConfigured,
  requestContractSignature,
  signersSchema,
} from '@odb/contracts/esign';
import { setUpLoiSigned } from '@odb/deal-timeline/loi-signed-setup.ts';
import {
  getSupabaseServerAdminClient,
  getSupabaseServerClient,
} from '@odb/supabase/server';

import { generationRefusal } from './contract-signature-loader';
import { Refusal, refusableAction } from './refusal';
import { recordSignedCopy, signedCopySchema } from './signed-copy';

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
        onLoiSigned: (loi) =>
          setUpLoiSigned(admin, loi, {
            actor: { actorKind: 'service', actorVia: 'documenso' },
          }),
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
  { what: 'send contracts for signature', needs: 'deals.manage' },
);

export const recordContractSignedElsewhere = refusableAction(
  (data, user) =>
    recordSignedCopy(
      {
        dealId: data.deal_id,
        type: data.type,
        contractId: data.contract_id,
        party: data.party,
        signedOn: data.signed_on,
        file: data.file,
      },
      user.id,
    ),
  signedCopySchema.extend({
    deal_id: z.uuid(),
    type: contractTypeSchema.exclude(['loi_extension']),
    contract_id: z.uuid().nullable(),
  }),
);
