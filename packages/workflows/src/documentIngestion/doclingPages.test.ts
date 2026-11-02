import { describe, expect, it } from 'vitest';

import type { DoclingDocument } from './docling';
import { pageSegments } from './doclingPages';

function cells(...texts: string[]) {
  return texts.map((text) => ({ text, column_header: false }));
}

function headers(...texts: string[]) {
  return texts.map((text) => ({ text, column_header: true }));
}

const bakeryMemo: DoclingDocument = {
  body: {
    self_ref: '#/body',
    label: 'unspecified',
    children: [
      { $ref: '#/texts/0' },
      { $ref: '#/texts/1' },
      { $ref: '#/groups/0' },
      { $ref: '#/texts/3' },
      { $ref: '#/tables/0' },
      { $ref: '#/tables/1' },
      { $ref: '#/tables/2' },
      { $ref: '#/pictures/0' },
    ],
  },
  groups: [
    {
      self_ref: '#/groups/0',
      label: 'list',
      children: [{ $ref: '#/texts/2' }],
    },
  ],
  texts: [
    {
      self_ref: '#/texts/0',
      label: 'title',
      text: 'Harbor Lane Bakery LLC',
      prov: [{ page_no: 1 }],
      children: [],
    },
    {
      self_ref: '#/texts/1',
      label: 'text',
      text: 'Prepared for Juniper Capital.',
      prov: [{ page_no: 1 }],
      children: [],
    },
    {
      self_ref: '#/texts/2',
      label: 'list_item',
      text: 'Two retail locations',
      prov: [{ page_no: 1 }],
      children: [],
    },
    {
      self_ref: '#/texts/3',
      label: 'section_header',
      text: 'Revenue by year',
      prov: [{ page_no: 2 }],
      children: [],
    },
    {
      self_ref: '#/texts/4',
      label: 'caption',
      text: 'Figure 1. Storefront on Harbor Lane',
      prov: [{ page_no: 6 }],
      children: [],
    },
  ],
  tables: [
    {
      self_ref: '#/tables/0',
      label: 'table',
      prov: [{ page_no: 2 }],
      children: [],
      data: {
        grid: [headers('Year', 'Revenue'), cells('2023', '$1,204,000')],
      },
    },
    {
      self_ref: '#/tables/1',
      label: 'table',
      prov: [{ page_no: 3 }],
      children: [],
      data: {
        grid: [cells('2024', '$1,388,000'), cells('2025', '$1,|51,000')],
      },
    },
    {
      self_ref: '#/tables/2',
      label: 'table',
      prov: [{ page_no: 4 }, { page_no: 5 }],
      children: [],
      data: {
        grid: [headers('Lease', 'Ends'), cells('Harbor Lane', '2031')],
      },
    },
  ],
  pictures: [
    {
      self_ref: '#/pictures/0',
      label: 'picture',
      prov: [{ page_no: 6 }],
      children: [{ $ref: '#/texts/4' }],
    },
  ],
  pages: {
    '1': { page_no: 1 },
    '2': { page_no: 2 },
    '3': { page_no: 3 },
    '4': { page_no: 4 },
    '5': { page_no: 5 },
    '6': { page_no: 6 },
    '7': { page_no: 7 },
  },
};

describe('pageSegments', () => {
  it('renders each page with text as markdown in reading order, keeps a table whole across its pages and repeats the header on a continuation', () => {
    expect(pageSegments(bakeryMemo)).toEqual([
      {
        page_from: 1,
        page_to: 1,
        text: '# Harbor Lane Bakery LLC\n\nPrepared for Juniper Capital.\n\n- Two retail locations',
      },
      {
        page_from: 2,
        page_to: 2,
        text: '## Revenue by year\n\n| Year | Revenue |\n| --- | --- |\n| 2023 | $1,204,000 |',
      },
      {
        page_from: 3,
        page_to: 3,
        text: '| Year | Revenue |\n| --- | --- |\n| 2024 | $1,388,000 |\n| 2025 | $1,\\|51,000 |',
      },
      {
        page_from: 4,
        page_to: 5,
        text: '| Lease | Ends |\n| --- | --- |\n| Harbor Lane | 2031 |',
      },
      {
        page_from: 6,
        page_to: 6,
        text: 'Figure 1. Storefront on Harbor Lane',
      },
    ]);
  });

  it('uses the first row as the header of a table that has none and does not follow another table', () => {
    const ledger: DoclingDocument = {
      body: {
        self_ref: '#/body',
        label: 'unspecified',
        children: [{ $ref: '#/texts/0' }, { $ref: '#/tables/0' }],
      },
      groups: [],
      pictures: [],
      texts: [
        {
          self_ref: '#/texts/0',
          label: 'text',
          text: 'Equipment list',
          prov: [{ page_no: 1 }],
          children: [],
        },
      ],
      tables: [
        {
          self_ref: '#/tables/0',
          label: 'table',
          prov: [{ page_no: 1 }],
          children: [],
          data: { grid: [cells('Oven', '2'), cells('Mixer', '3')] },
        },
      ],
      pages: { '1': { page_no: 1 } },
    };

    expect(pageSegments(ledger)).toEqual([
      {
        page_from: 1,
        page_to: 1,
        text: 'Equipment list\n\n| Oven | 2 |\n| --- | --- |\n| Mixer | 3 |',
      },
    ]);
  });

  it('splits a page over 32,000 characters at item boundaries, each piece keeping the page number', () => {
    const paragraph = (index: number, letter: string) => ({
      self_ref: `#/texts/${index}`,
      label: 'text',
      text: letter.repeat(15_000),
      prov: [{ page_no: 4 }],
      children: [],
    });
    const longPage: DoclingDocument = {
      body: {
        self_ref: '#/body',
        label: 'unspecified',
        children: [0, 1, 2].map((index) => ({ $ref: `#/texts/${index}` })),
      },
      groups: [],
      pictures: [],
      tables: [],
      texts: [paragraph(0, 'a'), paragraph(1, 'b'), paragraph(2, 'c')],
      pages: { '4': { page_no: 4 } },
    };

    expect(pageSegments(longPage)).toEqual([
      {
        page_from: 4,
        page_to: 4,
        text: `${'a'.repeat(15_000)}\n\n${'b'.repeat(15_000)}`,
      },
      { page_from: 4, page_to: 4, text: 'c'.repeat(15_000) },
    ]);
  });

  it('splits a table over 32,000 characters by rows, repeating its header in each piece', () => {
    const rows = Array.from({ length: 800 }, (_, index) =>
      cells(`Customer ${String(index).padStart(4, '0')}`, 'x'.repeat(40)),
    );
    const customerList: DoclingDocument = {
      body: {
        self_ref: '#/body',
        label: 'unspecified',
        children: [{ $ref: '#/tables/0' }],
      },
      groups: [],
      pictures: [],
      texts: [],
      tables: [
        {
          self_ref: '#/tables/0',
          label: 'table',
          prov: [{ page_no: 2 }, { page_no: 3 }],
          children: [],
          data: { grid: [headers('Customer', 'Notes'), ...rows] },
        },
      ],
      pages: { '2': { page_no: 2 }, '3': { page_no: 3 } },
    };

    const segments = pageSegments(customerList);

    expect(segments.length).toBe(2);
    for (const segment of segments) {
      expect(segment.text.length).toBeLessThanOrEqual(32_000);
      expect(
        segment.text.startsWith('| Customer | Notes |\n| --- | --- |\n'),
      ).toBe(true);
      expect([segment.page_from, segment.page_to]).toEqual([2, 3]);
    }
    const bodyRows = segments.flatMap((segment) =>
      segment.text.split('\n').slice(2),
    );
    expect(bodyRows).toEqual(
      rows.map(([name, notes]) => `| ${name!.text} | ${notes!.text} |`),
    );
  });
});
