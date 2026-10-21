'use server';

import { extractText, getDocumentProxy } from 'unpdf';

import { appendDealEvent } from '@odb/events';
import { getSupabaseServerClient } from '@odb/supabase/server';

import {
  createDealFromIntakeSchema,
  extractDealIntakeFromPdfSchema,
  extractDealIntakeFromTextSchema,
  rerunDealIntakePdfSchema,
  rerunDealIntakeSchema,
} from '../schema/deal-intake.schema';
import { createDealCore } from './deal-actions';
import {
  dealFromIntakeDraft,
  dealUpdateFromIntakeDraft,
  extractDealIntake,
} from './deal-intake';
import { Refusal, refusableAction } from './refusal';

async function pdfToText(base64: string): Promise<string> {
  const pdf = await getDocumentProxy(Uint8Array.from(Buffer.from(base64, 'base64')));
  const { text } = await extractText(pdf, { mergePages: true });

  return text;
}

async function extractForCreator(
  accountId: string,
  userId: string,
  text: () => Promise<string>,
) {
  const client = getSupabaseServerClient();
  const { data: mayCreate } = await client
    .rpc('has_permission', {
      account_id: accountId,
      user_id: userId,
      permission_name: 'deals.create',
    })
    .throwOnError();

  if (!mayCreate) {
    throw new Refusal("Read-only members can't create deals. Ask a deal manager.");
  }

  return extractDealIntake(client, accountId, await text());
}

export const extractDealIntakeFromText = refusableAction(
  async (data, user) =>
    extractForCreator(data.account_id, user.id, async () => data.text),
  extractDealIntakeFromTextSchema,
);

export const extractDealIntakeFromPdf = refusableAction(
  async (data, user) =>
    extractForCreator(data.account_id, user.id, () => pdfToText(data.pdf)),
  extractDealIntakeFromPdfSchema,
);

export const createDealFromIntake = refusableAction(
  async (data, user) =>
    createDealCore(
      getSupabaseServerClient(),
      dealFromIntakeDraft(data, data.draft),
      user.id,
    ),
  createDealFromIntakeSchema,
);

async function rerunFromText(
  client: ReturnType<typeof getSupabaseServerClient>,
  dealId: string,
  text: string,
) {
  const { data: deal } = await client
    .from('deal')
    .select('account_id')
    .eq('id', dealId)
    .single()
    .throwOnError();

  const draft = await extractDealIntake(client, deal.account_id, text);

  await appendDealEvent(client, {
    dealId,
    aggregateType: 'deal',
    aggregateId: dealId,
    eventType: 'deal.updated',
    payload: dealUpdateFromIntakeDraft(draft),
  });

  return { success: true };
}

export const rerunDealIntake = refusableAction(
  async (data) => rerunFromText(getSupabaseServerClient(), data.deal_id, data.text),
  rerunDealIntakeSchema,
  {
    what: 'rerun intake',
    needs: 'deals.manage',
    dealId: (data) => data.deal_id,
  },
);

export const rerunDealIntakePdf = refusableAction(
  async (data) => {
    const client = getSupabaseServerClient();
    const text = await pdfToText(data.pdf);

    return rerunFromText(client, data.deal_id, text);
  },
  rerunDealIntakePdfSchema,
  {
    what: 'rerun intake',
    needs: 'deals.manage',
    dealId: (data) => data.deal_id,
  },
);
