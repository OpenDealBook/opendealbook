import { describe, expect, it } from 'vitest';

import { dedupeFirms } from './dedupe';
import type { NormalizedFirmRow } from './types';

function row(overrides: Partial<NormalizedFirmRow>): NormalizedFirmRow {
  return {
    name: 'Firm',
    industry: null,
    city: null,
    state: null,
    website: null,
    employee_band: null,
    established_year: null,
    owner_name: null,
    owner_age_estimate: null,
    source_url: null,
    phone: null,
    ...overrides,
  };
}

describe('dedupeFirms', () => {
  it('drops rows whose website matches an existing firm', () => {
    const result = dedupeFirms(
      [row({ website: 'https://Acme.com/' })],
      [{ website: 'acme.com', phone: null }],
    );

    expect(result).toHaveLength(0);
  });

  it('drops rows whose phone matches an existing firm', () => {
    const result = dedupeFirms(
      [row({ phone: '(555) 100-2000' })],
      [{ website: null, phone: '5551002000' }],
    );

    expect(result).toHaveLength(0);
  });

  it('drops later duplicates within the same batch', () => {
    const result = dedupeFirms(
      [row({ website: 'acme.com' }), row({ website: 'acme.com' })],
      [],
    );

    expect(result).toHaveLength(1);
  });

  it('keeps rows with neither website nor phone', () => {
    const result = dedupeFirms([row({}), row({})], []);

    expect(result).toHaveLength(2);
  });

  it('keeps distinct rows', () => {
    const result = dedupeFirms(
      [row({ website: 'acme.com' }), row({ website: 'beta.com' })],
      [],
    );

    expect(result).toHaveLength(2);
  });
});
