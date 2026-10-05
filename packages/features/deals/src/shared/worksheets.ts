export type DealWorksheetType =
  | 'margin_analysis'
  | 'retention_plan'
  | 'process_sop'
  | 'marketing_effectiveness';

export type WorksheetFieldKind = 'text' | 'number' | 'currency' | 'select';

export interface WorksheetField {
  key: string;
  label: string;
  kind: WorksheetFieldKind;
  options?: string[];
}

export const WORKSHEET_FIELD_CATALOG: Record<
  DealWorksheetType,
  WorksheetField[]
> = {
  margin_analysis: [
    { key: 'line_item', label: 'Line item', kind: 'text' },
    { key: 'revenue', label: 'Revenue', kind: 'currency' },
    { key: 'direct_cost', label: 'Direct cost', kind: 'currency' },
  ],
  retention_plan: [
    { key: 'employee', label: 'Employee', kind: 'text' },
    { key: 'role', label: 'Role', kind: 'text' },
    {
      key: 'flight_risk',
      label: 'Flight risk',
      kind: 'select',
      options: ['low', 'medium', 'high'],
    },
    { key: 'retention_action', label: 'Retention action', kind: 'text' },
    {
      key: 'status',
      label: 'Status',
      kind: 'select',
      options: ['not_started', 'in_progress', 'done'],
    },
  ],
  process_sop: [
    { key: 'process', label: 'Process', kind: 'text' },
    { key: 'owner', label: 'Owner', kind: 'text' },
    {
      key: 'status',
      label: 'Status',
      kind: 'select',
      options: ['not_started', 'in_progress', 'documented'],
    },
    { key: 'link', label: 'Link', kind: 'text' },
  ],
  marketing_effectiveness: [
    { key: 'channel', label: 'Channel', kind: 'text' },
    { key: 'spend', label: 'Spend', kind: 'currency' },
    { key: 'leads', label: 'Leads', kind: 'number' },
    { key: 'customers', label: 'Customers', kind: 'number' },
  ],
};

export type WorksheetRowData = Record<string, string | number | null>;

function numberOrNull(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  return Number(value);
}

function divide(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) {
    return null;
  }

  return numerator / denominator;
}

function deriveMarginAnalysis(
  data: WorksheetRowData,
): Record<string, number | null> {
  const revenue = numberOrNull(data.revenue);
  const direct_cost = numberOrNull(data.direct_cost);
  const margin =
    revenue === null || direct_cost === null ? null : revenue - direct_cost;

  return { margin, margin_pct: divide(margin, revenue) };
}

function deriveMarketingEffectiveness(
  data: WorksheetRowData,
): Record<string, number | null> {
  const spend = numberOrNull(data.spend);
  const customers = numberOrNull(data.customers);

  return { cac: divide(spend, customers) };
}

export function deriveWorksheetRow(
  type: DealWorksheetType,
  data: WorksheetRowData,
): Record<string, number | null> {
  switch (type) {
    case 'margin_analysis':
      return deriveMarginAnalysis(data);
    case 'marketing_effectiveness':
      return deriveMarketingEffectiveness(data);
    case 'retention_plan':
    case 'process_sop':
      return {};
  }
}
