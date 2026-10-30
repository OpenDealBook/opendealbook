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

import {
  contractFieldValues,
  loiExtensionFieldValues,
} from './contract-field-values';
import {
  CONTRACT_NAME,
  generationRefusal,
  latestVersion,
  offerContracts,
} from './contract-signature-loader';
import { Refusal } from './refusal';

const MISSING_FIELDS = 'Fill in: ';

const UNIQUE_VIOLATION = '23505';

export type GenerateContractInput = {
  client: SupabaseClient<Database>;
  user: User;
  dealId: string;
  accountId: string;
  offerVersionId: string | null;
  terms: Record<string, unknown>;
  slot: ContractSlot;
} & (
  | { type: Extract<ContractType, 'loi' | 'apa'>; offerId: string }
  | { type: 'loi_extension'; parentContractId: string; extendsTo: string }
);

export interface ContractSlot {
  contractId: string;
  version: number;
  isNew: boolean;
}

export async function generateContract(
  input: GenerateContractInput,
): Promise<{ contractVersionId: string }> {
  const templateId =
    (input.type === 'loi_extension'
      ? await recordedTemplateId(input.client, input.slot.contractId)
      : null) ??
    (await placeholderTemplateId(input.client, input.accountId, input.type));

  const { contractId, version, isNew } = input.slot;

  const extension =
    input.type === 'loi_extension'
      ? {
          parent_contract_id: input.parentContractId,
          extends_to: input.extendsTo,
        }
      : null;
  const fieldValues = {
    ...(await contractFieldValues(input.client, {
      dealId: input.dealId,
      accountId: input.accountId,
      offerVersionId: input.offerVersionId,
      terms: input.terms,
    })),
    ...(extension &&
      (await loiExtensionFieldValues(
        input.client,
        input.dealId,
        extension.extends_to,
      ))),
  };

  await refuseWhenFieldsMissing(() =>
    checkTemplateFields({
      accountId: input.accountId,
      templateId,
      dealId: input.dealId,
      fieldValues,
    }),
  );

  if (isNew) {
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
          ...extension,
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
  type: Extract<ContractType, 'loi' | 'apa'>;
}): Promise<ContractSlot> {
  refuseWithoutDocumenso();

  let contracts = await offerContracts(input.client, input.offerId);

  if (
    await settleSignature(input.client, latestVersion(contracts, input.type))
  ) {
    contracts = await offerContracts(input.client, input.offerId);
  }

  const latest = latestVersion(contracts, input.type);
  const refusal = generationRefusal(input.type, latest?.signing_status);

  if (refusal) {
    throw new Refusal(refusal);
  }

  const ofType = contracts.filter((contract) => contract.type === input.type);

  if (latest && latest.signing_status === null) {
    return {
      contractId: ofType[0]!.id,
      version: latest.version + 1,
      isNew: false,
    };
  }

  return {
    contractId: deterministicUuid(
      `${input.offerId}:${input.type}:${ofType.length}`,
    ),
    version: 1,
    isNew: true,
  };
}

const EXTENSION_NOTED = 'This LOI extension has already been noted';

export async function nextExtensionVersionOrRefuse(input: {
  client: SupabaseClient<Database>;
  loiId: string;
  extendsTo: string;
}): Promise<ContractSlot> {
  refuseWithoutDocumenso();

  let found = await loiExtensionTo(input.client, input.loiId, input.extendsTo);

  if (
    await settleSignature(input.client, newest(found.existing?.versions ?? []))
  ) {
    found = await loiExtensionTo(input.client, input.loiId, input.extendsTo);
  }

  if (!found.existing) {
    return { contractId: found.id, version: 1, isNew: true };
  }

  const latest = newest(found.existing.versions);
  const refusal =
    generationRefusal('loi_extension', latest?.signing_status) ??
    (found.existing.note === null ? null : EXTENSION_NOTED);

  if (refusal) {
    throw new Refusal(refusal);
  }

  return {
    contractId: found.id,
    version: (latest?.version ?? 0) + 1,
    isNew: false,
  };
}

type LoiExtension = Awaited<ReturnType<typeof loiExtensions>>[number];

export async function loiExtensionTo(
  client: SupabaseClient<Database>,
  loiId: string,
  extendsTo: string,
): Promise<{ id: string; existing?: LoiExtension }> {
  const extensions = await loiExtensions(client, loiId);
  const existing = extensions.find(
    (extension) => extension.extends_to === extendsTo,
  );

  return existing
    ? { id: existing.id, existing }
    : { id: deterministicUuid(`${loiId}:loi_extension:${extensions.length}`) };
}

async function loiExtensions(client: SupabaseClient<Database>, loiId: string) {
  const { data } = await client
    .from('contract')
    .select(
      'id, extends_to, note, versions:contract_version(id, version, signing_status)',
    )
    .eq('parent_contract_id', loiId)
    .throwOnError();

  return data;
}

function newest<Version extends { version: number }>(
  versions: Version[],
): Version | undefined {
  return versions.toSorted((a, b) => b.version - a.version)[0];
}

function refuseWithoutDocumenso(): void {
  if (!isDocumensoConfigured()) {
    throw new Refusal(DOCUMENSO_NOT_CONFIGURED);
  }
}

async function settleSignature(
  client: SupabaseClient<Database>,
  latest: { id: string; signing_status: string | null } | undefined,
): Promise<boolean> {
  if (latest?.signing_status !== 'draft' && latest?.signing_status !== 'sent') {
    return false;
  }

  await checkContractSignature(latest.id, {
    client,
    admin: getSupabaseServerAdminClient(),
    documenso: createDocumensoClient(),
  });

  return true;
}

async function recordedTemplateId(
  client: SupabaseClient<Database>,
  contractId: string,
): Promise<string | null> {
  const { data } = await client
    .from('generated_document')
    .select('template_id')
    .eq('contract_id', contractId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
    .throwOnError();

  return data?.template_id ?? null;
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
      `No ${CONTRACT_NAME[type]} template is set up for this account`,
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
