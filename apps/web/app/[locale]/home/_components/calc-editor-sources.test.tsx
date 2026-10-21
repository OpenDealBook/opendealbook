// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { STARTER_SCENARIO_PATHS } from '@odb/calculators';
import type { CalcSources } from '@odb/deals/shared';

import { CalcDealEditor } from './calc-deal-editor';
import { CalcSdeEditor } from './calc-sde-editor';
import {
  type FundingDraft,
  type SdePeriodDraft,
  dealDraftFromInputs,
  emptyDealDraft,
  emptySdePeriodDraft,
  newFundingDraft,
  periodDraftsFromRows,
} from './calc-shared';
import { CalcWorkingCapitalEditor } from './calc-working-capital-editor';
import {
  button,
  clearScreen,
  dialogText,
  fakeServer,
  field,
  press,
  show,
} from './lender-test-kit';

vi.mock('next/navigation', async () => ({
  ...(await import('./lender-test-kit')).navigation,
  useParams: () => ({ account: 'acme', id: 'deal-1' }),
}));
vi.mock('@odb/deals/server', async () =>
  (await import('./lender-test-kit')).fakeActions(
    'addCalcInputCitation',
    'removeCalcInputCitation',
    'saveDealCalc',
    'saveSdeCalc',
    'saveWorkingCapitalCalc',
  ),
);

beforeEach(() => fakeServer.reset());

function citeCounts(): string[] {
  return [
    ...document.querySelectorAll<HTMLButtonElement>(
      'button[aria-label^="Cite source for "]',
    ),
  ].map(
    (cite) =>
      `${cite.getAttribute('aria-label')}: ${cite.textContent === 'Cite' ? 0 : Number.parseInt(cite.textContent!, 10)}`,
  );
}
afterEach(clearScreen);

function citedAt(...inputs: [string | null, string][]): CalcSources {
  return {
    calcVersionId: 'calc-1',
    dealId: 'deal-1',
    canEdit: false,
    documents: [],
    citations: inputs.map(([rowId, inputKey], index) => ({
      id: `cite-${index}`,
      rowId,
      inputKey,
      documentName: `source-for-${rowId ?? 'calc'}-${inputKey}.pdf`,
      documentId: `doc-${index}`,
      documentVersion: 1,
      locator: { kind: 'page', page: 1 },
      cell: null,
      newerVersionUploaded: false,
      documentRemoved: false,
    })),
  };
}

function period(id: string, weight: string): SdePeriodDraft {
  return { ...emptySdePeriodDraft(weight), id };
}

function loan(id: string): FundingDraft {
  return { ...newFundingDraft('full_term_after_standby'), id };
}

const DEFAULTS = {
  yearBasis: 'months_from_close' as const,
  scenarioPaths: STARTER_SCENARIO_PATHS,
  minimumDscr: 1.25,
};

describe('working capital editor', () => {
  it('cites each balance sheet input', async () => {
    show(
      <CalcWorkingCapitalEditor
        calcVersionId={'calc-1'}
        initial={{
          current_assets: '1',
          current_liabilities: '',
          avg_monthly_revenue: '',
        }}
        sources={citedAt([null, 'current_liabilities'])}
      />,
    );

    expect(citeCounts()).toEqual(
      expect.arrayContaining([
        'Cite source for Current assets: 0',
        'Cite source for Average monthly revenue: 0',
      ]),
    );
    await press('Cite source for Current liabilities');
    expect(dialogText()).toContain('source-for-calc-current_liabilities.pdf');
  });
});

describe('SDE editor', () => {
  it('names each Cite button for what it does and the input it cites', () => {
    show(
      <CalcSdeEditor
        calcVersionId={'calc-1'}
        initialPeriods={[period('period-a', '1')]}
        sources={citedAt()}
      />,
    );

    const cite = button('Cite source for Sales, period 1');

    expect(cite.getAttribute('aria-label')).not.toBe(
      field('Sales, period 1').getAttribute('aria-label'),
    );
  });

  it('cites a line amount on its own period', async () => {
    show(
      <CalcSdeEditor
        calcVersionId={'calc-1'}
        initialPeriods={[period('period-a', '0.5'), period('period-b', '0.5')]}
        sources={citedAt(['period-b', 'sales'])}
      />,
    );

    expect(citeCounts()).toContain('Cite source for Sales, period 1: 0');
    await press('Cite source for Sales, period 2');
    expect(dialogText()).toContain('source-for-period-b-sales.pdf');
  });

  it('keeps a citation on its period when an earlier period is removed', async () => {
    show(
      <CalcSdeEditor
        calcVersionId={'calc-1'}
        initialPeriods={[period('period-a', '0.5'), period('period-b', '0.5')]}
        sources={citedAt(['period-b', 'sales'])}
      />,
    );

    await press('Remove period 1');

    expect(citeCounts()).toContain('Cite source for Sales, period 1: 1');
  });

  it('cites the weight, the partial year months and a custom addback by its row', () => {
    show(
      <CalcSdeEditor
        calcVersionId={'calc-1'}
        initialPeriods={[
          {
            ...period('period-a', '1'),
            custom: [{ id: 'rent-a', label: 'Rent', amount: '36000' }],
          },
        ]}
        sources={citedAt(
          ['period-a', 'weight'],
          ['period-a', 'months'],
          ['rent-a', 'amount'],
        )}
      />,
    );

    expect(citeCounts()).toEqual(
      expect.arrayContaining([
        'Cite source for Weight, period 1: 1',
        'Cite source for Partial year months, period 1: 1',
        'Cite source for Period 1 custom addbacks, amount 1: 1',
      ]),
    );
  });

  it('asks for a save before a new period can be cited, and allows it after', async () => {
    show(
      <CalcSdeEditor
        calcVersionId={'calc-1'}
        initialPeriods={[period('period-a', '1')]}
        sources={citedAt()}
      />,
    );

    await press('Add period');

    expect(button('Cite source for Sales, period 1').disabled).toBe(false);
    expect(button('Cite source for Sales, period 2').disabled).toBe(true);
    expect(button('Cite source for Sales, period 2').title).toBe(
      'Save the calc to add sources to this row',
    );

    await press('Save');

    expect(button('Cite source for Sales, period 2').disabled).toBe(false);
  });

  it('saves each period and custom addback under the id it was loaded with', async () => {
    show(
      <CalcSdeEditor
        calcVersionId={'calc-1'}
        initialPeriods={periodDraftsFromRows([
          {
            id: 'period-a',
            label: 'FY2024',
            weight: 1,
            months: null,
            created_at: '2025-01-01',
            sde_line: [
              {
                id: 'line-1',
                line_code: 'sales',
                custom_label: null,
                amount: 5,
              },
              {
                id: 'rent-a',
                line_code: 'custom',
                custom_label: 'Rent',
                amount: 9,
              },
            ],
          },
        ])}
        sources={citedAt()}
      />,
    );

    await press('Save');

    expect(fakeServer.inputsTo('saveSdeCalc')).toMatchObject([
      {
        periods: [
          {
            id: 'period-a',
            lines: [
              { line_code: 'sales', amount: 5 },
              { id: 'rent-a', line_code: 'custom', custom_label: 'Rent' },
            ],
          },
        ],
      },
    ]);
  });
});

describe('Deal editor', () => {
  function showDeal(funding: FundingDraft[], sources: CalcSources) {
    show(
      <CalcDealEditor
        calcVersionId={'calc-1'}
        initial={{ ...emptyDealDraft(DEFAULTS), funding }}
        sdeVersions={[]}
        defaultAfterStandby={'full_term_after_standby'}
        dealBox={{ set: true, href: '/home/acme/underwriting' }}
        sources={sources}
      />,
    );
  }

  it('cites P&L, deal terms, deal box, path drivers and funding source inputs', () => {
    showDeal(
      [loan('loan-a')],
      citedAt(
        [null, 'sales'],
        [null, 'purchase_price'],
        [null, 'reference_line'],
        [null, 'worst.revenue_loss'],
        ['loan-a', 'rate'],
      ),
    );

    expect(citeCounts()).toEqual(
      expect.arrayContaining([
        'Cite source for Sales: 1',
        'Cite source for COGS: 0',
        'Cite source for Purchase price: 1',
        'Cite source for Annual growth (%): 0',
        'Cite source for Minimum DSCR: 1',
        'Cite source for Required personal cash flow: 0',
        'Cite source for Revenue lost at close (%), Worst path: 1',
        'Cite source for Interest rate shift (%), Great path: 0',
        'Cite source for Amount, source 1: 0',
        'Cite source for Rate (%), source 1: 1',
        'Cite source for Term (years), source 1: 0',
        'Cite source for Standby (months), source 1: 0',
      ]),
    );
  });

  it('asks for a save before a new funding source can be cited', async () => {
    showDeal([loan('loan-a')], citedAt());

    await press('Add source');

    expect(button('Cite source for Amount, source 1').disabled).toBe(false);
    expect(button('Cite source for Amount, source 2').disabled).toBe(true);
  });

  it('keeps a citation on its funding source when an earlier one is removed', async () => {
    showDeal([loan('loan-a'), loan('loan-b')], citedAt(['loan-b', 'rate']));

    await press('Remove source 1');

    expect(citeCounts()).toContain('Cite source for Rate (%), source 1: 1');
  });

  it('loads funding sources under their stored ids', () => {
    const draft = dealDraftFromInputs(
      {
        pl: {
          sales: 0,
          cogs: 0,
          opex: 0,
          depreciation_amortization: 0,
          taxes: 0,
          interest: 0,
          owner_benefits: 0,
        },
        purchase_price: 0,
        closing_costs: 0,
        annual_growth: 0,
        required_personal_cash_flow: 0,
      },
      [
        {
          id: 'loan-a',
          type: 'sba_7a',
          amount: 1,
          rate: null,
          term_years: null,
          standby_months: null,
          after_standby: null,
        },
      ],
      null,
      STARTER_SCENARIO_PATHS,
    );

    expect(draft.funding.map((source) => source.id)).toEqual(['loan-a']);
  });
});
