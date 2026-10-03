'use server';

import { extractText, getDocumentProxy } from 'unpdf';

import { appendDealEvent } from '@odb/events';
import { enhanceAction } from '@odb/next/actions';
import { getSupabaseServerClient } from '@odb/supabase/server';

import {
  createDealFromIntakePdfSchema,
  createDealFromIntakeSchema,
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

export const rerunDealIntake = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();

    const { data: deal } = await client
      .from('deal')
      .select('account_id')
      .eq('id', data.deal_id)
      .single()
      .throwOnError();

    const draft = await extractDealIntake(client, deal.account_id, data.text);

    await appendDealEvent(client, {
      dealId: data.deal_id,
      aggregateType: 'deal',
      aggregateId: data.deal_id,
      eventType: 'deal.updated',
      payload: dealUpdateFromIntakeDraft(draft),
    });

    return { success: true };
  },
  { auth: true, schema: rerunDealIntakeSchema },
);
