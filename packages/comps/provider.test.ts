import { describe, expect, it } from 'vitest';

import {
  NullCompProvider,
  ingestExternalComps,
  type CompProvider,
  type ExternalCompRecord,
} from './provider';

function makeClient() {
  const capture = { upserts: [] as { rows: unknown; onConflict?: string }[] };
  const client = {
    from(_table: string) {
      return {
        upsert(rows: unknown, options?: { onConflict?: string }) {
          capture.upserts.push({ rows, onConflict: options?.onConflict });
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  return { client, capture };
}

const record: ExternalCompRecord = {
  sourceRef: 'deal-1',
  priceBasis: 'reported',
  confidence: 'verified',
  naicsCode: '541211',
  industry: 'Offices of CPAs',
  region: 'West',
  state: 'NV',
  closeDate: '2024-01-15',
  askingPrice: 1_200_000,
  salePrice: 1_100_000,
  revenue: 900_000,
  sde: 400_000,
  ebitda: 350_000,
};

class SampleProvider implements CompProvider {
  readonly source = 'sample_api';
  readonly sourceLabel = 'Sample External API';
  seenCriteria: unknown;
  constructor(private readonly records: ExternalCompRecord[]) {}
  async fetchComps(criteria: { naics?: string[] }): Promise<ExternalCompRecord[]> {
    this.seenCriteria = criteria;
    return this.records;
  }
}

describe('ingestExternalComps', () => {
  it('upserts provider records as external comp rows keyed on source,source_ref', async () => {
    const { client, capture } = makeClient();
    const provider = new SampleProvider([record]);

    const result = await ingestExternalComps(provider, { client, criteria: { naics: ['541211'] } });

    expect(result.upserted).toBe(1);
    expect(capture.upserts).toHaveLength(1);
    expect(capture.upserts[0]!.onConflict).toBe('source,source_ref');
    const rows = capture.upserts[0]!.rows as Array<Record<string, unknown>>;
    expect(rows[0]).toEqual({
      account_id: null,
      data_class: 'external',
      source: 'sample_api',
      source_label: 'Sample External API',
      source_ref: 'deal-1',
      price_basis: 'reported',
      confidence: 'verified',
      naics_code: '541211',
      industry: 'Offices of CPAs',
      region: 'West',
      state: 'NV',
      close_date: '2024-01-15',
      asking_price: 1_200_000,
      sale_price: 1_100_000,
      revenue: 900_000,
      sde: 400_000,
      ebitda: 350_000,
    });
  });

  it('forwards the ingestion criteria to the provider', async () => {
    const { client } = makeClient();
    const provider = new SampleProvider([record]);

    await ingestExternalComps(provider, { client, criteria: { naics: ['111'] } });

    expect(provider.seenCriteria).toEqual({ naics: ['111'] });
  });

  it('upserts nothing when the provider returns no records', async () => {
    const { client, capture } = makeClient();
    const provider = new SampleProvider([]);

    const result = await ingestExternalComps(provider, { client, criteria: {} });

    expect(result.upserted).toBe(0);
    expect(capture.upserts).toHaveLength(0);
  });
});

describe('NullCompProvider', () => {
  it('is a configured external provider that yields no records', async () => {
    const provider: CompProvider = new NullCompProvider();
    expect(provider.source).toBe('null');
    expect(provider.sourceLabel.length).toBeGreaterThan(0);
    expect(await provider.fetchComps({})).toEqual([]);
  });

  it('drives the runner without writing any rows', async () => {
    const { client, capture } = makeClient();
    const result = await ingestExternalComps(new NullCompProvider(), { client, criteria: {} });
    expect(result.upserted).toBe(0);
    expect(capture.upserts).toHaveLength(0);
  });
});
