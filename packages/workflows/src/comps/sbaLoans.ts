import { mapSbaRows, type SbaCompFacts, type SbaProgram } from '@odb/comps';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import Papa from 'papaparse';

import { fetchSbaFiles } from '../leadImports/discover';

export interface SbaResources {
  sevenA: string[];
  fiveOhFour: string[];
}

export async function discoverSbaResources(): Promise<SbaResources> {
  const files = await fetchSbaFiles();
  const urls = (kind: 'sba_7a' | 'sba_504') => files.filter((file) => file.kind === kind).map((file) => file.url);
  return { sevenA: urls('sba_7a'), fiveOhFour: urls('sba_504') };
}

export async function loadDealBoxNaicsUnion(): Promise<string[]> {
  const client = getSupabaseServerAdminClient();
  const { data, error } = await client.from('deal_box').select('criteria_json');

  if (error) {
    throw error;
  }

  const codes = new Set<string>();
  for (const row of data) {
    const criteria = row.criteria_json as { naics?: string[] | null } | null;
    for (const code of criteria?.naics ?? []) {
      codes.add(code.trim());
    }
  }

  return [...codes];
}

function toCompRow(facts: SbaCompFacts) {
  return {
    account_id: null,
    data_class: 'external' as const,
    source: facts.source,
    source_label: facts.sourceLabel,
    price_basis: facts.priceBasis,
    confidence: facts.confidence,
    source_ref: facts.sourceRef,
    naics_code: facts.naicsCode,
    industry: facts.naicsDescription,
    state: facts.state,
    close_date: facts.approvalDate,
    sale_price: facts.price,
  };
}

export interface RefreshSbaProgramInput {
  program: SbaProgram;
  urls: string[];
  naicsCodes: string[];
  ratio: number;
}

export async function refreshSbaProgram(
  input: RefreshSbaProgramInput,
): Promise<{ upserted: number }> {
  const client = getSupabaseServerAdminClient();
  let upserted = 0;

  for (const url of input.urls) {
    const text = await (await fetch(url)).text();
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
    });

    const facts = mapSbaRows(parsed.data, {
      naicsCodes: input.naicsCodes,
      ratio: input.ratio,
    });

    if (facts.length === 0) {
      continue;
    }

    const rows = facts.map(toCompRow);
    const { error } = await client.from('comp').upsert(rows, { onConflict: 'source,source_ref' });

    if (error) {
      throw error;
    }

    upserted += rows.length;
  }

  return { upserted };
}
