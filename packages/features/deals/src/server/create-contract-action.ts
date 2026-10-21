'use server';

import type { SupabaseClient } from '@supabase/supabase-js';

import { z } from 'zod';

import {
  APA_NEEDS_COUNSEL,
  contractTypeSchema,
  createContractRecord,
} from '@odb/contracts';
import type { Database } from '@odb/supabase';
import { getSupabaseServerClient } from '@odb/supabase/server';
import {
  checkTemplateFields,
  generateFromTemplate,
} from '@odb/templates/server';

import {
  contractFieldValues,
  dealOfferFieldInput,
} from './contract-field-values';
import { Refusal, refusableAction } from './refusal';

const createContractSchema = z.object({
  dealId: z.string(),
  type: contractTypeSchema,
  fromTemplateId: z.string().optional(),
});

export const createContract = refusableAction(
  async (input, user) => {
    const client = getSupabaseServerClient();

    if (input.type === 'apa') {
      await refuseWithoutCounsel(client, input.dealId);
    }

    if (input.fromTemplateId) {
      const { data: deal } = await client
        .from('deal')
        .select('account_id')
        .eq('id', input.dealId)
        .single()
        .throwOnError();

      await checkTemplateFields({
        accountId: deal.account_id,
        templateId: input.fromTemplateId,
        dealId: input.dealId,
        fieldValues: await fieldValuesFor(
          client,
          input.dealId,
          deal.account_id,
        ),
      });
    }

    return createContractRecord(input, {
      client,
      createdByUserId: user.id,
      async generateVersionOne({ accountId, dealId, templateId }) {
        const generated = await generateFromTemplate({
          accountId,
          templateId,
          dealId,
          fieldValues: await fieldValuesFor(client, dealId, accountId),
        });

        return {
          generatedDocumentId: generated.id,
          docxPath: generated.docx_path,
          pdfPath: generated.pdf_path,
        };
      },
    });
  },
  createContractSchema,
  {
    what: 'draft contracts',
    needs: 'deals.work',
    dealId: (input) => input.dealId,
  },
);

async function refuseWithoutCounsel(
  client: SupabaseClient<Database>,
  dealId: string,
): Promise<void> {
  const { data: ready } = await client
    .rpc('apa_counsel_ready', { deal_id: dealId })
    .throwOnError();

  if (!ready) {
    throw new Refusal(APA_NEEDS_COUNSEL);
  }
}

async function fieldValuesFor(
  client: SupabaseClient<Database>,
  dealId: string,
  accountId: string,
) {
  return contractFieldValues(
    client,
    await dealOfferFieldInput(client, dealId, accountId),
  );
}
