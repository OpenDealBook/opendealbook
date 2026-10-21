import type { SupabaseClient, User } from '@supabase/supabase-js';

import {
  type ContractType,
  PDF_CONTENT_TYPE,
  announceNewVersion,
  contractPdfPath,
  createSupabaseContractStorage,
} from '@odb/contracts';
import {
  DOCUMENSO_NOT_CONFIGURED,
  checkContractSignature,
  deterministicUuid,
  isStaleAggregate,
  createDocumensoClient,
  isDocumensoConfigured,
} from '@odb/contracts/esign';
import { appendDealEvent } from '@odb/events';
import type { Database } from '@odb/supabase';
import { getSupabaseServerAdminClient } from '@odb/supabase/server';
import {
  GENERATED_BUCKET,
  checkTemplateFields,
  generateFromTemplate,
} from '@odb/templates/server';

import { contractFieldValues } from './contract-field-values';
import {
  generationRefusal,
  latestVersion,
  offerContracts,
} from './contract-signature-loader';
import { Refusal } from './refusal';

const MISSING_FIELDS = 'Fill in: ';

const UNIQUE_VIOLATION = '23505';

export interface GenerateContractInput {
  client: SupabaseClient<Database>;
  user: User;
  dealId: string;
  accountId: string;
  offerId: string;
  offerVersionId: string;
  terms: Record<string, unknown>;
  type: Extract<ContractType, 'loi' | 'apa'>;
  slot: ContractSlot;
}

export interface ContractSlot {
  contractId: string;
  version: number;
}

export async function generateContract(
  input: GenerateContractInput,
): Promise<{ contractVersionId: string }> {
  const templateId = await placeholderTemplateId(
    input.client,
    input.accountId,
    input.type,
  );

  const { contractId, version } = input.slot;

  const fieldValues = await contractFieldValues(input.client, {
    dealId: input.dealId,
    accountId: input.accountId,
    offerVersionId: input.offerVersionId,
    terms: input.terms,
  });

  await refuseWhenFieldsMissing(() =>
    checkTemplateFields({
      accountId: input.accountId,
      templateId,
      dealId: input.dealId,
      fieldValues,
    }),
  );

  if (version === 1) {
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
  }

  const generated = await generateFromTemplate({
    accountId: input.accountId,
    templateId,
    dealId: input.dealId,
    fieldValues,
  });

  const storage = createSupabaseContractStorage(input.client);
  const pdfPath = contractPdfPath(input.accountId, contractId, version);
  const rendered = await input.client.storage
    .from(GENERATED_BUCKET)
    .download(generated.pdf_path!);

  if (rendered.error) {
    throw rendered.error;
  }

  const { data: contractVersion, error: versionTaken } = await input.client
    .from('contract_version')
    .insert({
      contract_id: contractId,
      account_id: input.accountId,
      version,
      source: 'generated',
      party: 'buyer',
      docx_path: generated.docx_path,
      docx_bucket: 'generated',
      pdf_path: pdfPath,
      pdf_bucket: 'contracts',
      author_user_id: input.user.id,
    })
    .select('id')
    .single();

  if (versionTaken?.code === UNIQUE_VIOLATION) {
    throw new Refusal(
      'Someone just generated a new version. Refresh to see it.',
    );
  }

  if (versionTaken) {
    throw versionTaken;
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

  await announceNewVersion(
    input.client,
    input.dealId,
    contractId,
    contractVersion.id,
  );
  await appendDealEvent(input.client, {
    dealId: input.dealId,
    aggregateType: 'contract',
    aggregateId: contractId,
    eventType: 'contract.version_set',
    payload: { current_version: version },
  });

  return { contractVersionId: contractVersion.id };
}

export async function nextContractVersionOrRefuse(input: {
  client: SupabaseClient<Database>;
  offerId: string;
  type: GenerateContractInput['type'];
}): Promise<ContractSlot> {
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

  const latest = latestVersion(contracts, input.type);
  const refusal = generationRefusal(input.type, latest?.signing_status);

  if (refusal) {
    throw new Refusal(refusal);
  }

  if (latest && latest.signing_status === null) {
    return {
      contractId: contracts.find((contract) => contract.type === input.type)!
        .id,
      version: latest.version + 1,
    };
  }

  const earlierContracts = contracts.filter(
    (contract) => contract.type === input.type,
  ).length;

  return {
    contractId: deterministicUuid(
      `${input.offerId}:${input.type}:${earlierContracts}`,
    ),
    version: 1,
  };
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

async function refuseWhenFieldsMissing(check: () => Promise<unknown>) {
  try {
    await check();
  } catch (failure) {
    if (
      failure instanceof Error &&
      failure.message.startsWith(MISSING_FIELDS)
    ) {
      throw new Refusal(failure.message);
    }

    throw failure;
  }
}
