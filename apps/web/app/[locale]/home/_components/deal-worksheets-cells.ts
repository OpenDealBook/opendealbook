import {
  deriveWorksheetRow,
  WORKSHEET_FIELD_CATALOG,
  type DealWorksheetType,
  type WorksheetField,
  type WorksheetRowData,
} from '@odb/deals/shared';

const NO_DATA = 'No data';

interface ComputedField {
  key: string;
  label: string;
  kind: 'currency' | 'percent';
}

const COMPUTED_FIELD_CATALOG: Record<DealWorksheetType, ComputedField[]> = {
  margin_analysis: [
    { key: 'margin', label: 'Margin', kind: 'currency' },
    { key: 'margin_pct', label: 'Margin %', kind: 'percent' },
  ],
  marketing_effectiveness: [{ key: 'cac', label: 'CAC', kind: 'currency' }],
  retention_plan: [],
  process_sop: [],
};

function formatCurrency(value: number | null): string {
  return value === null ? NO_DATA : `$${Math.round(value).toLocaleString('en-US')}`;
}

function formatPercent(value: number | null): string {
  return value === null ? NO_DATA : `${(value * 100).toFixed(1)}%`;
}

function formatStoredValue(
  field: WorksheetField,
  value: string | number | null,
): string {
  if (value === null || value === undefined || value === '') {
    return NO_DATA;
  }

  return field.kind === 'currency' ? formatCurrency(Number(value)) : String(value);
}

export interface WorksheetColumn {
  key: string;
  label: string;
}

export function worksheetColumns(type: DealWorksheetType): WorksheetColumn[] {
  return [
    ...WORKSHEET_FIELD_CATALOG[type].map((field) => ({
      key: field.key,
      label: field.label,
    })),
    ...COMPUTED_FIELD_CATALOG[type].map((field) => ({
      key: field.key,
      label: field.label,
    })),
  ];
}

export interface WorksheetDisplayCell {
  key: string;
  label: string;
  value: string;
}

export function worksheetDisplayCells(
  type: DealWorksheetType,
  data: WorksheetRowData,
): WorksheetDisplayCell[] {
  const fieldCells = WORKSHEET_FIELD_CATALOG[type].map((field) => ({
    key: field.key,
    label: field.label,
    value: formatStoredValue(field, data[field.key] ?? null),
  }));

  const derived = deriveWorksheetRow(type, data);

  const computedCells = COMPUTED_FIELD_CATALOG[type].map((field) => ({
    key: field.key,
    label: field.label,
    value:
      field.kind === 'percent'
        ? formatPercent(derived[field.key] ?? null)
        : formatCurrency(derived[field.key] ?? null),
  }));

  return [...fieldCells, ...computedCells];
}
