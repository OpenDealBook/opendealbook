import type { SupabaseClient } from '@supabase/supabase-js';

import type { ContractType } from '@odb/contracts';
import {
  contractSignatureEditorUrl,
  createDocumensoClient,
  isDocumensoConfigured,
} from '@odb/contracts/esign';
import type { Database } from '@odb/supabase';

type SignedContractType = Extract<ContractType, 'loi' | 'apa'>;

export interface OfferContractSignature {
  contractVersionId: string;
  signingStatus: string | null;
  editorUrl: string | null;
}

export async function offerContracts(
  client: SupabaseClient<Database>,
  offerId: string,
) {
  const { data: offerVersions } = await client
    .from('offer_version')
    .select('id')
    .eq('offer_id', offerId)
    .throwOnError();

  const { data: contracts } = await client
    .from('contract')
    .select('type, versions:contract_version(id, version, signing_status)')
    .in(
      'source_offer_version_id',
      offerVersions.map((offerVersion) => offerVersion.id),
    )
    .order('created_at', { ascending: false })
    .throwOnError();

  return contracts;
}

type OfferContracts = Awaited<ReturnType<typeof offerContracts>>;

export function latestVersion(contracts: OfferContracts, type: string) {
  return contracts
    .find((contract) => contract.type === type)
    ?.versions.toSorted((a, b) => b.version - a.version)[0];
}

export function generationRefusal(
  type: SignedContractType,
  signingStatus: string | null | undefined,
): string | null {
  const name = type.toUpperCase();

  if (signingStatus === 'draft' || signingStatus === 'sent') {
    return `A signature request for this ${name} is already in progress`;
  }

  return signingStatus === 'completed'
    ? `This ${name} has already been signed`
    : null;
}

export async function loadOfferSignatures(
  client: SupabaseClient<Database>,
  offerId: string,
): Promise<
  Record<SignedContractType, OfferContractSignature | null> & {
    canGenerate: Record<SignedContractType, boolean>;
  }
> {
  const contracts = await offerContracts(client, offerId);

  async function signature(type: SignedContractType) {
    const current = latestVersion(contracts, type);

    return current
      ? {
          contractVersionId: current.id,
          signingStatus: current.signing_status,
          editorUrl:
            current.signing_status === 'draft'
              ? await draftEditorUrl(client, current.id)
              : null,
        }
      : null;
  }

  const [loi, apa] = await Promise.all([signature('loi'), signature('apa')]);

  return {
    loi,
    apa,
    canGenerate: {
      loi: generationRefusal('loi', loi?.signingStatus) === null,
      apa: generationRefusal('apa', apa?.signingStatus) === null,
    },
  };
}

async function draftEditorUrl(
  client: SupabaseClient<Database>,
  contractVersionId: string,
): Promise<string | null> {
  if (!isDocumensoConfigured()) {
    return null;
  }

  try {
    return await contractSignatureEditorUrl(contractVersionId, {
      client,
      documenso: createDocumensoClient(),
    });
  } catch (error) {
    console.error('The Documenso editor link could not be loaded', {
      contractVersionId,
      error,
    });

    return null;
  }
}
