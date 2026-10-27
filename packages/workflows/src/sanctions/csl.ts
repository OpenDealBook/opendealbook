import { z } from 'zod';

export const CSL_URL =
  'https://data.trade.gov/downloadable_consolidated_screening_list/v1/consolidated.json';

const CSL_ADDRESS = z.object({
  address: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  postal_code: z.string().nullable(),
  country: z.string().nullable(),
});

const CSL_RESULT = z.object({
  id: z.string(),
  source: z.string(),
  name: z.string(),
  alt_names: z.array(z.string()).nullish(),
  type: z.string().nullish(),
  programs: z.array(z.string()).nullish(),
  addresses: z.array(CSL_ADDRESS).nullish(),
  country: z.string().nullish(),
  source_list_url: z.string(),
});

const CSL_RAW = z.json();

const CSL_FILE = z.object({
  search_performed_at: z.string(),
  sources_used: z.array(
    z.object({ source: z.string(), source_last_updated: z.string() }),
  ),
  results: z.array(CSL_RAW),
});

interface ScreeningEntry {
  list_name: string;
  source_entry_id: string;
  name: string;
  alt_names: string[];
  entry_type: string | null;
  programs: string[];
  addresses: z.infer<typeof CSL_ADDRESS>[];
  countries: string[];
  source_url: string;
  as_of: string;
  raw: z.infer<typeof CSL_RAW>;
}

export function parseCsl(json: string): {
  asOf: string;
  entries: ScreeningEntry[];
} {
  const file = CSL_FILE.parse(JSON.parse(json));
  if (file.results.length === 0) {
    throw new Error('The sanctions list file had no entries');
  }
  const listUpdated = new Map(
    file.sources_used.map((list) => [list.source, list.source_last_updated]),
  );
  return {
    asOf: file.search_performed_at,
    entries: file.results.map((raw) => {
      const result = CSL_RESULT.parse(raw);
      const addresses = result.addresses ?? [];
      return {
        list_name: result.source,
        source_entry_id: result.id,
        name: result.name,
        alt_names: result.alt_names ?? [],
        entry_type: result.type?.toLowerCase() ?? null,
        programs: result.programs ?? [],
        addresses,
        countries: [
          ...new Set(
            [result.country, ...addresses.map((address) => address.country)].filter(
              (country): country is string => Boolean(country),
            ),
          ),
        ],
        source_url: result.source_list_url,
        as_of: listUpdated.get(result.source)!,
        raw,
      };
    }),
  };
}
