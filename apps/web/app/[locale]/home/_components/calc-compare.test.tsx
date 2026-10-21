// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';

import type { CalcCitation, CalcSources } from '@odb/deals/shared';

import { parseDealCalcDefaults } from '../_lib/deal-calc-defaults';
import { CalcCompare } from './calc-compare';
import { type CalcDetail } from './calc-shared';
import { clearScreen, linkTo, pageText, press, show } from './lender-test-kit';

vi.mock('next/navigation', () => ({
  useParams: () => ({ account: 'acme', id: 'deal-1' }),
}));

afterEach(() => {
  clearScreen();
  vi.unstubAllGlobals();
});

function noSources(id: string): CalcSources {
  return {
    calcVersionId: id,
    dealId: 'deal-1',
    canEdit: false,
    citations: [],
    documents: [],
  };
}

const CALCS = '/home/acme/deals/deal-1/financials/calcs';

function dealVersion(
  id: string,
  name: string,
  terms: { purchase_price: number; funding: unknown[] },
  outputs: object,
): CalcDetail {
  return {
    version: {
      id,
      name,
      type: 'deal',
      is_primary: false,
      outputs_snapshot: outputs,
    },
    periods: [],
    input: {
      inputs: {
        pl: {
          sales: 2000000,
          cogs: 800000,
          opex: 600000,
          depreciation_amortization: 0,
          taxes: 0,
          interest: 0,
          owner_benefits: 0,
        },
        purchase_price: terms.purchase_price,
        closing_costs: 0,
        annual_growth: 0,
        required_personal_cash_flow: 0,
        dscr_mode: 'tax_adjusted',
        reference_line: 1.25,
      },
      imported_from_version_id: null,
    },
    funding_sources: terms.funding,
    sources: noSources(id),
  } as unknown as CalcDetail;
}

const base = dealVersion(
  'v-1',
  'Base case',
  {
    purchase_price: 1800000,
    funding: [
      {
        id: 'loan-a',
        type: 'sba_7a',
        amount: 1000000,
        rate: 0.1,
        term_years: 10,
        standby_months: null,
        after_standby: null,
      },
    ],
  },
  { net_income: 600000, dscr: 1.5, purchase_multiple: 3, deal_box_gap: 50000 },
);
const stretch = dealVersion(
  'v-2',
  'Stretch offer',
  {
    purchase_price: 2000000,
    funding: [
      {
        id: 'loan-b',
        type: 'sba_7a',
        amount: 900000,
        rate: 0.1,
        term_years: 10,
        standby_months: null,
        after_standby: null,
      },
    ],
  },
  {
    net_income: 600000,
    dscr: 1.3,
    purchase_multiple: 3.33,
    deal_box_gap: 20000,
  },
);

function summary(id: string, name: string | null, created_at: string) {
  return {
    id,
    name,
    type: 'deal',
    created_at,
    updated_at: new Date(2026, 9, 20, 15, 14).toISOString(),
    outputs_snapshot: { dscr: 1 },
  };
}

const VERSIONS = [
  summary('v-1', 'Base case', '2026-10-01T00:00:00Z'),
  summary('v-2', 'Stretch offer', '2026-10-02T00:00:00Z'),
  summary('v-3', 'Lender view', '2026-10-03T00:00:00Z'),
];

function showCompare(
  dealBoxSet = true,
  a = base,
  b = stretch,
  versions = VERSIONS,
) {
  show(
    <CalcCompare
      a={a}
      b={b}
      versions={versions}
      defaults={parseDealCalcDefaults(null)}
      dealBoxSet={dealBoxSet}
      calcsHref={CALCS}
    />,
  );
}

function rows(section: string, label: string) {
  const table = document.querySelector(`[aria-label="${section}"]`)!;

  return [...table.querySelectorAll('tbody tr')]
    .filter((tr) => tr.querySelector('td span')?.textContent === label)
    .map((tr) =>
      [...tr.querySelectorAll('td')].map((cell) => cell.textContent),
    );
}

function row(section: string, label: string) {
  const [found] = rows(section, label);

  if (!found) {
    throw new Error(`No ${section} row "${label}"`);
  }

  return found;
}

it('puts two versions side by side and marks the inputs and outputs that differ', () => {
  showCompare();

  expect(row('Inputs', 'Purchase price')).toEqual([
    'Purchase price (changed)',
    '$1,800,000',
    '$2,000,000',
  ]);
  expect(row('Inputs', 'Sales')).toEqual(['Sales', '$2,000,000', '$2,000,000']);
  expect(row('Inputs', 'Amount, source 1')).toEqual([
    'Amount, source 1 (changed)',
    '$1,000,000',
    '$900,000',
  ]);
  expect(row('Outputs', 'DSCR (tax adjusted)')).toEqual([
    'DSCR (tax adjusted) (changed)',
    '1.50x',
    '1.30x',
  ]);
  expect(row('Outputs', 'Purchase multiple incl. closing costs')).toEqual([
    'Purchase multiple incl. closing costs (changed)',
    '3.00x',
    '3.33x',
  ]);
  expect(row('Outputs', 'Net income')).toEqual([
    'Net income',
    '$600,000',
    '$600,000',
  ]);
});

it('tells two unnamed versions apart in the headers and pickers', () => {
  const unnamed = VERSIONS.map((version) => ({ ...version, name: null }));
  const unnamedSide = (detail: CalcDetail, index: number) =>
    ({ ...detail, version: { ...detail.version, ...unnamed[index] } }) as CalcDetail;

  showCompare(true, unnamedSide(base, 0), unnamedSide(stretch, 1), unnamed);

  expect(
    [
      ...document.querySelectorAll('[aria-label="Inputs"] thead th'),
    ].map((th) => th.textContent),
  ).toEqual([
    '',
    'Deal v1, saved Oct 20 3:14 PM',
    'Deal v2, saved Oct 20 3:14 PM',
  ]);
  expect(
    [...document.querySelectorAll('[aria-label="Version A"] a')].map(
      (a) => a.textContent,
    ),
  ).toEqual(['Deal v1, saved Oct 20 3:14 PM', 'Deal v3, saved Oct 20 3:14 PM']);
});

it('lets either side switch to another version of the same calc, never the one on the other side', () => {
  showCompare();

  expect(linkTo('Lender view')).toBe(`${CALCS}/compare?a=v-3&b=v-2`);
  expect(
    [...document.querySelectorAll('[aria-label="Version B"] a')].map((a) => [
      a.textContent,
      a.getAttribute('href'),
    ]),
  ).toEqual([
    ['Stretch offer', `${CALCS}/compare?a=v-1&b=v-2`],
    ['Lender view', `${CALCS}/compare?a=v-1&b=v-3`],
  ]);
});

it('leaves out the deal box gap when no deal box is set', () => {
  showCompare(false);

  expect(pageText()).not.toContain('Deal box gap');
});

function sdeVersion(id: string, rents: number[]): CalcDetail {
  return {
    version: {
      id,
      name: id,
      type: 'sde',
      is_primary: false,
      outputs_snapshot: {},
    },
    periods: [
      {
        id: `${id}-period`,
        label: 'FY2024',
        weight: 1,
        months: null,
        created_at: '2025-01-01',
        sde_line: rents.map((amount, index) => ({
          id: `${id}-rent-${index}`,
          line_code: 'custom',
          custom_label: 'Rent',
          amount,
        })),
      },
    ],
    input: null,
    funding_sources: [],
    sources: noSources(id),
  } as unknown as CalcDetail;
}

it('keeps custom SDE lines that share a label as separate rows', () => {
  showCompare(
    true,
    sdeVersion('s-1', [36000, 12000]),
    sdeVersion('s-2', [36000, 15000]),
  );

  expect(rows('Inputs', 'Rent')).toEqual([
    ['Rent', '$36,000', '$36,000'],
    ['Rent (changed)', '$12,000', '$15,000'],
  ]);
});

function citing(
  detail: CalcDetail,
  ...citations: Partial<CalcCitation>[]
): CalcDetail {
  return {
    ...detail,
    sources: {
      ...detail.sources,
      citations: citations.map((citation, index) => ({
        id: `${detail.version.id}-cite-${index}`,
        rowId: null,
        inputKey: 'sales',
        documentId: 'doc-pnl',
        documentName: 'p-and-l.pdf',
        documentVersion: 1,
        locator: { kind: 'page', page: 4 },
        cell: null,
        newerVersionUploaded: false,
        documentRemoved: false,
        ...citation,
      })),
    },
  };
}

it("shows each version's sources for an input side by side", () => {
  showCompare(
    true,
    citing(
      base,
      { inputKey: 'sales' },
      {
        rowId: 'loan-a',
        inputKey: 'amount',
        locator: { kind: 'page', page: 9 },
      },
      { inputKey: 'worst.growth', locator: { kind: 'page', page: 2 } },
    ),
    citing(
      stretch,
      {
        rowId: 'loan-b',
        inputKey: 'amount',
        documentName: 'term-sheet.pdf',
        locator: { kind: 'document' },
      },
      {
        inputKey: 'sales',
        documentId: 'doc-book',
        documentName: 'tax-returns.xlsx',
        documentVersion: 2,
        locator: { kind: 'sheet', sheet: '2023' },
        newerVersionUploaded: true,
      },
    ),
  );

  expect(row('Inputs', 'Sales')).toEqual([
    'Sales',
    '$2,000,000p-and-l.pdf v1, page 4',
    '$2,000,000tax-returns.xlsx v2, sheet 2023Newer version uploaded',
  ]);
  expect(row('Inputs', 'Amount, source 1')).toEqual([
    'Amount, source 1 (changed)',
    '$1,000,000p-and-l.pdf v1, page 9',
    '$900,000term-sheet.pdf v1',
  ]);
  const [, worstGrowth] = rows('Inputs', 'Annual growth');
  expect(worstGrowth?.[1]).toBe('0%p-and-l.pdf v1, page 2');
});

it('opens a compared source in the data room window', async () => {
  const opened: string[] = [];
  vi.stubGlobal('open', (url: string) => {
    opened.push(url);
    return null;
  });
  showCompare(true, citing(base, { inputKey: 'sales' }), stretch);

  await press('p-and-l.pdf v1, page 4');

  expect(opened).toEqual([
    '/deal-windows/acme/deal-1/data-room/view?doc=doc-pnl&page=4',
  ]);
});
