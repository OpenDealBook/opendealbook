import { Constants } from '@odb/supabase';

import type { LeadFilters } from './leads-pipeline';

type RawSearchParams = Record<string, string | string[] | undefined>;

const VERDICTS: readonly string[] = ['fit', 'not_fit', 'none'];
const SOURCES: readonly string[] = Constants.public.Enums.lead_source;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

function oneOf(
  value: string | string[] | undefined,
  allowed: readonly string[],
) {
  const raw = first(value);

  return allowed.includes(raw) ? raw : '';
}

export function parseLeadParams(params: RawSearchParams): {
  filters: LeadFilters;
  page: number;
} {
  const page = Number(first(params.page));

  return {
    filters: {
      verdict: oneOf(params.verdict, VERDICTS),
      source: oneOf(params.source, SOURCES),
      state: first(params.state),
      q: first(params.q),
    },
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}
