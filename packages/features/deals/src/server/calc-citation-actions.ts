'use server';

import { z } from 'zod';

import { getSupabaseServerClient } from '@odb/supabase/server';

import {
  addCalcInputCitationSchema,
  removeCalcInputCitationSchema,
} from '../schema/calc-citation.schema';
import { Refusal, refusableAction } from './refusal';

type Client = ReturnType<typeof getSupabaseServerClient>;

const REFUSALS = {
  outsider: 'Only the deal team can change sources.',
  read_only: "Read-only members can't change sources.",
  not_yours:
    "You can change sources only on your own versions that aren't primary or adopted.",
};

const refusalSchema = z.enum(['outsider', 'read_only', 'not_yours']).nullable();

async function refuseUnlessEditable(client: Client, calcVersionId: string) {
  const { data } = await client
    .rpc('calc_citation_refusal', { calc_version_id: calcVersionId })
    .throwOnError();
  const reason = refusalSchema.parse(data);

  if (reason !== null) {
    throw new Refusal(REFUSALS[reason]);
  }
}

async function refuseUnlessRowSaved(
  client: Client,
  calcVersionId: string,
  rowId: string,
) {
  const [periods, lines, funding] = await Promise.all([
    client
      .from('sde_period')
      .select('id')
      .eq('id', rowId)
      .eq('calc_version_id', calcVersionId)
      .throwOnError(),
    client
      .from('sde_line')
      .select('id, sde_period!inner(calc_version_id)')
      .eq('id', rowId)
      .eq('sde_period.calc_version_id', calcVersionId)
      .throwOnError(),
    client
      .from('funding_source')
      .select('id')
      .eq('id', rowId)
      .eq('calc_version_id', calcVersionId)
      .throwOnError(),
  ]);

  if (periods.data.length + lines.data.length + funding.data.length === 0) {
    throw new Refusal('Save the calc to add sources to this row');
  }
}

export const addCalcInputCitation = refusableAction(async (data) => {
  const client = getSupabaseServerClient();
  await refuseUnlessEditable(client, data.calc_version_id);
  if (data.row_id !== undefined) {
    await refuseUnlessRowSaved(client, data.calc_version_id, data.row_id);
  }

  const [{ data: version }, { data: document }] = await Promise.all([
    client
      .from('calc_version')
      .select('account_id')
      .eq('id', data.calc_version_id)
      .single()
      .throwOnError(),
    client
      .from('dr_document')
      .select('name, version')
      .eq('id', data.dr_document_id)
      .single()
      .throwOnError(),
  ]);

  await client
    .from('calc_input_citation')
    .insert({
      account_id: version.account_id,
      calc_version_id: data.calc_version_id,
      row_id: data.row_id ?? null,
      input_key: data.input_key,
      dr_document_id: data.dr_document_id,
      document_name: document.name,
      document_version: document.version,
      page: data.locator.kind === 'page' ? data.locator.page : null,
      sheet: data.locator.kind === 'sheet' ? data.locator.sheet : null,
      cell: data.cell ?? null,
    })
    .throwOnError();
}, addCalcInputCitationSchema);

export const removeCalcInputCitation = refusableAction(async (data) => {
  const client = getSupabaseServerClient();
  await refuseUnlessEditable(client, data.calc_version_id);

  await client
    .from('calc_input_citation')
    .delete()
    .eq('id', data.citation_id)
    .eq('calc_version_id', data.calc_version_id)
    .throwOnError();
}, removeCalcInputCitationSchema);
