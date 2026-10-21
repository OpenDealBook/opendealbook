'use server';

import { getSupabaseServerClient } from '@odb/supabase/server';

import { worksheetRowIdSchema, worksheetRowSchema } from '../schema/worksheet.schema';
import { refusableAction } from './refusal';

export const saveWorksheetRow = refusableAction(
  async (data) => {
    const client = getSupabaseServerClient();

    const { id, deal_id, ...fields } = data;

    const { data: deal } = await client
      .from('deal')
      .select('account_id')
      .eq('id', deal_id)
      .single()
      .throwOnError();

    if (id) {
      const { data: row } = await client
        .from('deal_worksheet_row')
        .update(fields)
        .eq('id', id)
        .select('*')
        .single()
        .throwOnError();

      return row;
    }

    const { data: row } = await client
      .from('deal_worksheet_row')
      .insert({ deal_id, account_id: deal.account_id, ...fields })
      .select('*')
      .single()
      .throwOnError();

    return row;
  },
  worksheetRowSchema,
  { what: 'edit worksheets', needs: 'deals.work' },
);

export const deleteWorksheetRow = refusableAction(
  async (data) => {
    const client = getSupabaseServerClient();

    await client
      .from('deal_worksheet_row')
      .delete()
      .eq('id', data.id)
      .throwOnError();

    return { success: true };
  },
  worksheetRowIdSchema,
  { what: 'edit worksheets', needs: 'deals.work' },
);
