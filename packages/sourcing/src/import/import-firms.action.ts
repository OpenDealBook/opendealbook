import 'server-only';
import { z } from 'zod';

import { enhanceAction } from '@tuckin/next/actions';
import type { TablesInsert } from '@tuckin/supabase';
import { getSupabaseServerClient } from '@tuckin/supabase/server';

import { assertDealsManage } from '../permission';
import { dedupeFirms } from './dedupe';
import { parseFirmCsv } from './parse';

const inputSchema = z.object({
  accountId: z.string().uuid(),
  csvText: z.string(),
  mapping: z.record(z.string(), z.string()),
});

type ImportFirmsInput = z.infer<typeof inputSchema>;

export const importFirmsFromCsv = enhanceAction(
  async (input: ImportFirmsInput, user) => {
    const client = getSupabaseServerClient();

    await assertDealsManage(client, input.accountId, user.id);

    const parsed = parseFirmCsv(input.csvText, input.mapping);

    const existing = await client
      .from('firm')
      .select('website')
      .eq('account_id', input.accountId);

    const unique = dedupeFirms(
      parsed,
      (existing.data ?? []).map((row) => ({
        website: row.website,
        phone: null,
      })),
    );

    const importedAt = new Date().toISOString();
    const inserts: TablesInsert<'firm'>[] = unique.map((row) => ({
      account_id: input.accountId,
      name: row.name ?? '',
      industry: row.industry,
      city: row.city,
      state: row.state,
      website: row.website,
      employee_band: row.employee_band,
      established_year: row.established_year,
      owner_name: row.owner_name,
      owner_age_estimate: row.owner_age_estimate,
      source: 'csv',
      source_url: row.source_url,
      imported_at: importedAt,
      status: 'imported',
    }));

    const inserted = await client.from('firm').insert(inserts).select('id');

    await client.from('data_source').insert({
      account_id: input.accountId,
      type: 'csv',
      config_json: { mapping: input.mapping, importedCount: inserts.length },
      created_by: user.id,
    } satisfies TablesInsert<'data_source'>);

    return { imported: inserted.data?.length ?? 0 };
  },
  { auth: true, schema: inputSchema },
);
