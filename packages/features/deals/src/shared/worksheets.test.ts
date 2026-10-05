import { describe, expect, it } from 'vitest';

import {
  WORKSHEET_FIELD_CATALOG,
  type DealWorksheetType,
  deriveWorksheetRow,
} from './worksheets';

// Rules under test:
//   - the catalog defines an ordered field list for all four worksheet
//     types, each field carrying a key, label and kind, and a select field
//     also carrying its options.
//   - margin_analysis derives margin = revenue - direct_cost and
//     margin_pct = margin / revenue, each null when an input is missing or
//     revenue is 0.
//   - marketing_effectiveness derives cac = spend / customers, null when an
//     input is missing or customers is 0.
//   - retention_plan and process_sop derive nothing.

const WORKSHEET_TYPES: DealWorksheetType[] = [
  'margin_analysis',
  'retention_plan',
  'process_sop',
  'marketing_effectiveness',
];

describe('WORKSHEET_FIELD_CATALOG', () => {
  it('defines every worksheet type', () => {
    for (const type of WORKSHEET_TYPES) {
      expect(WORKSHEET_FIELD_CATALOG[type]).toBeDefined();
      expect(WORKSHEET_FIELD_CATALOG[type].length).toBeGreaterThan(0);
    }
  });

  it('gives every field a key, label and kind', () => {
    for (const type of WORKSHEET_TYPES) {
      for (const field of WORKSHEET_FIELD_CATALOG[type]) {
        expect(typeof field.key).toBe('string');
        expect(typeof field.label).toBe('string');
        expect(['text', 'number', 'currency', 'select']).toContain(
          field.kind,
        );
      }
    }
  });

  it('gives every select field a non-empty options list', () => {
    for (const type of WORKSHEET_TYPES) {
      for (const field of WORKSHEET_FIELD_CATALOG[type]) {
        if (field.kind === 'select') {
          expect(field.options?.length ?? 0).toBeGreaterThan(0);
        }
      }
    }
  });

  it('includes the flight_risk and status select fields for retention_plan', () => {
    const keys = WORKSHEET_FIELD_CATALOG.retention_plan.map((f) => f.key);
    expect(keys).toEqual(
      expect.arrayContaining(['flight_risk', 'status']),
    );
  });
});

describe('deriveWorksheetRow margin_analysis', () => {
  it('derives margin and margin_pct from revenue and direct_cost', () => {
    const derived = deriveWorksheetRow('margin_analysis', {
      revenue: 100,
      direct_cost: 60,
    });

    expect(derived.margin).toBe(40);
    expect(derived.margin_pct).toBe(0.4);
  });

  it('is a null margin when either input is missing', () => {
    expect(
      deriveWorksheetRow('margin_analysis', { revenue: 100, direct_cost: null }).margin,
    ).toBeNull();
    expect(
      deriveWorksheetRow('margin_analysis', { direct_cost: 60 }).margin,
    ).toBeNull();
  });

  it('is a null margin_pct when revenue is 0 or margin is null', () => {
    expect(
      deriveWorksheetRow('margin_analysis', { revenue: 0, direct_cost: 0 })
        .margin_pct,
    ).toBeNull();
    expect(
      deriveWorksheetRow('margin_analysis', { revenue: null, direct_cost: 60 })
        .margin_pct,
    ).toBeNull();
  });
});

describe('deriveWorksheetRow marketing_effectiveness', () => {
  it('derives cac from spend and customers', () => {
    const derived = deriveWorksheetRow('marketing_effectiveness', {
      spend: 1000,
      customers: 4,
    });

    expect(derived.cac).toBe(250);
  });

  it('is a null cac when customers is 0 or missing', () => {
    expect(
      deriveWorksheetRow('marketing_effectiveness', { spend: 1000, customers: 0 })
        .cac,
    ).toBeNull();
    expect(
      deriveWorksheetRow('marketing_effectiveness', { spend: 1000 }).cac,
    ).toBeNull();
    expect(
      deriveWorksheetRow('marketing_effectiveness', { customers: 4 }).cac,
    ).toBeNull();
  });
});

describe('deriveWorksheetRow with no derived fields', () => {
  it('derives nothing for retention_plan', () => {
    expect(
      deriveWorksheetRow('retention_plan', { employee: 'Jane' }),
    ).toEqual({});
  });

  it('derives nothing for process_sop', () => {
    expect(deriveWorksheetRow('process_sop', { process: 'Invoicing' })).toEqual(
      {},
    );
  });
});
