import type { SupabaseClient, User } from '@supabase/supabase-js';

import { type ContractType, createSupabaseContractStorage } from '@odb/contracts';
import {
  createDocumensoClient,
  type DocumensoSigner,
  sendForSignature,
} from '@odb/contracts/esign';
import { appendDealEvent } from '@odb/events';
import type { Database } from '@odb/supabase';
import { generateFromTemplate } from '@odb/templates/server';

export interface GenerateContractInput {
  client: SupabaseClient<Database>;
  user: User;
  dealId: string;
  accountId: string;
  offerVersionId: string;
  terms: Record<string, unknown>;
  type: ContractType;
}

export async function generateContract(
  input: GenerateContractInput,
): Promise<string> {
  const templateId = await placeholderTemplateId(
    input.client,
    input.accountId,
    input.type,
  );

  const contractId = crypto.randomUUID();

  await appendDealEvent(input.client, {
    dealId: input.dealId,
    aggregateType: 'contract',
    aggregateId: contractId,
    eventType: 'contract.created',
    payload: {
      type: input.type,
      status: 'draft',
      current_version: 0,
      source_offer_version_id: input.offerVersionId,
    },
  });

  const generated = await generateFromTemplate({
    accountId: input.accountId,
    templateId,
    dealId: input.dealId,
    fieldValues: input.terms,
  });

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
      pdf_path: generated.pdf_path,
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

  await sendForSignature(
    {
      contractVersionId: contractVersion.id,
      signers: [contractSigner(input.user)],
    },
    {
      client: input.client,
      storage: createSupabaseContractStorage(input.client),
      documenso: createDocumensoClient(),
    },
  );

  return contractId;
}

function contractSigner(user: User): DocumensoSigner {
  const email = user.email ?? '';
  const name = (user.user_metadata?.name as string | undefined) ?? email;
  return { email, name };
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
    throw new Error(`No ${type} template configured`);
  }

  return data.id;
}
