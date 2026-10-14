'use server';

import { z } from 'zod';

import {
  ContractNotFound,
  DOCUMENSO_NOT_CONFIGURED,
  checkContractSignature,
  createDocumensoClient,
  isDocumensoConfigured,
} from '@odb/contracts/esign';
import {
  getSupabaseServerAdminClient,
  getSupabaseServerClient,
} from '@odb/supabase/server';

import { Refusal, refusableAction } from './refusal';

export const checkContractSignatureStatus = refusableAction(
  async (data) => {
    if (!isDocumensoConfigured()) {
      throw new Refusal(DOCUMENSO_NOT_CONFIGURED);
    }

    try {
      await checkContractSignature(data.contract_version_id, {
        client: getSupabaseServerClient(),
        admin: getSupabaseServerAdminClient(),
        documenso: createDocumensoClient(),
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
