export interface ExternalCompRecord {
  sourceRef: string;
  priceBasis: string | null;
  confidence: string | null;
  naicsCode: string | null;
  industry: string | null;
  region: string | null;
  state: string | null;
  closeDate: string | null;
  askingPrice: number | null;
  salePrice: number | null;
  revenue: number | null;
  sde: number | null;
  ebitda: number | null;
}

export interface CompIngestionCriteria {
  naics?: string[];
}

export interface CompProvider {
  readonly source: string;
  readonly sourceLabel: string;
  fetchComps(criteria: CompIngestionCriteria): Promise<ExternalCompRecord[]>;
}

export interface CompUpsertClient {
  from(table: string): {
    upsert(
      rows: unknown[],
      options: { onConflict: string },
    ): PromiseLike<{ error: unknown }>;
  };
}

export interface IngestExternalCompsDeps {
  client: CompUpsertClient;
  criteria: CompIngestionCriteria;
}

function toCompRow(provider: CompProvider, record: ExternalCompRecord) {
  return {
    account_id: null,
    data_class: 'external' as const,
    source: provider.source,
    source_label: provider.sourceLabel,
    source_ref: record.sourceRef,
    price_basis: record.priceBasis,
    confidence: record.confidence,
    naics_code: record.naicsCode,
    industry: record.industry,
    region: record.region,
    state: record.state,
    close_date: record.closeDate,
    asking_price: record.askingPrice,
    sale_price: record.salePrice,
    revenue: record.revenue,
    sde: record.sde,
    ebitda: record.ebitda,
  };
}

export async function ingestExternalComps(
  provider: CompProvider,
  deps: IngestExternalCompsDeps,
): Promise<{ upserted: number }> {
  const records = await provider.fetchComps(deps.criteria);
  if (records.length === 0) {
    return { upserted: 0 };
  }

  const rows = records.map((record) => toCompRow(provider, record));
  const { error } = await deps.client.from('comp').upsert(rows, { onConflict: 'source,source_ref' });
  if (error) {
    throw error;
  }

  return { upserted: rows.length };
}

export class NullCompProvider implements CompProvider {
  readonly source = 'null';
  readonly sourceLabel = 'Placeholder (no external provider configured)';

  async fetchComps(): Promise<ExternalCompRecord[]> {
    return [];
  }
}
