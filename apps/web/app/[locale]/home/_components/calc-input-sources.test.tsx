// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CalcCitation, CalcSources } from '@odb/deals/shared';

import { CitedField } from './calc-input-sources';
import {
  button,
  clearScreen,
  dialogText,
  fakeServer,
  field,
  press,
  show,
  type,
} from './lender-test-kit';

vi.mock('next/navigation', async () => ({
  ...(await import('./lender-test-kit')).navigation,
  useParams: () => ({ account: 'acme', id: 'deal-1' }),
}));
vi.mock('@odb/deals/server', async () =>
  (await import('./lender-test-kit')).fakeActions(
    'addCalcInputCitation',
    'removeCalcInputCitation',
  ),
);

const opened: { url: string; target: string; features: string }[] = [];

beforeEach(() => {
  fakeServer.reset();
  opened.length = 0;
  vi.stubGlobal('open', (url: string, target: string, features: string) => {
    opened.push({ url, target, features });
    return null;
  });
});

afterEach(() => {
  clearScreen();
  vi.unstubAllGlobals();
});

const pnlPage4: CalcCitation = {
  id: 'cite-1',
  rowId: null,
  inputKey: 'sales',
  documentId: 'doc-pnl',
  documentName: 'p-and-l.pdf',
  documentVersion: 1,
  locator: { kind: 'page', page: 4 },
  cell: 'B12',
  newerVersionUploaded: false,
  documentRemoved: false,
};

const workbookSheet: CalcCitation = {
  id: 'cite-2',
  rowId: null,
  inputKey: 'sales',
  documentId: 'doc-book',
  documentName: 'tax-returns.xlsx',
  documentVersion: 2,
  locator: { kind: 'sheet', sheet: 'P&L 2023' },
  cell: null,
  newerVersionUploaded: false,
  documentRemoved: false,
};

function sources(change: Partial<CalcSources> = {}): CalcSources {
  return {
    calcVersionId: 'calc-1',
    dealId: 'deal-1',
    canEdit: true,
    citations: [pnlPage4, workbookSheet],
    documents: [
      {
        id: 'doc-pnl',
        name: 'p-and-l.pdf',
        version: 1,
        locator: 'page',
        latest: true,
      },
      {
        id: 'doc-book-1',
        name: 'tax-returns.xlsx',
        version: 1,
        locator: 'sheet',
        latest: false,
      },
      {
        id: 'doc-book',
        name: 'tax-returns.xlsx',
        version: 2,
        locator: 'sheet',
        latest: true,
      },
      {
        id: 'doc-photo',
        name: 'site-photo.jpg',
        version: 1,
        locator: 'document',
        latest: true,
      },
    ],
    ...change,
  };
}

describe('sources beside a calc input', () => {
  it('counts the sources of one input and lists them where they were found', async () => {
    show(
      <CitedField
        sources={sources({
          citations: [
            pnlPage4,
            workbookSheet,
            { ...pnlPage4, id: 'x', inputKey: 'cogs' },
          ],
        })}
        input={{ rowId: null, field: 'sales' }}
        label={'Sales'}
      >
        <span>Figure</span>
      </CitedField>,
    );

    expect(button('Cite source for Sales').textContent).toBe('2 sources');

    await press('Cite source for Sales');

    expect(dialogText()).toContain('p-and-l.pdf v1, page 4, cell B12');
    expect(dialogText()).toContain('tax-returns.xlsx v2, sheet P&L 2023');
  });

  it('opens the data room window at the cited page, reusing the deal window', async () => {
    show(
      <CitedField
        sources={sources()}
        input={{ rowId: null, field: 'sales' }}
        label={'Sales'}
      >
        <span>Figure</span>
      </CitedField>,
    );
    await press('Cite source for Sales');

    await press('p-and-l.pdf v1, page 4, cell B12');

    expect(opened).toEqual([
      {
        url: '/deal-windows/acme/deal-1/data-room/view?doc=doc-pnl&page=4',
        target: 'data-room-deal-1',
        features: 'popup',
      },
    ]);
  });

  it('opens the data room window at the cited sheet', async () => {
    show(
      <CitedField
        sources={sources()}
        input={{ rowId: null, field: 'sales' }}
        label={'Sales'}
      >
        <span>Figure</span>
      </CitedField>,
    );
    await press('Cite source for Sales');

    await press('tax-returns.xlsx v2, sheet P&L 2023');

    expect(opened[0]?.url).toBe(
      '/deal-windows/acme/deal-1/data-room/view?doc=doc-book&sheet=P%26L+2023',
    );
  });

  it('flags a source whose file has a newer upload or was removed', async () => {
    show(
      <CitedField
        sources={sources({
          citations: [
            { ...pnlPage4, newerVersionUploaded: true },
            { ...workbookSheet, documentRemoved: true },
          ],
        })}
        input={{ rowId: null, field: 'sales' }}
        label={'Sales'}
      >
        <span>Figure</span>
      </CitedField>,
    );
    await press('Cite source for Sales');

    expect(dialogText()).toMatch(
      /p-and-l\.pdf v1, page 4, cell B12\s*Newer version uploaded/,
    );
    expect(dialogText()).toMatch(
      /tax-returns\.xlsx v2, sheet P&L 2023\s*Document removed/,
    );
  });

  it('cites a PDF page with a cell', async () => {
    show(
      <CitedField
        sources={sources({ citations: [] })}
        input={{ rowId: null, field: 'sales' }}
        label={'Sales'}
      >
        <span>Figure</span>
      </CitedField>,
    );
    await press('Cite source for Sales');
    await press('p-and-l.pdf v1');
    await type('Page', '7');
    await type('Cell (optional)', 'C3');

    await press('Add source');

    expect(fakeServer.inputsTo('addCalcInputCitation')).toEqual([
      {
        calc_version_id: 'calc-1',
        input_key: 'sales',
        dr_document_id: 'doc-pnl',
        locator: { kind: 'page', page: 7 },
        cell: 'C3',
      },
    ]);
  });

  it('cites an Excel sheet without a cell', async () => {
    show(
      <CitedField
        sources={sources({ citations: [] })}
        input={{ rowId: null, field: 'sales' }}
        label={'Sales'}
      >
        <span>Figure</span>
      </CitedField>,
    );
    await press('Cite source for Sales');
    await press('tax-returns.xlsx v2');
    await type('Sheet', 'Balance sheet');

    await press('Add source');

    expect(fakeServer.inputsTo('addCalcInputCitation')).toEqual([
      {
        calc_version_id: 'calc-1',
        input_key: 'sales',
        dr_document_id: 'doc-book',
        locator: { kind: 'sheet', sheet: 'Balance sheet' },
      },
    ]);
  });

  it('removes a source', async () => {
    show(
      <CitedField
        sources={sources()}
        input={{ rowId: null, field: 'sales' }}
        label={'Sales'}
      >
        <span>Figure</span>
      </CitedField>,
    );
    await press('Cite source for Sales');

    await press('Remove p-and-l.pdf v1, page 4, cell B12');

    expect(fakeServer.inputsTo('removeCalcInputCitation')).toEqual([
      { calc_version_id: 'calc-1', citation_id: 'cite-1' },
    ]);
  });

  it('shows the refusal when the server refuses', async () => {
    fakeServer.refusal = 'Only deal managers can change sources on this calc.';
    show(
      <CitedField
        sources={sources()}
        input={{ rowId: null, field: 'sales' }}
        label={'Sales'}
      >
        <span>Figure</span>
      </CitedField>,
    );
    await press('Cite source for Sales');

    await press('Remove p-and-l.pdf v1, page 4, cell B12');

    expect(dialogText()).toContain(
      'Only deal managers can change sources on this calc.',
    );
  });

  it('lets someone who cannot edit the calc read and open sources, not change them', async () => {
    show(
      <CitedField
        sources={sources({ canEdit: false })}
        input={{ rowId: null, field: 'sales' }}
        label={'Sales'}
      >
        <span>Figure</span>
      </CitedField>,
    );
    await press('Cite source for Sales');

    expect(dialogText()).toContain('p-and-l.pdf v1, page 4, cell B12');
    expect(dialogText()).not.toContain('Remove');
    expect(dialogText()).not.toContain('Add source');
  });

  it('opens a whole-document citation at the document', async () => {
    show(
      <CitedField
        sources={sources({
          citations: [
            {
              ...pnlPage4,
              documentId: 'doc-photo',
              documentName: 'site-photo.jpg',
              locator: { kind: 'document' },
              cell: null,
            },
          ],
        })}
        input={{ rowId: null, field: 'sales' }}
        label={'Sales'}
      >
        <span>Figure</span>
      </CitedField>,
    );
    await press('Cite source for Sales');

    await press('site-photo.jpg v1');

    expect(opened[0]?.url).toBe(
      '/deal-windows/acme/deal-1/data-room/view?doc=doc-photo',
    );
  });

  it('offers the latest version of each file until older ones are asked for', async () => {
    show(
      <CitedField
        sources={sources({ citations: [] })}
        input={{ rowId: null, field: 'sales' }}
        label={'Sales'}
      >
        <span>Figure</span>
      </CitedField>,
    );
    await press('Cite source for Sales');

    expect(dialogText()).not.toContain('tax-returns.xlsx v1');

    await press('Show older versions');
    await press('tax-returns.xlsx v1');
    await type('Sheet', '2022');
    await press('Add source');

    expect(fakeServer.inputsTo('addCalcInputCitation')).toMatchObject([
      {
        dr_document_id: 'doc-book-1',
        locator: { kind: 'sheet', sheet: '2022' },
      },
    ]);
  });

  it('cites an image as a whole document, without asking for a page or sheet', async () => {
    show(
      <CitedField
        sources={sources({ citations: [] })}
        input={{ rowId: 'period-a', field: 'sales' }}
        label={'Sales, period 1'}
      >
        <span>Figure</span>
      </CitedField>,
    );
    await press('Cite source for Sales, period 1');
    await press('site-photo.jpg v1');

    expect(dialogText()).not.toContain('Page');
    expect(dialogText()).not.toContain('Sheet');
    expect(dialogText()).not.toContain('Cell');

    await press('Add source');

    expect(fakeServer.inputsTo('addCalcInputCitation')).toEqual([
      {
        calc_version_id: 'calc-1',
        row_id: 'period-a',
        input_key: 'sales',
        dr_document_id: 'doc-photo',
        locator: { kind: 'document' },
      },
    ]);
  });

  it('puts the source count under its input rather than beside it', () => {
    show(
      <CitedField
        sources={sources()}
        input={{ rowId: null, field: 'sales' }}
        label={'Sales'}
      >
        <input aria-label={'Sales'} />
      </CitedField>,
    );
    const cell = button('Cite source for Sales').parentElement!;

    expect(cell.contains(field('Sales'))).toBe(true);
    expect(cell.className).toMatch(/\bflex-col\b/);
  });
});
