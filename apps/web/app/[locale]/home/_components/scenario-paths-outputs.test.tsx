import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { STARTER_SCENARIO_PATHS, scenarioPaths } from '@odb/calculators';

import {
  PathsChart,
  ScenarioPathsOutputs,
  chartPoints,
} from './scenario-paths-outputs';

const inputs = {
  sales: 400_000,
  sde: 100_000,
  annualGrowth: 0,
  sources: [
    { type: 'sba_7a' as const, amount: 360_000, rate: 0.06, term_years: 10 },
  ],
  dscrOptions: { mode: 'tax_adjusted' as const, taxRate: 0 },
  basis: { kind: 'months_from_close' as const },
  minimumDscr: 1.25,
  drivers: STARTER_SCENARIO_PATHS,
};

function section(html: string, title: string): string {
  const start = html.indexOf(`>${title}</h4>`);
  return html.slice(start, html.indexOf('</table>', start));
}

function row(html: string, label: string): string {
  const start = html.indexOf(`>${label}</td>`);
  return html.slice(start, html.indexOf('</tr>', start));
}

describe('ScenarioPathsOutputs', () => {
  const html = renderToStaticMarkup(
    <ScenarioPathsOutputs result={scenarioPaths(inputs)} />,
  );

  it('shows revenue, SDE, DSCR and net cash flow for 10 years per path', () => {
    const worst = section(html, 'Worst');

    expect(row(worst, 'Revenue')).toMatch(/\$360,000/);
    expect(row(worst, 'SDE')).toMatch(/\$52,800/);
    expect(row(worst, 'Net cash flow')).toMatch(/\$386/);
    expect(row(worst, 'DSCR').match(/<td/g)).toHaveLength(10);
    expect(row(section(html, 'Great'), 'SDE')).toMatch(/\$108,000.*\$113,400.*\$119,070/);
    expect(row(section(html, 'Good'), 'SDE')).toMatch(/\$100,000/);
  });

  it('highlights the years below the minimum DSCR only', () => {
    expect(row(section(html, 'Worst'), 'DSCR')).toMatch(
      /title="Below minimum DSCR"[^>]*>1\.01x/,
    );
    expect(row(section(html, 'Good'), 'DSCR')).not.toContain(
      'Below minimum DSCR',
    );
  });

  it('charts the three paths side by side', () => {
    expect(html.match(/<polyline/g)).toHaveLength(3);
    expect(html).toContain('Worst');
    expect(html).toContain('Great');
  });

  it('shows the refusal when the calc has no revenue', () => {
    const refused = renderToStaticMarkup(
      <ScenarioPathsOutputs result={scenarioPaths({ ...inputs, sales: 0 })} />,
    );

    expect(refused).toContain('Add revenue to see scenario paths.');
    expect(refused).not.toContain('<table');
  });
});

describe('chartPoints', () => {
  it('scales every series into the same box, lowest value at the bottom', () => {
    expect(chartPoints([[0, 50], [100, 0]], 200, 100)).toEqual([
      ['0,100 200,50'],
      ['0,0 200,100'],
    ]);
  });

  it('draws flat series along the middle when every value is equal', () => {
    expect(chartPoints([[5, 5], [5, 5]], 200, 100)).toEqual([
      ['0,50 200,50'],
      ['0,50 200,50'],
    ]);
  });

  it('leaves a gap where a year has no value instead of drawing zero', () => {
    expect(chartPoints([[1, 3, null, 2, 3]], 400, 100)).toEqual([
      ['0,100 100,0', '300,50 400,0'],
    ]);
  });
});

describe('PathsChart', () => {
  const result = scenarioPaths(inputs);
  if (result.status !== 'ready') {
    throw new Error(result.message);
  }

  it('charts the chosen metric for the three paths', () => {
    for (const [metric, label] of [
      ['net_cash_flow', 'Net cash flow by path'],
      ['dscr', 'DSCR by path'],
      ['sde', 'SDE by path'],
    ] as const) {
      const html = renderToStaticMarkup(
        <PathsChart paths={result.paths} metric={metric} />,
      );
      expect(html).toContain(`aria-label="${label}"`);
      expect(html.match(/<polyline/g)).toHaveLength(3);
    }
  });

  it('breaks the DSCR line for years without debt service', () => {
    const shortLoan = scenarioPaths({
      ...inputs,
      sources: [
        { type: 'seller_financing', amount: 120_000, rate: 0, term_years: 2 },
      ],
    });
    if (shortLoan.status !== 'ready') {
      throw new Error(shortLoan.message);
    }
    const html = renderToStaticMarkup(
      <PathsChart paths={shortLoan.paths} metric={'dscr'} />,
    );
    expect(html.match(/<polyline/g)).toHaveLength(3);
    expect(html).not.toMatch(/points="[^"]* 600,/);
  });

  it('marks a lone DSCR year with a dot instead of an invisible line', () => {
    const oneYearLoan = scenarioPaths({
      ...inputs,
      sources: [
        { type: 'seller_financing', amount: 120_000, rate: 0, term_years: 1 },
      ],
    });
    if (oneYearLoan.status !== 'ready') {
      throw new Error(oneYearLoan.message);
    }
    const html = renderToStaticMarkup(
      <PathsChart paths={oneYearLoan.paths} metric={'dscr'} />,
    );
    expect(html.match(/<circle/g)).toHaveLength(3);
    expect(html).not.toContain('<polyline');
  });

  it('offers a toggle between net cash flow, DSCR and SDE, starting on net cash flow', () => {
    const html = renderToStaticMarkup(<ScenarioPathsOutputs result={result} />);
    expect(html).toMatch(/aria-pressed="true"[^>]*>Net cash flow</);
    expect(html).toMatch(/aria-pressed="false"[^>]*>DSCR</);
    expect(html).toMatch(/aria-pressed="false"[^>]*>SDE</);
  });
});
