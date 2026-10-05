import { describe, expect, it } from 'vitest';

import { worksheetColumns, worksheetDisplayCells } from './deal-worksheets-cells';

describe('worksheetColumns', () => {
  it('lists catalog fields followed by computed fields for margin_analysis', () => {
    expect(worksheetColumns('margin_analysis').map((column) => column.key)).toEqual([
      'line_item',
      'revenue',
      'direct_cost',
      'margin',
      'margin_pct',
    ]);
  });

  it('has no computed fields for retention_plan', () => {
    expect(worksheetColumns('retention_plan').map((column) => column.key)).toEqual([
      'employee',
      'role',
      'flight_risk',
      'retention_action',
      'status',
    ]);
  });
});

describe('worksheetDisplayCells', () => {
  it('formats stored currency fields and derives margin and margin percent', () => {
    const cells = worksheetDisplayCells('margin_analysis', {
      line_item: 'Widgets',
      revenue: 1000,
      direct_cost: 400,
    });

    expect(cells).toEqual([
      { key: 'line_item', label: 'Line item', value: 'Widgets' },
      { key: 'revenue', label: 'Revenue', value: '$1,000' },
      { key: 'direct_cost', label: 'Direct cost', value: '$400' },
      { key: 'margin', label: 'Margin', value: '$600' },
      { key: 'margin_pct', label: 'Margin %', value: '60.0%' },
    ]);
  });

  it('derives CAC for marketing_effectiveness', () => {
    const cells = worksheetDisplayCells('marketing_effectiveness', {
      channel: 'Paid search',
      spend: 500,
      leads: 50,
      customers: 10,
    });

    expect(cells.find((cell) => cell.key === 'cac')).toEqual({
      key: 'cac',
      label: 'CAC',
      value: '$50',
    });
  });

  it('shows a neutral placeholder for missing values instead of crashing', () => {
    const cells = worksheetDisplayCells('margin_analysis', {
      line_item: null,
      revenue: null,
      direct_cost: null,
    });

    expect(cells).toEqual([
      { key: 'line_item', label: 'Line item', value: 'No data' },
      { key: 'revenue', label: 'Revenue', value: 'No data' },
      { key: 'direct_cost', label: 'Direct cost', value: 'No data' },
      { key: 'margin', label: 'Margin', value: 'No data' },
      { key: 'margin_pct', label: 'Margin %', value: 'No data' },
    ]);
  });

  it('has no computed columns for process_sop', () => {
    const cells = worksheetDisplayCells('process_sop', {
      process: 'Invoicing',
      owner: 'Jane',
      status: 'documented',
      link: null,
    });

    expect(cells.map((cell) => cell.key)).toEqual(['process', 'owner', 'status', 'link']);
  });
});
