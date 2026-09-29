import { mapSbaRows, type SbaCompFacts, type SbaProgram } from '@odb/comps';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import Papa from 'papaparse';

const CKAN_PACKAGE_SHOW = 'https://data.sba.gov/api/3/action/package_show?id=7a-504-foia';

interface CkanResource {
  url: string;
  name?: string;
  format?: string;
}

export interface SbaResources {
  sevenA: string[];
  fiveOhFour: string[];
}

export async function discoverSbaResources(): Promise<SbaResources> {
  const response = await fetch(CKAN_PACKAGE_SHOW);
  const body = (await response.json()) as { result?: { resources?: CkanResource[] } };
  const resources = body.result?.resources ?? [];

  const sevenA: string[] = [];
  const fiveOhFour: string[] = [];

  for (const resource of resources) {
    const isCsv = /csv/i.test(resource.format ?? '') || /\.csv$/i.test(resource.url);
    if (!isCsv) {
      continue;
    }
    const label = `${resource.name ?? ''} ${resource.url}`;
    if (/504/.test(label)) {
      fiveOhFour.push(resource.url);
    } else if (/7\(?a\)?/i.test(label)) {
      sevenA.push(resource.url);
    }
  }

  return { sevenA, fiveOhFour };
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
