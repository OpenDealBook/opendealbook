import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { STARTER_SCENARIO_PATHS } from '@odb/calculators';

import { CalcDealEditor } from './calc-deal-editor';
import {
  type FundingDraft,
  dealDraftFromInputs,
  emptyDealDraft,
  newFundingDraft,
} from './calc-shared';

const DEFAULTS = {
  yearBasis: 'months_from_close' as const,
  scenarioPaths: STARTER_SCENARIO_PATHS,
  minimumDscr: 1.25,
};

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {} }) }));
vi.mock('@odb/deals/server', () => ({
  saveDealCalc: async () => ({ ok: true, value: undefined }),
}));

const NO_SOURCES = {
  calcVersionId: 'calc-1',
  dealId: 'deal-1',
  canEdit: false,
  citations: [],
  documents: [],
};

function source(change: Partial<FundingDraft>): FundingDraft {
  return { ...newFundingDraft('full_term_after_standby'), ...change };
}

function render() {
  return renderToStaticMarkup(
    <CalcDealEditor
      calcVersionId={'calc-1'}
      sources={NO_SOURCES}
      initial={{
        ...emptyDealDraft(DEFAULTS),
        sales: '100000',
        annual_growth: '10',
        tax_rate: '0',
        funding: [
          source({
            type: 'sba_7a',
            amount: '360000',
            rate: '0',
            term_years: '10',
          }),
          source({
            type: 'seller_financing',
            amount: '120000',
            rate: '0',
            term_years: '5',
            standby_months: '18',
            after_standby: 'remaining_term',
          }),
        ],
      }}
      sdeVersions={[]}
      defaultAfterStandby={'full_term_after_standby'}
      dealBox={{ set: true, href: '/home/acme/underwriting' }}
    />,
  );
}

function row(html: string, label: string): string {
  const start = html.indexOf(`>${label}</td>`);
  return html.slice(start, html.indexOf('</tr>', start));
}

describe('CalcDealEditor years 1 to 3', () => {
  it('shows debt service per source and in total for each year', () => {
    const html = render();

    expect(row(html, 'SBA 7(a)')).toMatch(/\$36,000.*\$36,000.*\$36,000/);
    expect(row(html, 'Seller financing')).toMatch(/\$0.*\$17,143.*\$34,286/);
    expect(row(html, 'Total debt service')).toMatch(
      /\$36,000.*\$53,143.*\$70,286/,
    );
  });

  it('shows DSCR and net cash flow on SDE grown by the growth rate', () => {
    const html = render();

    expect(row(html, 'DSCR')).toMatch(/2\.78x.*2\.07x.*1\.72x/);
    expect(row(html, 'Net cash flow')).toMatch(/\$64,000.*\$56,857.*\$50,714/);
    expect(html).toMatch(/Yr (<!-- -->)?2(<!-- -->)?: (<!-- -->)?\$56,857/);
  });
});

describe('after-standby choice per loan', () => {
  it('refuses a remaining-term standby as long as the term and blocks saving', () => {
    const html = renderToStaticMarkup(
      <CalcDealEditor
        calcVersionId={'calc-1'}
        sources={NO_SOURCES}
        initial={{
          ...emptyDealDraft(DEFAULTS),
          funding: [
            source({
              type: 'seller_financing',
              amount: '120000',
              rate: '8',
              term_years: '5',
              standby_months: '60',
              after_standby: 'remaining_term',
            }),
          ],
        }}
        sdeVersions={[]}
        defaultAfterStandby={'full_term_after_standby'}
        dealBox={{ set: true, href: '/home/acme/underwriting' }}
      />,
    );

    expect(html).toContain(
      'Standby can&#x27;t be as long as the loan term when payments count from close.',
    );
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Save<\/button>/);
  });

  it('leaves saving open when every loan is valid', () => {
    expect(render()).not.toMatch(/<button[^>]*disabled=""[^>]*>Save<\/button>/);
  });

  it('starts a new loan from the team default', () => {
    expect(newFundingDraft('remaining_term').after_standby).toBe(
      'remaining_term',
    );
  });

  it('reads a saved loan without a choice as full term after standby', () => {
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
          type: 'seller_financing',
          amount: 1,
          rate: 0,
          term_years: 5,
          standby_months: 18,
          after_standby: null,
        },
        {
          id: 'loan-b',
          type: 'seller_financing',
          amount: 1,
          rate: 0,
          term_years: 5,
          standby_months: 18,
          after_standby: 'remaining_term',
        },
      ],
      null,
      STARTER_SCENARIO_PATHS,
    );

    expect(draft.funding.map((loan) => loan.after_standby)).toEqual([
      'full_term_after_standby',
      'remaining_term',
    ]);
  });
});

describe('fiscal year basis', () => {
  function renderFiscal(closeDate: string) {
    return renderToStaticMarkup(
      <CalcDealEditor
        calcVersionId={'calc-1'}
        sources={NO_SOURCES}
        initial={{
          ...emptyDealDraft({ ...DEFAULTS, yearBasis: 'fiscal_year' }),
          sales: '100000',
          close_date: closeDate,
          fiscal_year_end_month: '12',
          funding: [
            source({
              type: 'sba_7a',
              amount: '360000',
              rate: '0',
              term_years: '10',
            }),
          ],
        }}
        sdeVersions={[]}
        defaultAfterStandby={'full_term_after_standby'}
        dealBox={{ set: true, href: '/home/acme/underwriting' }}
      />,
    );
  }

  it('counts year 1 from close through the fiscal year end', () => {
    expect(row(renderFiscal('2026-03-15'), 'SBA 7(a)')).toMatch(
      /\$27,000.*\$36,000.*\$36,000/,
    );
  });

  it('blocks saving until the close date is filled', () => {
    const html = renderFiscal('');

    expect(html).toContain(
      'Fiscal year needs a close date and fiscal year end.',
    );
    expect(html).not.toContain('>Total debt service</td>');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Save<\/button>/);
  });

  it('starts a new calc on the team default year basis', () => {
    expect(
      emptyDealDraft({ ...DEFAULTS, yearBasis: 'fiscal_year' }).year_basis,
    ).toBe('fiscal_year');
  });

  it('reads a saved calc without a year basis as months from close', () => {
    const inputs = {
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
    };

    expect(
      dealDraftFromInputs(inputs, [], null, STARTER_SCENARIO_PATHS).year_basis,
    ).toBe('months_from_close');
    const fiscal = dealDraftFromInputs(
      {
        ...inputs,
        year_basis: {
          kind: 'fiscal_year',
          close_date: '2026-03-15',
          fiscal_year_end_month: 6,
        },
      },
      [],
      null,
      STARTER_SCENARIO_PATHS,
    );
    expect([
      fiscal.year_basis,
      fiscal.close_date,
      fiscal.fiscal_year_end_month,
    ]).toEqual(['fiscal_year', '2026-03-15', '6']);
  });
});

describe('scenario paths in the editor', () => {
  const teamPaths = {
    worst: {
      revenue_loss: 0.2,
      growth: -0.02,
      margin_change: -0.03,
      rate_shift: 0.03,
    },
    great: {
      revenue_loss: 0,
      growth: 0.08,
      margin_change: 0.01,
      rate_shift: -0.02,
    },
  };

  it('starts a new calc on the team path drivers and minimum DSCR', () => {
    const draft = emptyDealDraft({
      yearBasis: 'months_from_close',
      scenarioPaths: teamPaths,
      minimumDscr: 1.4,
    });

    expect(draft.scenario_paths.worst).toEqual({
      revenue_loss: '20',
      growth: '-2',
      margin_change: '-3',
      rate_shift: '3',
    });
    expect(draft.reference_line).toBe('1.4');
  });

  it('prefills a calc saved before paths from the team path drivers', () => {
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
      [],
      null,
      teamPaths,
    );

    expect(draft.scenario_paths.great.growth).toBe('8');
  });

  it('shows the worst, good and great paths for the draft', () => {
    const html = renderToStaticMarkup(
      <CalcDealEditor
        calcVersionId={'calc-1'}
        sources={NO_SOURCES}
        initial={{
          ...emptyDealDraft(DEFAULTS),
          sales: '400000',
          opex: '300000',
          tax_rate: '0',
          funding: [
            source({
              type: 'sba_7a',
              amount: '360000',
              rate: '6',
              term_years: '10',
            }),
          ],
        }}
        sdeVersions={[]}
        defaultAfterStandby={'full_term_after_standby'}
        dealBox={{ set: true, href: '/home/acme/underwriting' }}
      />,
    );

    expect(html).toMatch(/title="Below minimum DSCR"[^>]*>1\.01x/);
    expect(html.match(/<polyline/g)).toHaveLength(3);
  });

  it('refuses paths for a calc without revenue', () => {
    const html = renderToStaticMarkup(
      <CalcDealEditor
        calcVersionId={'calc-1'}
        sources={NO_SOURCES}
        initial={emptyDealDraft(DEFAULTS)}
        sdeVersions={[]}
        defaultAfterStandby={'full_term_after_standby'}
        dealBox={{ set: true, href: '/home/acme/underwriting' }}
      />,
    );

    expect(html).toContain('Add revenue to see scenario paths.');
  });
});

describe('scenario path driver limits', () => {
  it('refuses revenue lost above 100% and blocks saving', () => {
    const draft = emptyDealDraft(DEFAULTS);
    const html = renderToStaticMarkup(
      <CalcDealEditor
        calcVersionId={'calc-1'}
        sources={NO_SOURCES}
        initial={{
          ...draft,
          sales: '400000',
          scenario_paths: {
            ...draft.scenario_paths,
            worst: { ...draft.scenario_paths.worst, revenue_loss: '120' },
          },
        }}
        sdeVersions={[]}
        defaultAfterStandby={'full_term_after_standby'}
        dealBox={{ set: true, href: '/home/acme/underwriting' }}
      />,
    );

    expect(html).toContain(
      'Revenue lost at close must be between 0% and 100%.',
    );
    expect(html).not.toContain('<polyline');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Save<\/button>/);
  });
});

describe('money inputs and the deal box', () => {
  function editor(dealBox: { set: boolean; href: string }) {
    return renderToStaticMarkup(
      <CalcDealEditor
        calcVersionId={'calc-1'}
        sources={NO_SOURCES}
        initial={{ ...emptyDealDraft(DEFAULTS), purchase_price: '1250000' }}
        sdeVersions={[]}
        defaultAfterStandby={'full_term_after_standby'}
        dealBox={dealBox}
      />,
    );
  }

  it('shows dollar amounts with a dollar sign and thousands separators, labelled', () => {
    const html = editor({ set: true, href: '/home/acme/underwriting' });
    const id = /<label[^>]*for="([^"]+)"[^>]*>Purchase price<\/label>/.exec(
      html,
    )?.[1];

    expect(id).toBeDefined();
    expect(html).toMatch(
      new RegExp(`\\$</span><input[^>]*id="${id}"[^>]*value="1,250,000"`),
    );
  });

  it('hides the deal box gap and points to the Deal box page when the team has no deal box', () => {
    const html = editor({ set: false, href: '/home/acme/underwriting' });

    expect(html).not.toContain('Deal box gap');
    expect(html).toMatch(
      /<a href="\/home\/acme\/underwriting"[^>]*>Set your deal box to screen deals<\/a>/,
    );
  });

  it('shows the deal box gap when the team has a deal box', () => {
    expect(editor({ set: true, href: '/home/acme/underwriting' })).toContain(
      'Deal box gap',
    );
  });
});

describe('purchase multiple label', () => {
  it('says the multiple includes closing costs', () => {
    expect(render()).toContain('>Purchase multiple incl. closing costs</dt>');
  });
});

describe('funding sources at half-screen width', () => {
  it('lays each source out as its own labelled group of fields, not a wide table', () => {
    const html = render();
    const group =
      /<fieldset[^>]*aria-label="Source 2"[^>]*>[\s\S]*?<\/fieldset>/.exec(
        html,
      );

    expect(html).not.toContain('>Standby (months)</th>');
    expect(group).not.toBeNull();
    const source = group![0];
    for (const label of [
      'Type',
      'Amount',
      'Rate (%)',
      'Term (years)',
      'Standby (months)',
      'After standby',
    ]) {
      expect(source).toContain(`>${label}</label>`);
    }
    expect(source).toMatch(/aria-label="Amount, source 2"[^>]*value="120,000"/);
  });
});
