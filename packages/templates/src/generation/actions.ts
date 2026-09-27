'use server';

import type { SupabaseClient } from '@supabase/supabase-js';

import { z } from 'zod';

import { enhanceAction } from '@tuckin/next/actions';
import type { Database } from '@tuckin/supabase';
import { getSupabaseServerClient } from '@tuckin/supabase/server';

import { assertDealsManager } from '../permissions';
import { createSupabaseTemplateStorage } from '../storage';
import { createSuperdocEngine } from '../superdoc';
import { generateDocument, type LoadedTemplate } from './generate-document';
import type { DealContext } from './resolve-fields';

const generateFromTemplateSchema = z.object({
  accountId: z.string(),
  templateId: z.string(),
  dealId: z.string(),
  fieldValues: z.record(z.string(), z.unknown()).default({}),
});

export const generateFromTemplate = enhanceAction(
  async (input, user) => {
    const client = getSupabaseServerClient();

    await assertDealsManager(client, input.accountId, user.id);

    const template = await loadTemplate(client, input.templateId);
    const deal = await loadDealContext(client, input.dealId);

    const row = await generateDocument(
      { template, deal, fieldValues: input.fieldValues },
      {
        engine: createSuperdocEngine(),
        storage: createSupabaseTemplateStorage(client),
      },
    );

    const { data, error } = await client
      .from('generated_document')
      .insert({ ...row, created_by: user.id })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return data;
  },
  { auth: true, schema: generateFromTemplateSchema },
);

async function loadTemplate(
  client: SupabaseClient<Database>,
  templateId: string,
): Promise<LoadedTemplate> {
  const { data: row, error } = await client
    .from('document_template')
    .select('*')
    .eq('id', templateId)
    .single();

  if (error) {
    throw error;
  }

  const { data: fields, error: fieldsError } = await client
    .from('template_field')
    .select('*')
    .eq('template_id', templateId)
    .order('sort_order', { ascending: true });

  if (fieldsError) {
    throw fieldsError;
  }

  return { row, fields: fields ?? [] };
}

async function loadDealContext(
  client: SupabaseClient<Database>,
  dealId: string,
): Promise<DealContext> {
  const { data: deal, error } = await client
    .from('deal')
    .select('*')
    .eq('id', dealId)
    .single();

  if (error) {
    throw error;
  }

  const firm = deal.firm_id
    ? (await client.from('firm').select('*').eq('id', deal.firm_id).single())
        .data
    : null;

  const { data: account } = await client
    .from('accounts')
    .select('*')
    .eq('id', deal.account_id)
    .single();

  return { deal, firm, account: account ?? {} };
}
