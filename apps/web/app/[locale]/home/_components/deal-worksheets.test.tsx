// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearScreen,
  field,
  press,
  show,
} from '@odb/lender-rooms/requests-ui/test-support/screen.ts';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {} }) }));
vi.mock('@odb/deals/server', () => ({
  deleteWorksheetRow: vi.fn(),
  saveWorksheetRow: vi.fn(),
}));

import { DealWorksheets } from './deal-worksheets';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

afterEach(clearScreen);

describe('DealWorksheets', () => {
  it('ties every new-row label to its input', () => {
    const html = renderToStaticMarkup(
      <DealWorksheets dealId={'deal-1'} rows={[]} />,
    );

    for (const label of ['Line item', 'Revenue', 'Flight risk']) {
      const id = new RegExp(
        `<label[^>]*for="([^"]+)"[^>]*>${label}</label>`,
      ).exec(html)?.[1];

      expect(id, label).toBeDefined();
      expect(html).toContain(`id="${id}"`);
    }
  });

  it('labels the inputs of a row being edited', async () => {
    show(
      <DealWorksheets
        dealId={'deal-1'}
        rows={[
          {
            id: 'r-1',
            worksheet_type: 'margin_analysis',
            data: {
              line_item: 'Lawn care',
              revenue: 120000,
              direct_cost: 70000,
            },
          } as unknown as Parameters<typeof DealWorksheets>[0]['rows'][number],
        ]}
      />,
    );

    await press('Edit');

    expect(field('Line item, row 1').value).toBe('Lawn care');
    expect(field('Revenue, row 1').value).toBe('120000');
  });
});
