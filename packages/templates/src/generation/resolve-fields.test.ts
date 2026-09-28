import { describe, expect, it } from 'vitest';

import type { Tables } from '@odb/supabase';

import {
  type DealContext,
  formatFieldValue,
  resolveFieldValues,
} from './resolve-fields';

function field(
  overrides: Partial<Tables<'template_field'>>,
): Tables<'template_field'> {
  return {
    id: 'f',
    template_id: 't',
    key: 'k',
    label: null,
    type: 'text',
    source: 'manual',
    source_path: null,
    format: null,
    required: false,
    sort_order: 0,
    ...overrides,
  };
}

function context(overrides: Partial<DealContext> = {}): DealContext {
  return {
    deal: {
      id: 'd1',
      asking_price: 250000,
      close_date: '2026-02-01',
    } as unknown as Tables<'deal'>,
    firm: { name: 'Acme LLC' } as unknown as Tables<'firm'>,
    account: { name: 'Buyer Fund' },
    ...overrides,
  };
}

describe('resolveFieldValues', () => {
  it('reads each field from its declared source path', () => {
    const { values } = resolveFieldValues(
      [
        field({ key: 'firm.name', source: 'firm', source_path: 'name' }),
        field({ key: 'account.name', source: 'account', source_path: 'name' }),
      ],
      context(),
      {},
    );

    expect(values['firm.name']).toBe('Acme LLC');
    expect(values['account.name']).toBe('Buyer Fund');
  });

  it('reads manual fields from the supplied values', () => {
    const { values } = resolveFieldValues(
      [field({ key: 'buyer_name', source: 'manual' })],
      context(),
      { buyer_name: 'Jordan Reyes' },
    );

    expect(values['buyer_name']).toBe('Jordan Reyes');
  });

  it('keeps the raw resolved value in values_json', () => {
    const { valuesJson } = resolveFieldValues(
      [
        field({
          key: 'deal.asking_price',
          source: 'deal',
          source_path: 'asking_price',
        }),
      ],
      context(),
      {},
    );

    expect(valuesJson['deal.asking_price']).toBe(250000);
  });

  it('resolves an empty string when a firm relation is absent', () => {
    const { values } = resolveFieldValues(
      [field({ key: 'firm.name', source: 'firm', source_path: 'name' })],
      context({ firm: null }),
      {},
    );

    expect(values['firm.name']).toBe('');
  });
});

describe('formatFieldValue', () => {
  it('formats currency using the format as the ISO code', () => {
    expect(formatFieldValue(250000, 'currency', 'USD')).toBe('$250,000.00');
  });

  it('formats percent with a trailing sign', () => {
    expect(formatFieldValue(12.5, 'percent', null)).toBe('12.5%');
  });

  it('formats a date to an ISO day', () => {
    expect(formatFieldValue('2026-02-01T10:00:00Z', 'date', null)).toBe(
      '2026-02-01',
    );
  });

  it('joins a list', () => {
    expect(formatFieldValue(['a', 'b'], 'list', null)).toBe('a, b');
  });

  it('returns an empty string for a missing value', () => {
    expect(formatFieldValue(null, 'text', null)).toBe('');
  });
});
