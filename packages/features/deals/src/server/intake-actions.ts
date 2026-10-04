'use server';

import { extractText, getDocumentProxy } from 'unpdf';

import { appendDealEvent } from '@odb/events';
import { enhanceAction } from '@odb/next/actions';
import { getSupabaseServerClient } from '@odb/supabase/server';

import {
  createDealFromIntakePdfSchema,
  createDealFromIntakeSchema,
  rerunDealIntakePdfSchema,
  rerunDealIntakeSchema,
} from '../schema/deal-intake.schema';
import { createDealCore } from './deal-actions';
import {
  dealFromIntakeDraft,
  dealUpdateFromIntakeDraft,
  extractDealIntake,
} from './deal-intake';

export const createDealFromIntake = enhanceAction(
  async (data, user) => {
    const client = getSupabaseServerClient();
    const draft = await extractDealIntake(client, data.account_id, data.text);

    return createDealCore(client, dealFromIntakeDraft(data.account_id, draft), user.id);
  },
  { auth: true, schema: createDealFromIntakeSchema },
);

async function pdfToText(base64: string): Promise<string> {
  const pdf = await getDocumentProxy(Uint8Array.from(Buffer.from(base64, 'base64')));
  const { text } = await extractText(pdf, { mergePages: true });

  return text;
}

export const createDealFromIntakePdf = enhanceAction(
  async (data, user) => {
    const client = getSupabaseServerClient();
    const text = await pdfToText(data.pdf);
    const draft = await extractDealIntake(client, data.account_id, text);

    return createDealCore(client, dealFromIntakeDraft(data.account_id, draft), user.id);
  },
  { auth: true, schema: createDealFromIntakePdfSchema },
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

export const rerunDealIntake = enhanceAction(
  async (data) => rerunFromText(getSupabaseServerClient(), data.deal_id, data.text),
  { auth: true, schema: rerunDealIntakeSchema },
);

export const rerunDealIntakePdf = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();
    const text = await pdfToText(data.pdf);

    return rerunFromText(client, data.deal_id, text);
  },
  { auth: true, schema: rerunDealIntakePdfSchema },
);
