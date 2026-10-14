import type { SupabaseClient, User } from '@supabase/supabase-js';

import {
  type ContractType,
  PDF_CONTENT_TYPE,
  contractPdfPath,
  createSupabaseContractStorage,
} from '@odb/contracts';
import {
  DOCUMENSO_NOT_CONFIGURED,
  DocumensoRejected,
  checkContractSignature,
  deterministicUuid,
  isStaleAggregate,
  type Signer,
  createDocumensoClient,
  isDocumensoConfigured,
  requestContractSignature,
  signersSchema,
} from '@odb/contracts/esign';
import { appendDealEvent } from '@odb/events';
import type { Database } from '@odb/supabase';
import { getSupabaseServerAdminClient } from '@odb/supabase/server';
import { GENERATED_BUCKET, generateFromTemplate } from '@odb/templates/server';

import { offerIdSchema } from '../schema/offer.schema';
import {
  generationRefusal,
  latestVersion,
  offerContracts,
} from './contract-signature-loader';
import { Refusal } from './refusal';

export const contractRequestSchema = offerIdSchema.extend({
  signers: signersSchema,
});

export interface GenerateContractInput {
  client: SupabaseClient<Database>;
  user: User;
  dealId: string;
  accountId: string;
  offerId: string;
  offerVersionId: string;
  terms: Record<string, unknown>;
  type: Extract<ContractType, 'loi' | 'apa'>;
  earlierContracts: number;
  signers: Signer[];
}

export async function generateContract(
  input: GenerateContractInput,
): Promise<{ contractVersionId: string; editorUrl: string }> {
  const templateId = await placeholderTemplateId(
    input.client,
    input.accountId,
    input.type,
  );

  const contractId = deterministicUuid(
    `${input.offerId}:${input.type}:${input.earlierContracts}`,
  );

  try {
    await appendDealEvent(input.client, {
      dealId: input.dealId,
      aggregateType: 'contract',
      aggregateId: contractId,
      eventType: 'contract.created',
      expectedAggregateSeq: 0,
      payload: {
        type: input.type,
        status: 'draft',
        current_version: 0,
        source_offer_version_id: input.offerVersionId,
      },
    });
  } catch (failure) {
    if (isStaleAggregate(failure)) {
      throw new Refusal(generationRefusal(input.type, 'draft')!);
    }

    throw failure;
  }

  const generated = await generateFromTemplate({
    accountId: input.accountId,
    templateId,
    dealId: input.dealId,
    fieldValues: input.terms,
  });

  const storage = createSupabaseContractStorage(input.client);
  const pdfPath = contractPdfPath(input.accountId, contractId, 1);
  const rendered = await input.client.storage
    .from(GENERATED_BUCKET)
    .download(generated.pdf_path!);

  if (rendered.error) {
    throw rendered.error;
  }

  await storage.uploadVersion(
    pdfPath,
    new Uint8Array(await rendered.data.arrayBuffer()),
    PDF_CONTENT_TYPE,
  );

  await input.client
    .from('generated_document')
    .update({ contract_id: contractId })
    .eq('id', generated.id)
    .throwOnError();

  const { data: contractVersion } = await input.client
    .from('contract_version')
    .insert({
      contract_id: contractId,
      account_id: input.accountId,
      version: 1,
      source: 'generated',
      party: 'buyer',
      docx_path: generated.docx_path,
      pdf_path: pdfPath,
      author_user_id: input.user.id,
    })
    .select('id')
    .single()
    .throwOnError();

  await appendDealEvent(input.client, {
    dealId: input.dealId,
    aggregateType: 'contract',
    aggregateId: contractId,
    eventType: 'contract.version_set',
    payload: { current_version: 1 },
  });

  try {
    const editorUrl = await requestContractSignature(
      {
        contractVersionId: contractVersion.id,
        dealId: input.dealId,
        signers: input.signers,
      },
      {
        client: input.client,
        storage,
        documenso: createDocumensoClient(),
      },
    );

    return { contractVersionId: contractVersion.id, editorUrl };
  } catch (failure) {
    if (failure instanceof DocumensoRejected) {
      throw new Refusal(
        'Documenso did not accept the signature request. Check the signers and try again',
      );
    }

    throw failure;
  }
}

export async function countEarlierContractsOrRefuse(input: {
  client: SupabaseClient<Database>;
  offerId: string;
  type: GenerateContractInput['type'];
}): Promise<number> {
  if (!isDocumensoConfigured()) {
    throw new Refusal(DOCUMENSO_NOT_CONFIGURED);
  }

  let contracts = await offerContracts(input.client, input.offerId);
  const recorded = latestVersion(contracts, input.type);

  if (
    recorded?.signing_status === 'draft' ||
    recorded?.signing_status === 'sent'
  ) {
    await checkContractSignature(recorded.id, {
      client: input.client,
      admin: getSupabaseServerAdminClient(),
      documenso: createDocumensoClient(),
    });
    contracts = await offerContracts(input.client, input.offerId);
  }

  const refusal = generationRefusal(
    input.type,
    latestVersion(contracts, input.type)?.signing_status,
  );

  if (refusal) {
    throw new Refusal(refusal);
  }

  return contracts.filter((contract) => contract.type === input.type).length;
}

async function placeholderTemplateId(
  client: SupabaseClient<Database>,
  accountId: string,
  type: ContractType,
): Promise<string> {
  const { data } = await client
    .from('document_template')
    .select('id')
    .eq('account_id', accountId)
    .eq('type', type)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
    .throwOnError();

  if (data === null) {
    throw new Refusal(
      `No ${type.toUpperCase()} template is set up for this account`,
    );
  }

  return data.id;
}
