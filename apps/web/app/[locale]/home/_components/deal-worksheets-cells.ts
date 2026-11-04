import {
  deriveWorksheetRow,
  WORKSHEET_FIELD_CATALOG,
  type DealWorksheetType,
  type WorksheetField,
  type WorksheetRowData,
} from '@odb/deals/shared';

import type { Shown } from './shown-value';

interface ComputedField {
  key: string;
  label: string;
  kind: 'money' | 'percent';
}

const COMPUTED_FIELD_CATALOG: Record<DealWorksheetType, ComputedField[]> = {
  margin_analysis: [
    { key: 'margin', label: 'Margin', kind: 'money' },
    { key: 'margin_pct', label: 'Margin %', kind: 'percent' },
  ],
  marketing_effectiveness: [{ key: 'cac', label: 'CAC', kind: 'money' }],
  retention_plan: [],
  process_sop: [],
};

function storedValue(
  field: WorksheetField,
  value: string | number | null,
): Shown {
  if (value === null || value === undefined || value === '') {
    return { kind: field.kind === 'currency' ? 'money' : 'text', value: null };
  }

  return field.kind === 'currency'
    ? { kind: 'money', value: Number(value) }
    : { kind: 'text', value: String(value) };
}

export interface WorksheetColumn {
  key: string;
  label: string;
  numeric: boolean;
}

export function isNumericField(field: WorksheetField): boolean {
  return field.kind === 'currency' || field.kind === 'number';
}

export function worksheetColumns(type: DealWorksheetType): WorksheetColumn[] {
  return [
    ...WORKSHEET_FIELD_CATALOG[type].map((field) => ({
      key: field.key,
      label: field.label,
      numeric: isNumericField(field),
    })),
    ...COMPUTED_FIELD_CATALOG[type].map((field) => ({
      key: field.key,
      label: field.label,
      numeric: true,
    })),
  ];
}

export interface WorksheetDisplayCell {
  key: string;
  label: string;
  shown: Shown;
}

export function worksheetDisplayCells(
  type: DealWorksheetType,
  data: WorksheetRowData,
): WorksheetDisplayCell[] {
  const fieldCells = WORKSHEET_FIELD_CATALOG[type].map((field) => ({
    key: field.key,
    label: field.label,
    shown: storedValue(field, data[field.key] ?? null),
  }));

  const derived = deriveWorksheetRow(type, data);

  const computedCells = COMPUTED_FIELD_CATALOG[type].map((field) => ({
    key: field.key,
    label: field.label,
    shown: { kind: field.kind, value: derived[field.key] ?? null },
  }));

  return [...fieldCells, ...computedCells];
}
